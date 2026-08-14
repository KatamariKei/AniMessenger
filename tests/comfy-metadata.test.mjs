import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { characterImageOutputPrefix, isAnimaDiffusionModel, selectedDiffusionModel, syncUiWorkflow } from "../server/comfy.mjs";

test("ANIMA model discovery excludes similarly named animation models", () => {
  assert.equal(isAnimaDiffusionModel("waiANIMA_v10Base10.safetensors"), true);
  assert.equal(isAnimaDiffusionModel("variants/anima_xl_v2.safetensors"), true);
  assert.equal(isAnimaDiffusionModel("Wan2_2_Animate_14B_fp8.safetensors"), false);
  assert.equal(isAnimaDiffusionModel("wan_animation_model.safetensors"), false);
});

test("a saved ANIMA model overrides the workflow default without changing the mapping", () => {
  const mapping = { defaults: { model_name: "waiANIMA_v10Base10.safetensors" } };
  assert.equal(selectedDiffusionModel({}, mapping), "waiANIMA_v10Base10.safetensors");
  assert.equal(selectedDiffusionModel({ comfyDiffusionModel: "waiANIMA_v11Variant.safetensors" }, mapping), "waiANIMA_v11Variant.safetensors");
  assert.equal(mapping.defaults.model_name, "waiANIMA_v10Base10.safetensors");
});

test("embedded Comfy workflow receives exact per-image settings", async () => {
  const [mapping, uiWorkflow] = await Promise.all([
    fs.readFile(new URL("../workflows/anima-fast-animessenger-api.mapping.json", import.meta.url), "utf8").then(JSON.parse),
    fs.readFile(new URL("../workflows/anima-fast-animessenger-ui.json", import.meta.url), "utf8").then(JSON.parse),
  ]);

  syncUiWorkflow(uiWorkflow, mapping, {
    positive_prompt: "exact positive prompt",
    negative_prompt: "exact negative prompt",
    seed: 123456,
    width: 1024,
    height: 1024,
    steps: 18,
    cfg: 4.5,
    sampler: "er_sde",
    scheduler: "simple",
    diffusion_model: "waiANIMA_v10Base10.safetensors",
    filename_prefix: "AniMessenger/Futaba Sakura/2026-07-14/ANIMA",
  });

  const node = (id) => uiWorkflow.nodes.find((candidate) => candidate.id === id);
  assert.equal(node(57).widgets_values[0], "exact positive prompt");
  assert.equal(node(58).widgets_values[0], "exact negative prompt");
  assert.deepEqual(node(6).widgets_values.slice(0, 6), [123456, "fixed", 18, 4.5, "er_sde", "simple"]);
  assert.deepEqual(node(59).widgets_values.slice(0, 2), [1024, 1024]);
  assert.equal(node(1).widgets_values[0], "waiANIMA_v10Base10.safetensors");
  assert.equal(node(14).widgets_values[0], "AniMessenger/Futaba Sakura/2026-07-14/ANIMA");
  assert.ok(uiWorkflow.nodes.every((candidate) => Array.isArray(candidate.pos)));
});

test("Comfy output is organized by character and date", () => {
  const prefix = characterImageOutputPrefix(
    { character: { name: "Futaba: Sakura?" } },
    new Date("2026-07-14T19:30:00.000Z"),
  );
  assert.equal(prefix, "AniMessenger/Futaba- Sakura-/2026-07-14/ANIMA");
});

test("the experimental standard-LoRA UI workflow stays editable while preserving its manual test strength", async () => {
  const [mapping, uiWorkflow, apiWorkflow] = await Promise.all([
    fs.readFile(new URL("../workflows/anima-fast-standard-loras-api.mapping.json", import.meta.url), "utf8").then(JSON.parse),
    fs.readFile(new URL("../workflows/anima-fast-standard-loras-ui.json", import.meta.url), "utf8").then(JSON.parse),
    fs.readFile(new URL("../workflows/anima-fast-standard-loras-api.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  syncUiWorkflow(uiWorkflow, mapping, {
    positive_prompt: "section one\n\nsection two",
    negative_prompt: "low quality",
    seed: 987,
    width: 768,
    height: 1152,
    steps: 20,
    cfg: 4,
    sampler: "er_sde",
    scheduler: "simple",
    diffusion_model: "waiANIMA_v10Base10.safetensors",
    filename_prefix: "AniMessenger/Workflow Tests/ANIMA-Standard-LoRA",
  });
  const node = (id) => uiWorkflow.nodes.find((candidate) => candidate.id === id);
  assert.equal(node(57).widgets_values[0], "section one\n\nsection two");
  assert.equal(node(5).type, "LoraLoaderModelOnly");
  assert.equal(node(60).type, "LoraLoaderModelOnly");
  assert.equal(node(61).type, "LoraLoaderModelOnly");
  assert.equal(node(61).widgets_values[0], apiWorkflow["61"].inputs.lora_name);
  // The companion UI workflow is a manual tuning surface. The optional third
  // LoRA is intentionally tested at 0.8 while the API experiment keeps
  // its conservative automated default at 0.1.
  assert.equal(node(61).widgets_values[1], 0.8);
  assert.equal(apiWorkflow["61"].inputs.strength_model, 0.1);
  assert.ok(uiWorkflow.nodes.every((candidate) => Array.isArray(candidate.pos)));
});
