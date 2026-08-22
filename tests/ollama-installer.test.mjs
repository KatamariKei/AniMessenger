import assert from "node:assert/strict";
import test from "node:test";
import { applyOllamaPullProgress, recommendedOllamaDownloads } from "../server/ollama-installer.mjs";

test("recommended Ollama downloads expose distinct hardware tiers", () => {
  assert.deepEqual(recommendedOllamaDownloads.map((item) => item.tier), ["light", "recommended", "high-end"]);
  assert.equal(recommendedOllamaDownloads[1].model, "gemma4:12b");
  assert.ok(recommendedOllamaDownloads.every((item) => item.approximateBytes > 0));
});

test("Ollama pull progress updates the public download counters", () => {
  const job = { message: "", totalBytes: 1, completedBytes: 0 };
  applyOllamaPullProgress(job, { status: "pulling manifest" });
  applyOllamaPullProgress(job, { status: "pulling layer", total: 1000, completed: 425 });
  assert.deepEqual(job, { message: "pulling layer", totalBytes: 1000, completedBytes: 425 });
});

test("Ollama layer progress accumulates instead of jumping backward", () => {
  const job = { message: "", totalBytes: 1000, completedBytes: 0, layers: new Map() };
  applyOllamaPullProgress(job, { status: "pulling layer-a", digest: "a", total: 400, completed: 400 });
  applyOllamaPullProgress(job, { status: "pulling layer-b", digest: "b", total: 300, completed: 150 });
  assert.equal(job.totalBytes, 1000);
  assert.equal(job.completedBytes, 550);
});

test("Ollama pull errors are surfaced", () => {
  assert.throws(() => applyOllamaPullProgress({}, { error: "model not found" }), /model not found/);
});
