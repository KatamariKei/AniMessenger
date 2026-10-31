import { createHmac, randomBytes } from "node:crypto";

export const promptParts = ["none", "system", "history", "previous_user_turn", "current_turn", "image", "message_count", "unknown"];
export const systemGroups = ["profile", "time", "relationship", "photo", "follow_up", "achievement", "narrative", "rules"];
export const turnSections = ["guidance", "guidanceRules", "guidanceDefinitions", "style", "memories", "relationship", "examples", "exampleIndices", "scene", "clock", "verbalResponseRequired", "photo", "applicationReferences", "userMessage"];
export const controlFlags = ["story", "presence", "photoOpportunity", "explicitPhotoRequest", "visualEventOpportunity"];
export const modelKinds = ["chat", "memory", "discovery", "recall", "repair", "other"];
const count = value => Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
const knownKinds = new Map([["chat", "chat"], ["chat_retry", "chat"], ["memory_checkpoint", "memory"], ["discovery_review", "discovery"], ["memory_recall", "recall"], ["reply_repair", "repair"], ["scene_repair", "repair"]]);
const kindFor = label => knownKinds.get(label) || "other";
const groupFor = line => {
  if (/^(?:CORE:|TRAITS:|MANNERISMS|SPEECH|PLAIN BASELINE|EMOTIONAL|CANON:|HISTORY:|RELATIONSHIPS:|KNOWLEDGE:|BOUNDARIES:|You are |CURRENT IDENTITY|NON-NEGOTIABLE AGE|The permanent visual identity|EXACT DEFAULT WARDROBE)/.test(line)) return "profile";
  if (/^(?:Assume the character shares|Keep greetings, meals|USER LOCAL TIME)/.test(line)) return "time";
  if (/^RELATIONSHIP STAGE:/.test(line)) return "relationship";
  if (/^(?:A private visual-update|Do not proactively send|The user's latest message is a clear request|If the user directly asks you|PHOTO |IMAGE BRIEF|SNAPSHOT GAZE)/.test(line)) return "photo";
  if (/^(?:PENDING SOFT FOLLOW-UP|There is no pending character follow-up)/.test(line)) return "follow_up";
  if (/^(?:For shared_activity|ACHIEVEMENT)/.test(line)) return "achievement";
  if (/^(?:STORY MODE|CHAT MODE|VIEWPOINT:|CURRENT TURN VIEWPOINT|If turnContext.verbalResponseRequired|Dialogue may|Because this is an in-person|Because you are physically apart|The character and user)/.test(line)) return "narrative";
  return "rules";
};

// Only keyed digests, fixed labels and counts survive a request. No prompt,
// response, URL, model name, conversation ID or image bytes are retained here.
export function createPromptDiagnostics({ maxConversations = 24, maxRunners = 12, maxReceipts = 128, maxCharacters = 262144 } = {}) {
  maxConversations = Math.max(1, Math.min(64, count(maxConversations)));
  maxRunners = Math.max(1, Math.min(32, count(maxRunners)));
  maxReceipts = Math.max(2, Math.min(256, count(maxReceipts)));
  maxCharacters = Math.max(256, Math.min(524288, count(maxCharacters)));
  const secret = randomBytes(32);
  const digest = text => createHmac("sha256", secret).update(text).digest("base64url");
  const conversations = new Map(), runners = new Map();
  let sequence = 0;
  const touch = (map, key, value) => { map.delete(key); map.set(key, value); };
  function fingerprint(messages, metadata) {
    let remaining = maxCharacters;
    const entries = messages.slice(0, 128).map(message => {
      const text = typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? "");
      const size = Math.min(text.length, remaining);
      remaining -= size;
      const blocks = [];
      for (let i = 0; i < size; i += 256) blocks.push({ hash: digest(text.slice(i, Math.min(size, i + 256))), length: Math.min(size - i, 256) });
      const images = Array.isArray(message.images) ? message.images : [];
      return { role: ["system", "user", "assistant", "tool"].includes(message.role) ? message.role : "other", hash: digest(text), length: text.length, blocks,
        imageHash: images.length ? digest(images.map(value => digest(String(value))).join("|")) : "", imageCount: images.length };
    });
    const groups = Object.fromEntries(systemGroups.map(group => [group, []]));
    const system = messages.filter(message => message.role === "system").map(message => String(message.content || "")).join("\n");
    for (const line of system.slice(0, maxCharacters).split("\n")) groups[groupFor(line)].push(line);
    let envelope;
    if (metadata.lateTurnContext) {
      try { envelope = JSON.parse(messages.at(-1)?.content); } catch { /* Fallback carries ordinary user text. */ }
    }
    const sections = Object.fromEntries(turnSections.map(section => [section, digest(JSON.stringify(section === "userMessage" ? envelope?.userMessage : envelope?.turnContext?.[section]) ?? "<absent>")]));
    return { entries, systemHash: digest(system), groups: Object.fromEntries(systemGroups.map(group => [group, digest(groups[group].join("\n"))])), sections,
      totalCharacters: entries.reduce((total, entry) => total + entry.length, 0), messageCount: messages.length,
      truncated: messages.length > entries.length || entries.some(entry => entry.blocks.reduce((total, block) => total + block.length, 0) < entry.length) };
  }
  function compare(previous, current) {
    let shared = 0, part = "none", changedIndex;
    const a = previous.entries, b = current.entries;
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
      const old = a[index], next = b[index];
      if (old.role === next.role && old.hash === next.hash && old.imageHash === next.imageHash) { shared += old.length; continue; }
      changedIndex = index;
      if (old.role === next.role) for (let i = 0; i < Math.min(old.blocks.length, next.blocks.length); i++) {
        if (old.blocks[i].hash !== next.blocks[i].hash || old.blocks[i].length !== next.blocks[i].length) break;
        shared += old.blocks[i].length;
      }
      part = old.imageHash !== next.imageHash ? "image" : old.role === "system" || next.role === "system" ? "system"
        : index === a.length - 1 && index < b.length - 1 && old.role === "user" ? "previous_user_turn"
          : index === a.length - 1 && index === b.length - 1 ? "current_turn" : "history";
      break;
    }
    if (part === "none" && previous.messageCount !== current.messageCount) part = "message_count";
    if (part === "none" && (previous.truncated || current.truncated)) part = "unknown";
    return { firstChangedPart: part, sharedTextPrefixChars: shared, replacedInputTailChars: Math.max(0, previous.totalCharacters - shared),
      ...(changedIndex !== undefined ? { firstChangedMessageIndex: changedIndex, previousChangedMessageChars: a[changedIndex].length, currentChangedMessageChars: b[changedIndex].length } : {}),
      systemChanged: Number(previous.systemHash !== current.systemHash),
      changedSystemGroups: systemGroups.filter(group => previous.groups[group] !== current.groups[group]),
      changedTurnSections: turnSections.filter(section => previous.sections[section] !== current.sections[section]),
      comparisonTruncated: Number(previous.truncated || current.truncated) };
  }
  return {
    begin({ runner, conversation, messages = [], settings = {}, metadata = {}, label }) {
      const runnerKey = digest(JSON.stringify(runner));
      const receipts = runners.get(runnerKey) || [];
      touch(runners, runnerKey, receipts);
      while (runners.size > maxRunners) {
        const removed = runners.keys().next().value; runners.delete(removed);
        for (const [key, state] of conversations) if (state.runnerKey === removed) conversations.delete(key);
      }
      const receipt = { sequence: ++sequence, kind: kindFor(label), complete: false, outputTokens: 0, loadMs: 0, success: false };
      let diagnostic;
      if (conversation) {
        const conversationKey = digest(JSON.stringify([runnerKey, conversation]));
        const previous = conversations.get(conversationKey);
        const current = fingerprint(messages, metadata);
        const settingsHash = digest(JSON.stringify(settings));
        const flags = Object.fromEntries(controlFlags.map(flag => [flag, count(metadata[flag])]));
        diagnostic = { hasPrevious: Number(Boolean(previous)), currentMessages: current.messageCount, budgetContextTokens: count(metadata.budgetContextTokens),
          systemCompacted: Number(Boolean(metadata.systemCompacted)), historyItemsIncluded: count(metadata.historyItemsIncluded), historyItemsOmitted: count(metadata.historyItemsOmitted) };
        if (previous) {
          const between = receipts.filter(item => item.sequence > previous.receipt.sequence);
          diagnostic = { ...diagnostic, ...compare(previous.fingerprint, current),
            previousModelRequestNumber: previous.receipt.sequence, previousOutputTokens: previous.receipt.outputTokens, previousComplete: Number(previous.receipt.complete), previousSuccess: Number(previous.receipt.success),
            previousMessages: previous.fingerprint.messageCount, requestSettingsChanged: Number(previous.settingsHash !== settingsHash),
            previousBudgetContextTokens: previous.budget, budgetContextChanged: Number(previous.budget !== count(metadata.budgetContextTokens)), compactionChanged: Number(previous.compacted !== Boolean(metadata.systemCompacted)),
            historyWindowChanged: Number(previous.historyStart !== count(metadata.historyStart)), layoutChanged: Number(previous.late !== Boolean(metadata.lateTurnContext)),
            changedControlFlags: controlFlags.filter(flag => previous.flags[flag] !== flags[flag]),
            interveningRequests: between.length, interveningKinds: Object.fromEntries(modelKinds.map(kind => [kind, between.filter(item => item.kind === kind).length])),
            interveningOutputTokens: between.reduce((sum, item) => sum + item.outputTokens, 0), interveningMaxOutputTokens: Math.max(0, ...between.map(item => item.outputTokens)),
            interveningLoadMs: between.reduce((sum, item) => sum + item.loadMs, 0), interveningPending: between.filter(item => !item.complete).length,
            interveningFailed: between.filter(item => item.complete && !item.success).length,
            interveningRecordsTruncated: Number(Boolean(receipts.length && previous.receipt.sequence < receipts[0].sequence)) };
        }
        touch(conversations, conversationKey, { fingerprint: current, runnerKey, receipt, settingsHash, flags, historyStart: count(metadata.historyStart), late: Boolean(metadata.lateTurnContext), budget: count(metadata.budgetContextTokens), compacted: Boolean(metadata.systemCompacted) });
        while (conversations.size > maxConversations) conversations.delete(conversations.keys().next().value);
      }
      receipts.push(receipt);
      while (receipts.length > maxReceipts) receipts.shift();
      return { requestNumber: receipt.sequence, diagnostic, complete(metrics = {}) {
        if (receipt.complete) return;
        receipt.complete = true; receipt.outputTokens = count(metrics.outputTokens); receipt.loadMs = count(metrics.loadMs); receipt.success = metrics.success !== false;
      } };
    },
    stats() { return { conversations: conversations.size, runners: runners.size, receipts: [...runners.values()].reduce((sum, list) => sum + list.length, 0),
      fingerprintBlocks: [...conversations.values()].reduce((sum, state) => sum + state.fingerprint.entries.reduce((n, item) => n + item.blocks.length, 0), 0) }; },
  };
}

export const promptDiagnostics = createPromptDiagnostics();
