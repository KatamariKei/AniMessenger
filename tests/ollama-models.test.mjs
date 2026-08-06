import assert from "node:assert/strict";
import test from "node:test";
import { recommendOllamaModels } from "../server/ollama.mjs";

const option = (name, parameterSize, capabilities = ["completion"]) => ({ name, parameterSize, capabilities });

test("recommends a balanced conversational model over huge and coding models", () => {
  const result = recommendOllamaModels([
    option("qwen3-coder:30b", "30B"),
    option("gemma4:26b", "26B"),
    option("gemma4:12b", "12B"),
  ]);
  assert.equal(result.recommendedChat, "gemma4:12b");
});

test("prefers an installed Gemma 4 model as the AniMessenger family recommendation", () => {
  const result = recommendOllamaModels([
    option("qwen3:14b", "14B"),
    option("gemma4:26b-a4b-it-qat", "25.2B", ["completion", "vision"]),
  ]);
  assert.equal(result.recommendedChat, "gemma4:26b-a4b-it-qat");
  assert.equal(result.recommendedVision, "gemma4:26b-a4b-it-qat");
});

test("only recommends a vision model when Ollama confirms vision support", () => {
  const result = recommendOllamaModels([
    option("chat:12b", "12B"),
    option("vision:8b", "8B", ["completion", "vision"]),
  ]);
  assert.equal(result.recommendedChat, "chat:12b");
  assert.equal(result.recommendedVision, "vision:8b");
});

test("uses a single installed model without inventing vision support", () => {
  const result = recommendOllamaModels([option("only-model:8b", "8B")]);
  assert.deepEqual(result, { recommendedChat: "only-model:8b", recommendedVision: "" });
});
