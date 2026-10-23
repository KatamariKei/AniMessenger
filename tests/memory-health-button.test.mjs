import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("memory health refresh has explicit readable normal, hover, focus and loading styles", async () => {
  const css = await fs.readFile(new URL("../src/local.css", import.meta.url), "utf8");
  const rule = css.match(/\.memory-health-heading button \{([^}]+)\}/)?.[1] || "";
  assert.match(rule, /appearance: none/);
  assert.match(rule, /min-height: 44px/);
  assert.match(rule, /background: #1c3435/);
  assert.match(rule, /color: #8ce6dc/);
  assert.match(css, /\.memory-health-heading button:focus-visible \{ outline: 2px solid/);
  assert.match(css, /\.memory-health-heading button:disabled \{[^}]*color: #a7bbc0/);
});
