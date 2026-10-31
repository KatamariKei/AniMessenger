import test from "node:test";
import assert from "node:assert/strict";
import { createPromptDiagnostics } from "../server/prompt-diagnostics.mjs";
import { createPerformanceMetrics } from "../server/performance-metrics.mjs";

const envelope = (clock = "PRIVATE CLOCK") => JSON.stringify({ turnContext: { guidance: ["PRIVATE GUIDANCE"], scene: ["PRIVATE SCENE"], clock: [clock], memories: ["PRIVATE MEMORY"] }, userMessage: "PRIVATE USER WORDS" });
const input = (overrides = {}) => ({ runner: ["PRIVATE URL", "PRIVATE MODEL"], conversation: ["PRIVATE CONVERSATION", "PRIVATE INSTANCE"], label: "chat",
  messages: [{ role: "system", content: "You are Synthetic.\nCORE: " + "Stable character rule. ".repeat(40) }, { role: "user", content: "PRIVATE EARLIER USER" }, { role: "assistant", content: "PRIVATE EARLIER REPLY" }, { role: "user", content: envelope() }],
  metadata: { lateTurnContext: true, budgetContextTokens: 65536, historyItemsIncluded: 2, historyStart: 8, story: 1 }, settings: { think: false, options: { num_predict: 1600 } }, ...overrides });

test("identical actual requests and clock-only changes are distinguished without exposing private text or fingerprints", () => {
  const tracker = createPromptDiagnostics();
  const first = input();
  const a = tracker.begin(first); a.complete({ outputTokens: 700 });
  const b = tracker.begin(input()); b.complete({ outputTokens: 600 });
  assert.equal(a.diagnostic.hasPrevious, 0);
  assert.equal(b.diagnostic.firstChangedPart, "none");
  assert.equal(b.diagnostic.previousOutputTokens, 700);
  assert.equal(b.diagnostic.previousComplete, 1);
  assert.equal(b.diagnostic.systemChanged, 0);
  const changed = input(); changed.messages.at(-1).content = envelope("PRIVATE NEW CLOCK");
  const c = tracker.begin(changed);
  assert.equal(c.diagnostic.firstChangedPart, "current_turn");
  assert.deepEqual(c.diagnostic.changedTurnSections, ["clock"]);
  assert.ok(c.diagnostic.sharedTextPrefixChars >= first.messages.slice(0, -1).reduce((sum, message) => sum + message.content.length, 0));
  assert.equal(c.diagnostic.requestSettingsChanged, 0);
  assert.doesNotMatch(JSON.stringify([a.diagnostic, b.diagnostic, c.diagnostic, tracker.stats()]), /PRIVATE|hash|digest|fingerprintBlocks.*[A-Za-z]{20}/);
});

test("replacement of the prior wrapped user turn is identified when real transcript history grows", () => {
  const tracker = createPromptDiagnostics();
  const old = input(); tracker.begin(old).complete({ outputTokens: 800 });
  const next = input();
  next.messages = [...old.messages.slice(0, -1), { role: "user", content: "PRIVATE USER WORDS" }, { role: "assistant", content: "PRIVATE NEW REPLY" }, old.messages.at(-1)];
  const result = tracker.begin(next).diagnostic;
  assert.equal(result.firstChangedPart, "previous_user_turn");
  assert.equal(result.firstChangedMessageIndex, old.messages.length - 1);
  assert.equal(result.previousChangedMessageChars, old.messages.at(-1).content.length);
  assert.equal(result.previousOutputTokens, 800);
  assert.equal(result.replacedInputTailChars, old.messages.at(-1).content.length);
  assert.equal(result.systemChanged, 0);
});

test("system instruction groups, live control flags, compaction and allocation changes are reported separately", () => {
  const tracker = createPromptDiagnostics();
  const a = input(); a.messages[0].content += "\nDo not proactively send a photo this turn.";
  tracker.begin(a).complete();
  const b = input(); b.messages[0].content += "\nA private visual-update opportunity is available this turn.";
  Object.assign(b.metadata, { photoOpportunity: 1, historyStart: 16, systemCompacted: true, budgetContextTokens: 8192 });
  b.settings.options.num_predict = 2200;
  const result = tracker.begin(b).diagnostic;
  assert.equal(result.firstChangedPart, "system");
  assert.equal(result.systemChanged, 1);
  assert.deepEqual(result.changedSystemGroups, ["photo"]);
  assert.deepEqual(result.changedControlFlags, ["photoOpportunity"]);
  assert.equal(result.historyWindowChanged, 1);
  assert.equal(result.compactionChanged, 1);
  assert.equal(result.budgetContextChanged, 1);
  assert.equal(result.previousBudgetContextTokens, 65536);
  assert.equal(result.requestSettingsChanged, 1);
});

