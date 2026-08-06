import assert from "node:assert/strict";
import test from "node:test";
import { validateComfyObjectInfo, validateWorkflowMapping } from "../server/comfy.mjs";
import fs from "node:fs/promises";

const workflow = {
  "1": { class_type: "UNETLoader", inputs: { unet_name: "anima.safetensors" } },
  "6": { class_type: "KSampler", inputs: { seed: 1, steps: 20, cfg: 5, sampler_name: "er_sde", scheduler: "simple" } },
  "14": { class_type: "SaveImage", inputs: { filename_prefix: "AniMessenger/test", images: ["6", 0] } },
  "57": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["20", 0] } },
  "58": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["20", 0] } },
  "59": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1536 } },
};

const mapping = {
  fields: {
    positive_prompt: { node_id: "57", input: "text" },
    negative_prompt: { node_id: "58", input: "text" },
    seed: { node_id: "6", input: "seed" },
    width: { node_id: "59", input: "width" },
    height: { node_id: "59", input: "height" },
    steps: { node_id: "6", input: "steps" },
    cfg: { node_id: "6", input: "cfg" },
    sampler: { node_id: "6", input: "sampler_name" },
    scheduler: { node_id: "6", input: "scheduler" },
    diffusion_model: { node_id: "1", input: "unet_name" },
    filename_prefix: { node_id: "14", input: "filename_prefix" },
  },
};

test("validates every required AniMessenger workflow mapping", () => {
  assert.deepEqual(validateWorkflowMapping(workflow, mapping), []);
  const broken = structuredClone(mapping);
  delete broken.fields.negative_prompt;
  const issues = validateWorkflowMapping(workflow, broken);
  assert.equal(issues.length, 1);
  assert.match(issues[0].title, /negative_prompt/);
});

test("reports missing ComfyUI nodes and installed model choices", () => {
  const objectInfo = {
    UNETLoader: { input: { required: { unet_name: [["other.safetensors"]] } } },
    KSampler: { input: { required: { sampler_name: [["er_sde"]], scheduler: [["simple"]] } } },
    SaveImage: { input: { required: {} } },
    CLIPTextEncode: { input: { required: {} } },
    EmptyLatentImage: { input: { required: {} } },
  };
  const issues = validateComfyObjectInfo(workflow, objectInfo);
  assert.equal(issues.length, 1);
  assert.match(issues[0].title, /anima\.safetensors/);

  delete objectInfo.KSampler;
  const missingNodeIssues = validateComfyObjectInfo(workflow, objectInfo);
  assert.ok(missingNodeIssues.some((issue) => /KSampler/.test(issue.title)));
});

test("the standard-node ANIMA test workflow chains three model-only LoRA loaders", async () => {
  const [testWorkflow, testMapping] = await Promise.all([
    fs.readFile(new URL("../workflows/anima-fast-standard-loras-api.json", import.meta.url), "utf8").then(JSON.parse),
    fs.readFile(new URL("../workflows/anima-fast-standard-loras-api.mapping.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.deepEqual(validateWorkflowMapping(testWorkflow, testMapping), []);
  assert.equal(testWorkflow["5"].class_type, "LoraLoaderModelOnly");
  assert.equal(testWorkflow["60"].class_type, "LoraLoaderModelOnly");
  assert.equal(testWorkflow["61"].class_type, "LoraLoaderModelOnly");
  assert.deepEqual(testWorkflow["5"].inputs.model, ["1", 0]);
  assert.deepEqual(testWorkflow["60"].inputs.model, ["5", 0]);
  assert.deepEqual(testWorkflow["61"].inputs.model, ["60", 0]);
  assert.deepEqual(testWorkflow["6"].inputs.model, ["61", 0]);
  assert.equal(testWorkflow["5"].inputs.strength_model, 1);
  assert.equal(testWorkflow["60"].inputs.strength_model, 0.9);
  assert.equal(typeof testWorkflow["61"].inputs.lora_name, "string");
  assert.ok(testWorkflow["61"].inputs.lora_name.endsWith(".safetensors"));
  assert.ok(Number.isFinite(testWorkflow["61"].inputs.strength_model));
});

test("the recommended ANIMA workflow uses only built-in node types and two LoRAs", async () => {
  const [recommendedWorkflow, recommendedMapping] = await Promise.all([
    fs.readFile(new URL("../workflows/anima-recommended-api.json", import.meta.url), "utf8").then(JSON.parse),
    fs.readFile(new URL("../workflows/anima-recommended-api.mapping.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.deepEqual(validateWorkflowMapping(recommendedWorkflow, recommendedMapping), []);
  assert.equal(recommendedWorkflow["5"].class_type, "LoraLoaderModelOnly");
  assert.equal(recommendedWorkflow["60"].class_type, "LoraLoaderModelOnly");
  assert.deepEqual(recommendedWorkflow["60"].inputs.model, ["5", 0]);
  assert.deepEqual(recommendedWorkflow["6"].inputs.model, ["60", 0]);
  assert.ok(!Object.values(recommendedWorkflow).some((node) => node.class_type === "Lora Loader (LoraManager)"));
});
