import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function picker() {
  const source = fs.readFileSync(new URL("../src/ModelPicker.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const hooks = [];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const react = {
    useId: () => "model",
    useRef(value) { const slot = cursor++; return hooks[slot] ??= { current: value }; },
    useState(initial) {
      const slot = cursor++;
      if (!(slot in hooks)) hooks[slot] = initial;
      return [hooks[slot], value => { hooks[slot] = typeof value === "function" ? value(hooks[slot]) : value; }];
    },
    useEffect() {}, useLayoutEffect() {},
  };
  const props = { label: "Chat model", value: "", models: ["gemma4:12b", "gemma4:26b"], placeholder: "Choose", onChange: value => { props.value = value; } };
  const sandbox = { exports: {}, document: { body: {} }, require: name => ({ react, "react/jsx-runtime": { jsx, jsxs: jsx }, "react-dom": { createPortal: node => node } })[name] };
  vm.runInNewContext(code, sandbox);
  const render = () => { cursor = 0; return sandbox.exports.ModelPicker(props); };
  const input = () => render().props.children[1];
  const options = () => render().props.children[2].props.children;
  input().props.onFocus();
  return { props, input, options };
}

const pointer = (patch = {}) => ({ isPrimary: true, button: 0, pointerId: 1, pointerType: "touch", clientX: 20, clientY: 50, preventDefault() {}, ...patch });

test("a mobile model tap survives input blur and updates the controlled field", () => {
  const view = picker();
  const option = view.options()[1];
  let prevented = false;
  option.props.onPointerDown(pointer({ preventDefault() { prevented = true; } }));
  assert.equal(prevented, false, "touch must retain its native click");
  view.input().props.onBlur();
  assert.equal(view.input().props["aria-expanded"], true);
  option.props.onPointerUp(pointer());
  view.input().props.onBlur();
  assert.equal(view.input().props["aria-expanded"], true, "blur after touch release must not remove the option before its click");
  option.props.onClick({ detail: 1 });
  assert.equal(view.input().props.value, "gemma4:26b");
  assert.equal(view.input().props["aria-expanded"], false);
});

test("scrolling or cancelling a touch does not select a model", () => {
  for (const cancelled of [false, true]) {
    const view = picker();
    const option = view.options()[1];
    option.props.onPointerDown(pointer());
    if (cancelled) option.props.onPointerCancel();
    else option.props.onPointerMove(pointer({ clientY: 100 }));
    option.props.onPointerUp(pointer({ clientY: cancelled ? 50 : 100 }));
    option.props.onClick({ detail: 1 });
    assert.equal(view.props.value, "");
    assert.equal(view.input().props["aria-expanded"], true);
  }
});

test("mouse and keyboard model selection still work", () => {
  const mouse = picker();
  const option = mouse.options()[1];
  option.props.onPointerDown(pointer({ pointerType: "mouse" }));
  option.props.onPointerUp(pointer({ pointerType: "mouse" }));
  assert.equal(mouse.props.value, "");
  option.props.onClick({ detail: 1 });
  assert.equal(mouse.input().props.value, "gemma4:26b");
  const keyboard = picker();
  keyboard.input().props.onKeyDown({ key: "ArrowDown", preventDefault() {} });
  keyboard.input().props.onKeyDown({ key: "Enter", preventDefault() {} });
  assert.equal(keyboard.input().props.value, "gemma4:12b");
});