test("background work is linked to the same runner with actual completed outputs, pending work and failures", () => {
  const tracker = createPromptDiagnostics();
  const first = tracker.begin(input()); first.complete({ outputTokens: 700 });
  tracker.begin(input({ conversation: undefined, label: "memory_checkpoint" })).complete({ outputTokens: 600, loadMs: 5 });
  tracker.begin(input({ conversation: undefined, runner: ["OTHER URL", "OTHER MODEL"], label: "memory_checkpoint" })).complete({ outputTokens: 900 });
  const pending = tracker.begin(input({ conversation: undefined, label: "discovery_review" }));
  tracker.begin(input({ conversation: ["ANOTHER CONVERSATION"] })).complete({ outputTokens: 300, success: false });
  const next = tracker.begin(input());
  assert.equal(next.requestNumber, 6);
  assert.equal(next.diagnostic.previousModelRequestNumber, 1);
  assert.equal(next.diagnostic.interveningRequests, 3);
  assert.equal(next.diagnostic.interveningOutputTokens, 900);
  next.complete();
  tracker.begin(input({ conversation: undefined, label: "__proto__" })).complete();
  assert.equal(tracker.begin(input()).diagnostic.interveningKinds.other, 1);
  assert.equal(next.diagnostic.interveningMaxOutputTokens, 600);
  assert.equal(next.diagnostic.interveningPending, 1);
  assert.equal(next.diagnostic.interveningFailed, 1);
  assert.equal(next.diagnostic.interveningLoadMs, 5);
  assert.deepEqual(next.diagnostic.interveningKinds, { chat: 1, memory: 1, discovery: 1, recall: 0, repair: 0, other: 0 });
  pending.complete({ outputTokens: 100 });
  assert.equal(next.diagnostic.interveningOutputTokens, 900);
});

test("fingerprint and receipt storage stay bounded and truncation is explicit", () => {
  const tracker = createPromptDiagnostics({ maxConversations: 2, maxRunners: 2, maxReceipts: 3, maxCharacters: 512 });
  const large = input({ messages: [{ role: "system", content: "PRIVATE ".repeat(1000) }] });
  tracker.begin(large).complete();
  for (let i = 0; i < 8; i++) tracker.begin(input({ conversation: undefined })).complete();
  const compared = tracker.begin(large).diagnostic;
  assert.equal(compared.comparisonTruncated, 1);
  assert.equal(compared.interveningRecordsTruncated, 1);
  assert.equal(compared.firstChangedPart, "unknown");
  for (let i = 0; i < 10; i++) tracker.begin(input({ conversation: [i], messages: large.messages })).complete();
  assert.ok(tracker.stats().conversations <= 2);
  assert.ok(tracker.stats().fingerprintBlocks <= 4);
  assert.ok(tracker.stats().receipts <= 3);
  for (let i = 0; i < 5; i++) tracker.begin(input({ runner: [i] })).complete();
  assert.ok(tracker.stats().runners <= 2);
  assert.ok(tracker.stats().conversations <= 2);
  assert.ok(tracker.stats().receipts <= 6);
});

test("image changes and conversation recreation do not reuse an unrelated comparison", () => {
  const tracker = createPromptDiagnostics();
  const a = input(); tracker.begin(a).complete();
  const b = input(); b.messages.at(-1).images = ["PRIVATE IMAGE BYTES"];
  assert.equal(tracker.begin(b).diagnostic.firstChangedPart, "image");
  assert.equal(tracker.begin(input({ conversation: ["PRIVATE CONVERSATION", "REPLACEMENT INSTANCE"] })).diagnostic.hasPrevious, 0);
  assert.doesNotMatch(JSON.stringify(tracker.stats()), /PRIVATE/);
});

test("performance snapshots accept only fixed comparison labels and counts", () => {
  const metrics = createPerformanceMetrics();
  metrics.record("model", { cache: { hasPrevious: 1, firstChangedPart: "PRIVATE PART", prompt: "PRIVATE PROMPT", hash: "PRIVATE HASH", changedSystemGroups: ["photo", "PRIVATE GROUP"], changedTurnSections: ["clock", "PRIVATE SECTION"], changedControlFlags: ["photoOpportunity", "PRIVATE FLAG"], interveningKinds: { memory: 2, "PRIVATE KIND": 7 } } });
  const snapshot = metrics.snapshot();
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE/);
  assert.deepEqual(snapshot.recent[0].cache.changedSystemGroups, ["photo"]);
  assert.equal(snapshot.recent[0].cache.interveningKinds.memory, 2);
  snapshot.recent[0].cache.changedSystemGroups.push("PRIVATE MUTATION");
  assert.doesNotMatch(JSON.stringify(metrics.snapshot()), /PRIVATE/);
});
