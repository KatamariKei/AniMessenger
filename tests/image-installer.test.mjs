import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import http from "node:http";
import { comfyOutputDirectoryFromSystemStats, detectComfyModelsDirectories, ensureStandardComfyOutputDirectory, imagePackInstallStatus, imagePackStatus, prepareComfyOutputDirectory, startImagePackInstall, validateModelsDirectory } from "../server/image-installer.mjs";

function tinyManifest(body = "abc") {
  return {
    schemaVersion: 1,
    id: "test-pack",
    workflow: "workflow.json",
    mapping: "mapping.json",
    totalBytes: Buffer.byteLength(body),
    authentication: { provider: "Civitai", required: true, accountUrl: "https://example.com/account", storage: "memory-only" },
    assets: [{
      id: "test-lora",
      kind: "lora",
      required: true,
      filename: "test.safetensors",
      targetSubdirectory: "loras",
      bytes: Buffer.byteLength(body),
      sha256: crypto.createHash("sha256").update(body).digest("hex"),
      source: { pageUrl: "https://example.com/model", downloadUrl: "https://example.com/download" },
    }],
  };
}

test("model-folder validation only accepts an existing folder named models", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-models-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const models = path.join(root, "models");
  await fs.mkdir(models);
  assert.equal(await validateModelsDirectory(models), path.resolve(models));
  await assert.rejects(validateModelsDirectory(root), /folder named models/);
});

test("the standard ComfyUI output folder is safely created beside a validated models folder", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-output-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const models = path.join(root, "models");
  await fs.mkdir(models);
  const output = await ensureStandardComfyOutputDirectory(models);
  assert.equal(output, path.resolve(root, "output"));
  assert.equal((await fs.stat(output)).isDirectory(), true);
  await assert.rejects(ensureStandardComfyOutputDirectory(root), /folder named models/);
});

test("ComfyUI launch details reveal custom and base output folders", () => {
  assert.equal(
    comfyOutputDirectoryFromSystemStats({ system: { argv: ["main.py", "--base-directory", path.resolve("custom-comfy")] } }),
    path.resolve("custom-comfy", "output"),
  );
  assert.equal(
    comfyOutputDirectoryFromSystemStats({ system: { argv: ["main.py", `--output-directory=${path.resolve("custom-output")}`] } }),
    path.resolve("custom-output"),
  );
  assert.equal(comfyOutputDirectoryFromSystemStats({ system: { argv: ["main.py"] } }), "");
});

test("a malformed ComfyUI output report can never replace the finished-images folder with models", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-output-guard-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const models = path.join(root, "models");
  await fs.mkdir(models);
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ system: { argv: ["main.py", "--base-directory", root, "--output-directory", models] } }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();

  const output = await prepareComfyOutputDirectory({ modelsDirectory: models, comfyUrl: `http://127.0.0.1:${address.port}` });
  assert.equal(output, path.resolve(root, "output"));
  assert.notEqual(output, path.resolve(models));
});

test("image-pack status distinguishes missing, verified, and invalid assets", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-pack-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const models = path.join(root, "models");
  const loras = path.join(models, "loras");
  await fs.mkdir(loras, { recursive: true });
  const manifest = tinyManifest();

  assert.equal((await imagePackStatus(manifest, models)).assets[0].state, "missing");
  await fs.writeFile(path.join(loras, "test.safetensors"), "abc");
  assert.equal((await imagePackStatus(manifest, models)).assets[0].state, "installed");
  await fs.writeFile(path.join(loras, "test.safetensors"), "abd");
  assert.equal((await imagePackStatus(manifest, models)).assets[0].state, "invalid");
});

test("configured ComfyUI model folders are detected without scanning deeply", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-detect-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const models = path.join(root, "models");
  await fs.mkdir(models);
  const candidates = await detectComfyModelsDirectories({ configured: models });
  assert.ok(candidates.some((candidate) => candidate.toLowerCase() === path.resolve(models).toLowerCase()));
});

test("detection ranks the models folder containing matching pack files first", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-rank-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const emptyModels = path.join(root, "empty", "models");
  const readyModels = path.join(root, "ready", "models");
  await fs.mkdir(emptyModels, { recursive: true });
  await fs.mkdir(path.join(readyModels, "loras"), { recursive: true });
  await fs.writeFile(path.join(readyModels, "loras", "test.safetensors"), "abc");
  const candidates = await detectComfyModelsDirectories({ configured: emptyModels, outputDirectory: path.join(root, "ready", "output"), manifest: tinyManifest() });
  assert.equal(candidates[0], path.resolve(readyModels));
});

test("downloads cannot start until provider terms are accepted", async () => {
  await assert.rejects(startImagePackInstall(tinyManifest(), { modelsDirectory: "", acceptedTerms: false }), /accept/);
});

test("a download is streamed, checksum-verified, and moved into the mapped folder", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-download-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const models = path.join(root, "models");
  await fs.mkdir(models);
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/octet-stream", "content-length": "3" });
    response.end("abc");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const manifest = tinyManifest();
  manifest.assets[0].source.downloadUrl = `http://127.0.0.1:${address.port}/test.safetensors`;
  const started = await startImagePackInstall(manifest, { modelsDirectory: models, acceptedTerms: true, apiToken: "temporary-test-token" });
  let result = started;
  for (let attempt = 0; attempt < 50 && ["queued", "downloading"].includes(result.status); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    result = imagePackInstallStatus(started.id);
  }
  assert.equal(result.status, "complete");
  assert.equal(await fs.readFile(path.join(models, "loras", "test.safetensors"), "utf8"), "abc");
});
