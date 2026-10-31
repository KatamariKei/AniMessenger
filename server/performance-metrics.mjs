import { performance } from "node:perf_hooks";
import { promptParts, systemGroups, turnSections, controlFlags, modelKinds } from "./prompt-diagnostics.mjs";

const kinds = new Set(["chat", "model", "research", "discovery_research"]);
const stages = new Set(["recall", "context", "preparation", "generation", "repair", "wikipedia", "anilist", "franchise_wiki"]);
const labels = new Set(["ollama", "chat", "chat_retry", "chat_warmup", "memory_recall", "reply_repair", "scene_repair", "memory_checkpoint", "discovery_review", "evidence", "validation", "opening", "profile", "profile-retry", "profile-repair", "validation-review", "wardrobe-repair", "profile-combined-repair", "profile-correction-fallback", "opening-retry"]);
const numbers = ["totalMs", "firstTextMs", "wallMs", "loadMs", "promptMs", "generationMs", "contextTokens", "lateTurnContext", "turnContextTokens", "promptTokens", "cachedPromptTokens", "outputTokens", "sourceCount", "modelCalls", "concurrentRequests", "modelRequestNumber"];
const finite = value => Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
const cacheNumbers = ["hasPrevious", "currentMessages", "budgetContextTokens", "systemCompacted", "historyItemsIncluded", "historyItemsOmitted", "sharedTextPrefixChars", "replacedInputTailChars", "systemChanged", "comparisonTruncated", "firstChangedMessageIndex", "previousChangedMessageChars", "currentChangedMessageChars", "previousModelRequestNumber", "previousOutputTokens", "previousComplete", "previousSuccess", "previousMessages", "requestSettingsChanged", "previousBudgetContextTokens", "budgetContextChanged", "compactionChanged", "historyWindowChanged", "layoutChanged", "interveningRequests", "interveningOutputTokens", "interveningMaxOutputTokens", "interveningLoadMs", "interveningPending", "interveningFailed", "interveningRecordsTruncated"];

function safeCacheDiagnostic(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const result = Object.fromEntries(cacheNumbers.filter(key => input[key] !== undefined).map(key => [key, finite(input[key])]));
  if (promptParts.includes(input.firstChangedPart)) result.firstChangedPart = input.firstChangedPart;
  for (const [key, allowed] of [["changedSystemGroups", systemGroups], ["changedTurnSections", turnSections], ["changedControlFlags", controlFlags]]) {
    if (Array.isArray(input[key])) result[key] = [...new Set(input[key].filter(value => allowed.includes(value)))];
  }
  if (input.interveningKinds && typeof input.interveningKinds === "object") result.interveningKinds = Object.fromEntries(modelKinds.map(kind => [kind, finite(input.interveningKinds[kind] || 0)]));
  return result;
}

export function createPerformanceMetrics(limit = 60) {
  limit = Math.max(1, Math.min(1000, Math.trunc(Number(limit) || 60)));
  const recent = [];
  return {
    record(kind, input = {}) {
      if (!kinds.has(kind)) return;
      const entry = { kind, recordedAt: new Date().toISOString(), success: input.success !== false };
      for (const key of numbers) if (input[key] !== undefined) entry[key] = finite(input[key]);
      if (labels.has(input.label)) entry.label = input.label;
      const cache = safeCacheDiagnostic(input.cache);
      if (cache) entry.cache = cache;
      if (input.stages) entry.stages = Object.fromEntries(Object.entries(input.stages).filter(([key]) => stages.has(key)).map(([key, value]) => [key, finite(value)]));
      recent.push(entry);
      while (recent.length > limit) recent.shift();
    },
    snapshot() { return { recent: structuredClone(recent) }; },
  };
}

export const performanceMetrics = createPerformanceMetrics();

export function startPerformance(kind) {
  const started = performance.now();
  const elapsed = {};
  let modelCalls = 0;
  let firstTextMs;
  return {
    async measure(stage, work) {
      const begin = performance.now();
      try { return await work(); }
      finally { elapsed[stage] = (elapsed[stage] || 0) + performance.now() - begin; }
    },
    modelCall() { modelCalls++; },
    firstText() { firstTextMs ??= performance.now() - started; },
    finish(success = true) { performanceMetrics.record(kind, { totalMs: performance.now() - started, ...(firstTextMs !== undefined ? { firstTextMs } : {}), modelCalls, stages: elapsed, success }); },
  };
}
