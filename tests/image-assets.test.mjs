import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { imageAssetPath, validateImageAssetManifest } from "../server/image-assets.mjs";

const manifestUrl = new URL("../workflows/animessenger-anima-assets.json", import.meta.url);

test("the recommended ANIMA asset manifest is complete and valid", async () => {
  const manifest = JSON.parse(await fs.readFile(manifestUrl, "utf8"));
  assert.deepEqual(validateImageAssetManifest(manifest), []);
  assert.equal(manifest.assets.length, 5);
  assert.equal(manifest.totalBytes, manifest.assets.reduce((total, asset) => total + asset.bytes, 0));
  assert.ok(manifest.assets.every((asset) => asset.required));
  assert.deepEqual(new Set(manifest.assets.map((asset) => asset.kind)), new Set(["diffusion_model", "text_encoder", "vae", "lora"]));
});

test("manifest validation rejects unsafe filenames and duplicate targets", () => {
  const asset = {
    id: "one",
    kind: "lora",
    required: true,
    filename: "../unsafe.safetensors",
    targetSubdirectory: "loras",
    bytes: 1,
    sha256: "a".repeat(64),
    source: { pageUrl: "https://example.com/model", downloadUrl: "https://example.com/download" },
  };
  const problems = validateImageAssetManifest({
    schemaVersion: 1,
    id: "test",
    workflow: "workflow.json",
    mapping: "mapping.json",
    assets: [asset, { ...asset }],
  });
  assert.ok(problems.some((problem) => /plain \.safetensors filename/.test(problem)));
  assert.ok(problems.some((problem) => /duplicates/.test(problem)));
});

test("asset paths stay inside supported ComfyUI model directories", () => {
  const result = imageAssetPath("C:/ComfyUI/models", { targetSubdirectory: "vae", filename: "anima.safetensors" });
  assert.equal(result, path.resolve("C:/ComfyUI/models", "vae", "anima.safetensors"));
  assert.throws(() => imageAssetPath("C:/ComfyUI/models", { targetSubdirectory: "..", filename: "anima.safetensors" }), /Unsupported/);
});
