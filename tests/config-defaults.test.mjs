import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultConfig, discoverLegacyConfig, normalizeConfigPaths } from "../server/config.mjs";

test("new installs use the approved global ANIMA quality prompts", () => {
  assert.equal(
    defaultConfig.globalPositivePrompt,
    "masterpiece, best quality, amazing quality, very aesthetic, amazing detail, sensitive, absurdres, newest, highres, year 2025, score_9, score_8, SOLO",
  );
  assert.equal(
    defaultConfig.globalNegativePrompt,
    "worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts, sepia, low quality, worst quality, blurry, bad anatomy, extra limbs, deformed, watermark, text, signature, artifacts, hands, copyrights name, jpeg_artifacts, scan_artifacts, bad hands, missing fingers, extra digit, fewer digits, artistic error, ye-pop, deviantart, logo, patreon logo, 3D",
  );
});

test("sound feedback starts restrained and its saved volume stays in range", () => {
  assert.equal(defaultConfig.soundEnabled, true);
  assert.equal(defaultConfig.soundVolume, 0.35);
  assert.equal(defaultConfig.bondSound, "celebration");
  assert.equal(normalizeConfigPaths({ soundVolume: 4 }).soundVolume, 1);
  assert.equal(normalizeConfigPaths({ soundVolume: -2 }).soundVolume, 0);
  assert.equal(normalizeConfigPaths({ bondSound: "heartbeat" }).bondSound, "heartbeat");
  assert.equal(normalizeConfigPaths({ bondSound: "unknown" }).bondSound, "celebration");
});

test("an earlier local config is discovered generically for one-time migration", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-config-migration-"));
  const destination = path.join(directory, "animessenger.config.json");
  const earlierPath = path.join(directory, "prototype.config.json");
  await fs.writeFile(earlierPath, JSON.stringify({
    ollamaUrl: "http://127.0.0.1:11434",
    chatModel: "gemma4:12b",
    comfyUrl: "http://127.0.0.1:8188",
  }));
  await fs.writeFile(path.join(directory, "unrelated.config.json"), JSON.stringify({ theme: "dark" }));
  const discovered = await discoverLegacyConfig(directory, destination);
  assert.equal(discovered?.path, earlierPath);
  assert.equal(discovered?.value.chatModel, "gemma4:12b");
  await fs.rm(directory, { recursive: true, force: true });
});

test("a saved models folder can never remain configured as the finished-images folder", () => {
  const root = path.resolve("test-comfy");
  const models = path.join(root, "models");
  const repaired = normalizeConfigPaths({ comfyModelsDir: models, comfyOutputDir: models });
  assert.equal(repaired.comfyOutputDir, path.join(root, "output"));

  const customOutput = path.resolve("custom-finished-images");
  const preserved = normalizeConfigPaths({ comfyModelsDir: models, comfyOutputDir: customOutput });
  assert.equal(preserved.comfyOutputDir, customOutput);
});
