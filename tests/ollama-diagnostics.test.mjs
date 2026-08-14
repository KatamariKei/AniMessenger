import assert from "node:assert/strict";
import test from "node:test";
import { classifyOllamaAllocation, gpuCheckGenerateBody } from "../server/ollama-diagnostics.mjs";

test("Ollama allocation recognizes full GPU use", () => {
  const result = classifyOllamaAllocation({ size: 10_000, size_vram: 10_000, context_length: 4096 });
  assert.equal(result.status, "ready");
  assert.equal(result.gpuPercent, 100);
  assert.equal(result.contextLength, 4096);
});

test("Ollama allocation recognizes partial CPU offloading", () => {
  const result = classifyOllamaAllocation({ size: 10_000, size_vram: 6_100 });
  assert.equal(result.status, "partial");
  assert.equal(result.gpuPercent, 61);
  assert.equal(result.cpuPercent, 39);
});

test("Ollama allocation recognizes CPU-only execution", () => {
  const result = classifyOllamaAllocation({ size: 10_000, size_vram: 0 });
  assert.equal(result.status, "cpu");
  assert.equal(result.gpuPercent, 0);
});

test("the normal GPU check respects Ollama's configured context", () => {
  const body = gpuCheckGenerateBody("gemma4:12b");
  assert.equal("num_ctx" in body.options, false);
});

test("the optimization fallback explicitly tests a conservative 4K context", () => {
  const body = gpuCheckGenerateBody("gemma4:12b", { optimize: true });
  assert.equal(body.options.num_ctx, 4096);
});
