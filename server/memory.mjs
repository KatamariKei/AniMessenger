import { createHash } from "node:crypto";

const allowedKinds = new Set(["user_fact", "preference", "shared_event", "shared_creation", "promise", "boundary", "open_loop"]);
const canonicalKindPriority = new Map([
  ["open_loop", 1],
  ["promise", 2],
  ["shared_event", 0],
  ["preference", 4],
  ["user_fact", 5],
  ["shared_creation", 6],
  ["boundary", 7],
]);
const completedEventLanguage = /\b(?:won|lost|beat|defeated|finished|completed|resolved|visited|went|arrived|met|attended|bought|gave|received|showed|shared|created|made|named|returned|left|ended|ending)\b/i;

function kindPriority(memory) {
  if (memory?.kind === "shared_event" && completedEventLanguage.test(String(memory.text || ""))) return 3;
  return canonicalKindPriority.get(memory?.kind) || 0;
}
const stopWords = new Set(["about", "after", "again", "also", "and", "are", "because", "been", "before", "but", "can", "character", "did", "does", "for", "from", "have", "into", "just", "name", "our", "that", "the", "their", "they", "this", "user", "was", "were", "what", "when", "with", "you", "your"]);
const topicStopWords = new Set(["agreed", "considered", "decided", "discussed", "going", "mentioned", "need", "needs", "planned", "promised", "suggested", "still", "together", "want", "wanted", "wants"]);
const lifecycleStopWords = new Set([
  "anderson", "city", "day", "days", "evening", "following", "hour", "hours", "morning", "month", "months",
  "next", "potential", "soon", "today", "tomorrow", "tonight", "two-hour", "upcoming", "week", "weekend", "weeks",
  "year", "years",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
]);
const weakLifecycleWords = new Set(["begin", "come", "finish", "go", "leave", "make", "start", "take", "trip", "visit"]);
const evidenceStopWords = new Set(["after", "during", "encounter", "event", "intense", "moment", "relationship", "shared", "together", "where"]);
const episodeStopWords = new Set([
  ...evidenceStopWords,
  "deep", "deeply", "emotional", "meaningful", "profound", "prolonged", "subsequently", "time",
]);
const evidenceAliases = new Map([
  ["officially", "official"], ["moving", "move"], ["moved", "move"],
  ["measurements", "measurement"], ["measuring", "measurement"], ["measured", "measurement"],
]);
const lifecycleAliases = new Map([
  ["depart", "trip"], ["departed", "trip"], ["departing", "trip"], ["departure", "trip"],
  ["drive", "trip"], ["driving", "trip"], ["drove", "trip"], ["journey", "trip"],
  ["leave", "trip"], ["leaving", "trip"], ["left", "trip"], ["road", "trip"],
  ["travel", "trip"], ["traveled", "trip"], ["travelled", "trip"], ["traveling", "trip"], ["travelling", "trip"],
]);
const recallStopWords = new Set(["ago", "happen", "happened", "memory", "remember", "remembered", "remembering", "recall", "recalled", "time", "thing"]);
const broadRecallWords = new Set(["first", "last", "place", "visit", "work"]);
const temporalRecallWords = new Set(["earliest", "first", "last", "latest", "recent"]);
const wordAliases = new Map([
  ["jobs", "work"], ["job", "work"], ["shift", "work"], ["shifts", "work"], ["workplace", "work"], ["working", "work"],
  ["visited", "visit"], ["visiting", "visit"], ["visits", "visit"],
  ["played", "play"], ["playing", "play"], ["plays", "play"],
  ["music", "song"], ["songs", "song"], ["track", "song"], ["tracks", "song"], ["tune", "song"], ["tunes", "song"],
  ["made", "cook"], ["make", "cook"], ["prepared", "cook"], ["prepare", "cook"], ["cooked", "cook"], ["cooking", "cook"],
  ["dish", "food"], ["dishes", "food"], ["meal", "food"], ["meals", "food"],
  ["pub", "bar"], ["tavern", "bar"], ["club", "bar"],
  ["teased", "tease"], ["teasing", "tease"], ["playful", "tease"], ["provoked", "tease"], ["reaction", "tease"],
  ["liked", "like"], ["likes", "like"], ["loved", "love"], ["hated", "hate"], ["preferred", "prefer"],
  ["measurements", "measurement"], ["measured", "measurement"], ["measuring", "measurement"],
  ["length", "measurement"], ["lengths", "measurement"], ["height", "measurement"], ["weight", "measurement"],
  ["bust", "measurement"], ["waist", "measurement"], ["hip", "measurement"], ["hips", "measurement"],
]);
const measurementNumberWords = new Map([
  ["zero", "0"], ["one", "1"], ["two", "2"], ["three", "3"], ["four", "4"], ["five", "5"],
  ["six", "6"], ["seven", "7"], ["eight", "8"], ["nine", "9"], ["ten", "10"], ["eleven", "11"],
  ["twelve", "12"], ["thirteen", "13"], ["fourteen", "14"], ["fifteen", "15"], ["sixteen", "16"],
  ["seventeen", "17"], ["eighteen", "18"], ["nineteen", "19"], ["twenty", "20"],
]);

function canonicalRecallWord(word) {
  const normalized = String(word || "").replace(/'s$/, "");
  if (wordAliases.has(normalized)) return wordAliases.get(normalized);
  if (normalized.length > 5 && /(?:ing|ed)$/.test(normalized)) {
    const stem = normalized.replace(/(?:ing|ed)$/, "").replace(/([a-z])\1$/, "$1");
    return wordAliases.get(stem) || stem;
  }
  if (normalized.length > 4 && normalized.endsWith("s") && !normalized.endsWith("ss")) return normalized.slice(0, -1);
  return normalized;
}

function words(value) {
  return [...new Set(String(value || "").toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || [])]
    .filter((word) => !stopWords.has(word));
}

function recallWords(value) {
  return [...new Set(words(value)
    .map(canonicalRecallWord)
    .filter((word) => !recallStopWords.has(word)))];
}

export function isRecallQuestion(value) {
  return /\b(?:do you remember|don't you remember|did you forget|have you forgotten|you forgot|remember when|remember what|recall|remind me|ring a bell|what happened|what (?:was|is) (?:his|her|their|its|the) name|what did we (?:name|call)|what was .{0,60} called|drawing a blank|first time|last time|week ago|month ago|year ago)\b/i.test(String(value || ""));
}

function topicWords(value) {
  return words(value)
    .filter((word) => !topicStopWords.has(word))
    .map((word) => word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);
}

function topicOverlap(left, right) {
  const a = new Set(topicWords(left));
  const b = new Set(topicWords(right));
  if (!a.size || !b.size) return 0;
  return [...a].filter((word) => b.has(word)).length / Math.min(a.size, b.size);
}

function capitalizedParticipantWords(value) {
  return new Set((String(value || "").match(/\b[A-Z][a-z]{2,}\b/g) || [])
    .map((word) => word.toLowerCase())
    .filter((word) => !lifecycleStopWords.has(word)));
}

function lifecycleWords(value) {
  const participants = capitalizedParticipantWords(value);
  return [...new Set(topicWords(value)
    .map((word) => lifecycleAliases.get(word) || word)
    .filter((word) => !participants.has(word))
    .filter((word) => !lifecycleStopWords.has(word))
    .filter((word) => !/^\d+(?:st|nd|rd|th)?$/.test(word)))];
}

function isUnresolvedMemory(memory) {
  return memory?.kind === "open_loop" || memory?.kind === "promise";
}

function isCompletedSharedEvent(memory) {
  return memory?.kind === "shared_event" && completedEventLanguage.test(String(memory.text || ""));
}

function isSamePlanLifecycle(left, right) {
  const leftUnresolved = isUnresolvedMemory(left);
  const rightUnresolved = isUnresolvedMemory(right);
  if (!(leftUnresolved && rightUnresolved)
    && !(leftUnresolved && isCompletedSharedEvent(right))
    && !(rightUnresolved && isCompletedSharedEvent(left))) return false;

  const leftWords = new Set(lifecycleWords(left.text));
  const rightWords = new Set(lifecycleWords(right.text));
  if (!leftWords.size || !rightWords.size) return false;
  const shared = [...leftWords].filter((word) => rightWords.has(word));
  const hasSpecificAnchor = shared.some((word) => !weakLifecycleWords.has(word));
  return hasSpecificAnchor && shared.length / Math.min(leftWords.size, rightWords.size) >= 0.5;
}

function evidenceWords(memory) {
  const participants = capitalizedParticipantWords(memory?.text);
  return [...new Set(words([memory?.text, ...stringList(memory?.keywords)].filter(Boolean).join(" "))
    .map(canonicalRecallWord)
    .map((word) => evidenceAliases.get(word) || word)
    .filter((word) => !participants.has(word))
    .filter((word) => !evidenceStopWords.has(word)))];
}

function episodeWords(memory) {
  const participants = capitalizedParticipantWords(memory?.text);
  return [...new Set(words(memory?.text)
    .map(canonicalRecallWord)
    .map((word) => evidenceAliases.get(word) || word)
    .filter((word) => !participants.has(word))
    .filter((word) => !episodeStopWords.has(word)))];
}

function sharesSourceEvidence(left, right) {
  const leftSources = new Set(left?.sourceMessageIds || []);
  return (right?.sourceMessageIds || []).some((id) => leftSources.has(id));
}

function explicitMemorySubject(memory) {
  if (!new Set(["boundary", "preference", "user_fact"]).has(memory?.kind)) return "";
  const text = String(memory?.text || "").trim();
  const user = text.match(/^(?:the\s+)?user(?:'s|\s+(?:is|has|feels|prefers|enjoys|likes|loves|hates|works|creates|does|wants|says|states|reports|describes|measures))\b/i);
  if (user) return "user";
  const named = text.match(/^([A-Z][a-z'-]{2,})(?:'s|\s+(?:is|has|feels|prefers|enjoys|likes|loves|hates|works|creates|does|wants|says|states|reports|describes|measures))\b/);
  return named ? named[1].toLowerCase() : "";
}

function memoryMergeContext(existing = [], candidates = []) {
  const userAliases = new Set(["user"]);
  for (const memory of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(candidates) ? candidates : [])]) {
    const text = String(memory?.text || "");
    const match = text.match(/\b(?:the\s+)?user(?:'s)?\s+name\s+is\s+([A-Z][a-z'-]{1,40})\b/);
    if (match) userAliases.add(match[1].toLowerCase());
  }
  return { userAliases };
}

function canonicalFactSubject(memory, context = {}) {
  const subject = explicitMemorySubject(memory);
  return context?.userAliases?.has(subject) ? "user" : subject;
}

function stableFactIdentity(memory, context = {}) {
  if (!new Set(["boundary", "preference", "user_fact"]).has(memory?.kind)) return null;
  const text = String(memory?.text || "").toLowerCase();
  const subject = canonicalFactSubject(memory, context);
  if (!subject) return null;

  const favorite = namedPreferenceSubject(memory);
  if (favorite) {
    const match = text.match(/\b(?:is|are|was|were)\s+(.+?)[.!?]?$/);
    return match ? { key: `${subject}:favorite:${favorite}`, value: match[1].replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim() } : null;
  }

  const statedName = text.match(/\bname\s+is\s+([a-z][a-z'-]{1,40})\b/);
  if (statedName) return { key: `${subject}:name`, value: statedName[1] };

  const statuses = [...new Set(text.match(/\b(?:divorced|single|married|widowed|engaged|dating)\b/g) || [])].sort();
  if (statuses.length) return { key: `${subject}:relationship-status`, value: statuses.join("|") };

  const bedSize = text.match(/\b(california king|cal king|king|queen|full|double|twin)\s+(?:size\s+)?bed\b/);
  if (bedSize) return { key: `${subject}:bed-size`, value: bedSize[1].replace("cal king", "california king") };

  const measurementObject = text.match(/\b(cock|penis|height|weight|bust|waist|hips?|shoe size)\b/)
    || (/\b(?:flaccid|resting|erect)\b/.test(text) ? [null, "cock"] : null);
  const numbers = (text.match(/\b(?:\d+(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g) || [])
    .map((number) => measurementNumberWords.get(number) || number);
  if (measurementObject && numbers.length) {
    const states = [];
    if (/\b(?:flaccid|resting)\b/.test(text)) states.push("flaccid");
    if (/\berect\b/.test(text)) states.push("erect");
    if (!states.length) states.push("general");
    const object = measurementObject[1] === "penis" ? "cock" : measurementObject[1];
    return { key: `${subject}:measurement:${object}:${states.join("+")}`, value: numbers.join("|") };
  }
  return null;
}

function isSourceBackedDuplicate(left, right) {
  if (left?.kind !== right?.kind || left?.userEdited || right?.userEdited || !sharesSourceEvidence(left, right)) return false;
  const leftSubject = explicitMemorySubject(left);
  const rightSubject = explicitMemorySubject(right);
  if (leftSubject && rightSubject && leftSubject !== rightSubject) return false;
  const leftWords = new Set(evidenceWords(left));
  const rightWords = new Set(evidenceWords(right));
  if (!leftWords.size || !rightWords.size) return false;
  const shared = [...leftWords].filter((word) => rightWords.has(word));
  return shared.length >= 3 && shared.length / Math.min(leftWords.size, rightWords.size) >= 0.18;
}

function milestoneClasses(memory) {
  const text = String(memory?.text || "").toLowerCase();
  const classes = new Set();
  if (/\b(?:vow(?:s|ed)?|wedding|married|marriage|engaged|engagement)\b/.test(text)) classes.add("commitment");
  if (/\b(?:confess(?:ed|ion)?\s+(?:their\s+|his\s+|her\s+)?love|said\s+[“\"']?i love you)\b/.test(text)) classes.add("love-confession");
  if (/\bfirst kiss\b/.test(text)) classes.add("first-kiss");
  if (/\b(?:had sex|made love|sexual encounter|slept together)\b/.test(text)) classes.add("sexual-milestone");
  if (/\b(?:adopted|adoption)\b/.test(text)) classes.add("adoption");
  if (/\b(?:birthday|anniversary)\b/.test(text)) classes.add("occasion");
  return classes;
}

function isSameEpisodeRefinement(left, right) {
  if (left?.kind !== "shared_event" || right?.kind !== "shared_event" || left?.userEdited || right?.userEdited) return false;
  if (!left?.eventAt || !right?.eventAt) return false;
  const leftTime = Date.parse(left.eventAt);
  const rightTime = Date.parse(right.eventAt);
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime) || Math.abs(leftTime - rightTime) > 8 * 60 * 60 * 1000) return false;

  const leftMilestones = milestoneClasses(left);
  const rightMilestones = milestoneClasses(right);
  if (leftMilestones.size !== rightMilestones.size
    || [...leftMilestones].some((milestone) => !rightMilestones.has(milestone))) return false;

  const leftWords = new Set(episodeWords(left));
  const rightWords = new Set(episodeWords(right));
  if (!leftWords.size || !rightWords.size) return false;
  const shared = [...leftWords].filter((word) => rightWords.has(word));
  const overlapRatio = shared.length / Math.min(leftWords.size, rightWords.size);
  return shared.length >= 3 && overlapRatio >= 0.45;
}

function quotedSubjects(value) {
  return [...new Set([...(String(value || "").matchAll(/["'“”]([^"'“”]{4,60})["'“”]/g))]
    .map((match) => match[1].toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean))];
}

function isLegacyNamedEventDuplicate(left, right) {
  if (left?.kind !== "shared_event" || right?.kind !== "shared_event" || left?.userEdited || right?.userEdited) return false;
  // When both memories have reliable event dates, they represent separately
  // recorded occasions even if the same movie, restaurant, or song recurs.
  if (left?.eventAt && right?.eventAt) return false;
  const leftSubjects = new Set(quotedSubjects(left?.text));
  if (![...quotedSubjects(right?.text)].some((subject) => leftSubjects.has(subject))) return false;
  return topicOverlap(left?.text, right?.text) >= 0.45;
}

function areClearlySeparateDatedEvents(left, right) {
  if (left?.kind !== "shared_event" || right?.kind !== "shared_event" || !left?.eventAt || !right?.eventAt) return false;
  if (/\b(?:remind(?:ed|ing)?|remember(?:ed|ing)?|recalled)\b/i.test(`${left?.text || ""} ${right?.text || ""}`)) return false;
  const leftTime = Date.parse(left.eventAt);
  const rightTime = Date.parse(right.eventAt);
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return false;
  return Math.abs(leftTime - rightTime) > 18 * 60 * 60 * 1000;
}

function stringList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;|]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  return [];
}

function allowedMemoryText(text) {
  if (/\b(a|an|the|and|as|at|about|because|but|by|for|from|has|have|in|into|is|of|on|or|that|their|to|was|were|with)$/i.test(text)) return false;
  return true;
}

const transientWardrobeEvent = /\b(?:put(?:ting)? on|wore|wearing|take|takes|taking|took|remove|removes|removed|removing|change|changes|changed|changing|get|gets|getting|got|help(?:ed|ing)?(?:\s+\w+){0,4}\s+(?:out of|off)|dress(?:ed|ing)?|undress(?:ed|ing)?)\b[^.]{0,120}\b(?:apron|uniform|dress|shirt|blouse|top|pants|trousers|skirt|shorts|underwear|bra|panties|robe|towel|jacket|coat|shoes|socks|swimsuit|bikini|lingerie|clothes|clothing|outfit)\b/i;
const durableWardrobeContext = /\b(?:first time|milestone|wedding|anniversary|birthday|keepsake|gift(?:ed)?|important boundary|consent boundary|promise fulfilled)\b/i;
const garmentPattern = /\b(apron|uniform|dress|shirt|blouse|top|pants|trousers|skirt|shorts|underwear|bra|panties|robe|towel|jacket|coat|shoes|socks|swimsuit|bikini|lingerie|clothes|clothing|outfit)\b/gi;
const futurePlanLanguage = /\b(?:plan(?:ned|ning)?|intend(?:ed|ing)?|going to|will|would|should|could|might|tomorrow|tonight|later|upcoming|next\s+(?:day|week|weekend|month)|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i;
const completedPlanOutcome = /\b(?:travel(?:ed|led)|went|arrived|visited|stayed|returned|left for|drove|flew|checked in|reached|completed|finished|attended)\b/i;
const explicitPlanCompletionEvidence = /\b(?:travel(?:ed|led)|went|arrived|visited|stayed|returned|left for|drove|flew|checked in|reached|completed|finished|attended|got here|made it|we(?:'re| are) here|we(?:'re| are) at)\b/i;
const temporarySceneStateEvent = /\b(?:(?:is|are|was|were)\s+currently|currently\s+(?:at|in|on|staying|visiting|travel(?:ing|ling)|eating|walking|talking|resting|getting ready))\b/i;
const MEMORY_CAPACITY_TARGET = 240;

function normalizedExactValue(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Exact names are especially damaging when hallucinated because they can
// become durable "facts" and then outvote the real memory during recall.
// Keep this deliberately narrow: it applies only to explicit naming claims,
// not every quoted phrase in a memory.
export function namedMemoryValues(value) {
  const text = String(value || "");
  if (!/\b(?:name(?:d|s| was| is)?|call(?:ed|s)?|nickname(?:d|s)?)\b/i.test(text)) return [];
  const quoted = [...text.matchAll(/["'“”‘’]([^"'“”‘’]{1,80})["'“”‘’]/g)]
    .map((match) => normalizedExactValue(match[1]))
    .filter(Boolean);
  if (quoted.length) return [...new Set(quoted)];
  const unquoted = [...text.matchAll(/\b(?:named|called|nicknamed)\s+(?:an?\s+|the\s+)?(?:[a-z][\p{L}'-]*\s+){0,5}?([A-Z][\p{L}'-]*(?:\s+[A-Z][\p{L}'-]*){0,3})(?=\s*(?:[.,;!?]|$))/gu)]
    .map((match) => normalizedExactValue(match[1]))
    .filter(Boolean);
  return [...new Set(unquoted)];
}

function exactValueAppears(value, evidence) {
  const needle = normalizedExactValue(value);
  const haystack = normalizedExactValue(evidence);
  return Boolean(needle) && (` ${haystack} `).includes(` ${needle} `);
}

function userNamingClaim(value) {
  const text = String(value || "");
  return /\b(?:the\s+)?user\b[^.!?]{0,160}\b(?:named|called|nicknamed|name\s+(?:is|was))\b/i.test(text)
    || /\b(?:named|called|nicknamed)\b[^.!?]{0,160}\b(?:the\s+)?user\b/i.test(text);
}

export function hasGroundedNamedMemory(candidate, evidence = {}) {
  if (candidate?.userEdited) return true;
  const values = namedMemoryValues(candidate?.text);
  if (!values.length) return true;
  const authoritativeText = userNamingClaim(candidate?.text)
    ? String(evidence?.userText || "")
    : String(evidence?.sourceText || evidence?.userText || "");
  // Preserve legacy memories whose original evidence predates source tracking.
  if (!authoritativeText && !evidence?.requireNamedEvidence) return true;
  return values.every((value) => exactValueAppears(value, authoritativeText));
}

export function removeUnsupportedNamedMemories(memories, messages) {
  const messageMap = new Map((Array.isArray(messages) ? messages : []).map((message) => [String(message?.id || ""), message]));
  return (Array.isArray(memories) ? memories : []).filter((memory) => {
    if (memory?.userEdited || !namedMemoryValues(memory?.text).length) return true;
    const sources = (Array.isArray(memory?.sourceMessageIds) ? memory.sourceMessageIds : [])
      .map((id) => messageMap.get(String(id)))
      .filter(Boolean);
    if (!sources.length) return true;
    const sourceText = sources.map((message) => message?.text || message?.narration || "").join("\n");
    const userText = sources.filter((message) => message?.from === "user").map((message) => message?.text || "").join("\n");
    return hasGroundedNamedMemory(memory, { sourceText, userText, requireNamedEvidence: true });
  });
}

function garmentTerms(value) {
  return new Set([...(String(value || "").toLowerCase().matchAll(garmentPattern))].map((match) => match[1]));
}

function isTemporarySceneSummary(memory) {
  return memory?.kind === "shared_event"
    && !memory?.userEdited
    && temporarySceneStateEvent.test(String(memory?.text || ""))
    && !milestoneClasses(memory).size;
}

// These are transient reports even when an extractor labels them user facts.
// Do not apply this gate to manual memories or retroactively remove records.
export function temporaryMemoryReason(memory) {
  if (memory?.userEdited) return null;
  const text = String(memory?.text || "");
  if (!new Set(["user_fact", "shared_event"]).has(memory?.kind)) return null;
  if (milestoneClasses(memory).size || durableWardrobeContext.test(text)) return null;
  if (temporarySceneStateEvent.test(text)) return "temporary_scene_state";
  if (/\b(?:just|today|this morning|this evening)\b[^.!?]{0,80}\b(?:finished|completed|had|worked)\b[^.!?]{0,100}\b(?:workday|work day|shift|meetings?)\b/i.test(text)) return "temporary_workday";
  if (/\b(?:currently|right now|today|this morning|this evening)\b[^.!?]{0,60}\b(?:tired|sleepy|hungry|thirsty|bored)\b/i.test(text)) return "temporary_mood";
  return null;
}

// A diagnostic only: never merge, delete, rescore, or change source evidence.
export function previewMemoryConsolidation(memories = [], messages = []) {
  const records = Array.isArray(memories) ? memories : [];
  const context = memoryMergeContext(records);
  const sourceMap = new Map((Array.isArray(messages) ? messages : []).map(message => [message.id, message]));
  const withSourceDate = memory => {
    if (memory.eventAt || memory.kind !== "shared_event") return memory;
    const times = (memory.sourceMessageIds || []).map(id => Date.parse(sourceMap.get(id)?.time)).filter(Number.isFinite);
    return times.length ? { ...memory, eventAt: new Date(Math.min(...times)).toISOString() } : memory;
  };
  const clearDuplicates = [];
  const reviewPairs = [];
  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      const left = records[i];
      const right = records[j];
      if (areClearlySeparateDatedEvents(withSourceDate(left), withSourceDate(right))) continue;
      const a = stableFactIdentity(left, context);
      const b = stableFactIdentity(right, context);
      // Similar words cannot override conflicting values or manual edits.
      if (a && b && a.key === b.key && a.value !== b.value) continue;
      const exact = normalizedExactValue(left.text) === normalizedExactValue(right.text);
      const sameFact = a && b && a.key === b.key && a.value && a.value === b.value;
      const pair = { memoryIds: [left.id, right.id], texts: [left.text, right.text] };
      if (!left.userEdited && !right.userEdited && (exact || sameFact)) {
        clearDuplicates.push({ ...pair, reason: exact ? "exact_text" : "same_stable_fact" });
      } else if (left.kind === right.kind && (isDuplicate(left, right, context) || topicOverlap(left.text, right.text) >= 0.65)) {
        reviewPairs.push({ ...pair, reason: left.userEdited || right.userEdited ? "manual_memory_protected" : "similarity_needs_review" });
      }
    }
  }
  return {
    total: records.length,
    capacityTarget: MEMORY_CAPACITY_TARGET,
    clearDuplicates,
    reviewPairs,
    temporaryCandidates: records.flatMap(memory => {
      const reason = temporaryMemoryReason(memory);
      return reason ? [{ memoryId: memory.id, text: memory.text, reason }] : [];
    }),
  };
}

export function lowSalienceMemoryReason(memory, evidence = {}) {
  if (memory?.userEdited || ["update", "resolve"].includes(memory?.action)) return null;
  const text = String(memory?.text || "");
  const source = [evidence.userText, evidence.sourceText].filter(Boolean).join("\n");
  // Narrow admission safeguards, not a retrospective pruning rule. Explicit
  // significance, recurring habits, and requested memories remain eligible.
  if (/\b(?:remember this|remember that|don't forget|do not forget|always|usually|lifelong|tradition|ritual|every (?:morning|night|week)|first time|first kiss|birthday|anniversary|important to me|means a lot)\b/i.test(text + "\n" + source)) return null;
  if (memory?.kind === "user_fact"
    && /\b(?:considers? (?:himself|herself|themselves)|describes? (?:himself|herself|themselves)|calls? (?:himself|herself|themselves))\b/i.test(text)
    && /\b(?:nerd|dork|goofball|goof|geek)\b/i.test(text)) return "casual_self_label";
  if (memory?.kind === "shared_event"
    && /\b(?:tickl(?:e|ed|ing)|tickle attack|woke .{0,30} up|wake-up|wakeup)\b/i.test(text)
    && !milestoneClasses(memory).size
    && !/\b(?:revealed|discovered|confided|boundary|fear|prefers|dislikes|ticklish|promise|commitment|named|nickname)\b/i.test(text)) return "routine_playful_moment";
  return null;
}

export function automaticMemoryCandidates(candidates, evidence = {}) {
  const userText = String(evidence?.userText || "");
  const userGarments = garmentTerms(userText);
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    const text = String(candidate?.text || "").replace(/\s+/g, " ").trim();
    const kind = allowedKinds.has(candidate?.kind) ? candidate.kind : "shared_event";
    const importance = Math.max(1, Math.min(5, Math.round(Number(candidate?.importance) || 0)));
    const minimumImportance = kind === "promise" || kind === "open_loop" ? 2 : 3;
    if (!text || importance < minimumImportance) return false;

    if (!hasGroundedNamedMemory({ ...candidate, kind, text }, evidence)) return false;
    if (temporaryMemoryReason({ ...candidate, kind, text })) return false;
    if (lowSalienceMemoryReason({ ...candidate, kind, text }, evidence)) return false;

    // Scene state already tracks what is happening right now. A temporary
    // status such as "currently on vacation" is not a completed recollection
    // and should not consume a durable-memory slot.
    if (isTemporarySceneSummary({ ...candidate, kind, text })) return false;

    // Routine wardrobe changes belong to scene continuity, not long-term memory.
    // A true milestone can still qualify, but only when the source supports it.
    if (kind === "shared_event" && transientWardrobeEvent.test(text) && !durableWardrobeContext.test(text)) return false;

    // A planned scene cannot become a completed event merely because the model
    // saw its details or its calendar date passed. Require completion language
    // from the user's own sourced message before storing a completed outcome.
    if (kind === "shared_event"
      && (futurePlanLanguage.test(userText) || futurePlanLanguage.test(text))
      && completedPlanOutcome.test(text)
      && !explicitPlanCompletionEvidence.test(userText)) return false;

    // A memory about something the user did must not expand one named garment
    // into other garments or the character's whole outfit.
    if (userText && /\b(?:the user|user)\b/i.test(text)) {
      const unsupportedGarment = [...garmentTerms(text)].some((garment) => !userGarments.has(garment));
      if (unsupportedGarment) return false;
    }
    return true;
  });
}

function cleanExplicitClaim(value) {
  return String(value || "")
    .replace(/^\s*(?:please\s+)?/i, "")
    .replace(/[\s.!?]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function possessiveName(value) {
  const name = String(value || "the character").trim() || "the character";
  return name.endsWith("s") ? name + "'" : name + "'s";
}

function jukeboxSongNames(text) {
  const source = String(text || "");
  const quoted = [...source.matchAll(/[“"]([^”"]{2,100})[”"]/g)].map((match) => cleanExplicitClaim(match[1]));
  if (quoted.length) return quoted;
  const picked = source.match(/\b(?:pick(?:ed)?|chose|choose|select(?:ed)?)\s+(.{2,100}?)(?:\]|[.!?]|$)/i);
  if (picked) return [cleanExplicitClaim(picked[1].replace(/\s+(?:on|from)\s+the\s+jukebox.*$/i, ""))].filter(Boolean);
  const played = source.match(/\bplay(?:ed)?\s+(.{2,100}?)\s+on\s+the\s+jukebox\b/i);
  return played ? [cleanExplicitClaim(played[1])] : [];
}

function completedJukeboxAction(text) {
  const source = String(text || "");
  if (!/\bjukebox\b/i.test(source)) return false;
  if (/\b(?:may|might|plan(?:ned)?|want(?:ed)?|will|would|going to|requests?)\b/i.test(source)) return false;
  return /\bI\b[^.!?]{0,100}\b(?:play(?:ed)?|pick(?:ed)?|chose|choose|select(?:ed)?)\b/i.test(source);
}

function sameSong(left, right) {
  const normalize = (value) => String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  return shorter.length >= 5 && shorter.split(" ").length >= 2 && longer.includes(shorter);
}

export function historicalJukeboxMemories(messages, characterName = "the character") {
  const entries = (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.from === "user" && completedJukeboxAction(message.text))
    .map((message) => ({
      id: String(message.id || ""),
      time: message.time,
      timestamp: message.time && !Number.isNaN(Date.parse(message.time)) ? Date.parse(message.time) : null,
      songs: jukeboxSongNames(message.text),
      firstVisit: /\bfirst\s+(?:visit|time)\b[\s\S]{0,100}\b(?:work|workplace|job|shift)\b/i.test(String(message.text || "")),
      workplace: /\b(?:work|workplace|job|shift)\b/i.test(String(message.text || "")),
      teasing: /\b(?:teas(?:e|ed|ing)|provocative|not subtle|get a reaction)\b/i.test(String(message.text || "")),
    }))
    .filter((entry) => entry.songs.length);
  const groups = [];
  for (const entry of entries) {
    const overlapping = groups.find((group) => entry.songs.some((song) => group.songs.some((known) => sameSong(known, song))));
    const recent = groups.at(-1);
    const nearby = recent && entry.timestamp !== null && recent.lastTimestamp !== null && entry.timestamp - recent.lastTimestamp <= 4 * 60 * 60 * 1000;
    const group = overlapping || (nearby ? recent : null);
    if (group) {
      for (const song of entry.songs) {
        if (!group.songs.some((known) => sameSong(known, song))) group.songs.push(song);
      }
      group.sourceMessageIds = [...new Set([...group.sourceMessageIds, entry.id].filter(Boolean))].slice(-8);
      group.firstVisit ||= entry.firstVisit;
      group.workplace ||= entry.workplace;
      group.teasing ||= entry.teasing;
      if (entry.timestamp !== null) group.lastTimestamp = Math.max(group.lastTimestamp ?? entry.timestamp, entry.timestamp);
      continue;
    }
    groups.push({
      songs: [...entry.songs],
      sourceMessageIds: entry.id ? [entry.id] : [],
      firstVisit: entry.firstVisit,
      workplace: entry.workplace,
      teasing: entry.teasing,
      eventAt: entry.time,
      lastTimestamp: entry.timestamp,
    });
  }
  return groups.map((group) => {
    const songs = group.songs.length === 1 ? group.songs[0] : group.songs.slice(0, -1).join(", ") + " and " + group.songs.at(-1);
    const setting = group.firstVisit
      ? "During the user's first visit to " + possessiveName(characterName) + " workplace"
      : group.workplace
        ? "During a visit to " + characterName + " at work"
        : "During a shared outing with " + characterName;
    return {
      kind: "shared_event",
      text: setting + ", the user played " + songs + " on the jukebox" + (group.teasing ? " to tease " + characterName : "") + ".",
      keywords: ["jukebox", "songs", "workplace", ...group.songs],
      importance: group.firstVisit ? 4 : 3,
      sourceMessageIds: group.sourceMessageIds,
      eventAt: group.eventAt || null,
    };
  });
}

export function explicitMemoryCandidates(userText, characterName = "the character") {
  const text = String(userText || "").trim();
  if (!text) return [];
  const candidates = [];
  const remember = text.match(/^\s*(?:(?:please\s+)?(?:remember|don't forget|do not forget)|I\s+(?:really\s+)?want\s+you\s+to\s+remember)\s+(?:that\s+)?(.{3,420}?)(?:[.!?]|$)/i);
  if (remember) {
    const claim = cleanExplicitClaim(remember[1]);
    if (claim) candidates.push({
      kind: "user_fact",
      text: "The user explicitly asked the character to remember that " + claim + ".",
      keywords: recallWords(claim),
      importance: 5,
    });
  }
  const favorite = text.match(/\bmy\s+favou?rite\s+([^.!?]{2,80}?)\s+is\s+([^.!?]{1,180})(?:[.!?]|$)/i);
  if (favorite) {
    const subject = cleanExplicitClaim(favorite[1]);
    const value = cleanExplicitClaim(favorite[2]);
    if (subject && value) candidates.push({
      kind: "preference",
      text: "The user's favorite " + subject + " is " + value + ".",
      keywords: [subject, value],
      importance: 4,
    });
  }
  const allergy = text.match(/\bI(?:'m| am)\s+allergic\s+to\s+([^.!?]{1,180})(?:[.!?]|$)/i);
  if (allergy) {
    const value = cleanExplicitClaim(allergy[1]);
    if (value) candidates.push({
      kind: "boundary",
      text: "The user is allergic to " + value + ".",
      keywords: ["allergy", value],
      importance: 5,
    });
  }
  return [...candidates, ...historicalJukeboxMemories([{ from: "user", text }], characterName)];
}

export function normalizeMemoryCandidate(candidate, sourceMessageId, now = new Date()) {
  const text = String(candidate?.text || "").replace(/\s+/g, " ").trim();
  if (text.length < 8 || text.length > 500 || !allowedMemoryText(text)) return null;
  const kind = allowedKinds.has(candidate?.kind) ? candidate.kind : "shared_event";
  const explicitKeywords = stringList(candidate?.keywords);
  const keywords = [...new Set([...explicitKeywords, ...words(text)])].slice(0, 16);
  const candidateSourceIds = Array.isArray(candidate?.sourceMessageIds)
    ? candidate.sourceMessageIds.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const sourceMessageIds = [...new Set([
    ...candidateSourceIds,
    ...(sourceMessageId ? [String(sourceMessageId)] : []),
  ])].slice(-8);
  const eventAt = typeof candidate?.eventAt === "string" && !Number.isNaN(Date.parse(candidate.eventAt))
    ? new Date(candidate.eventAt).toISOString()
    : undefined;
  return {
    id: typeof candidate?.id === "string" && candidate.id.trim() ? candidate.id.trim() : crypto.randomUUID(),
    kind,
    text,
    keywords,
    importance: Math.max(1, Math.min(5, Math.round(Number(candidate?.importance) || 3))),
    createdAt: typeof candidate?.createdAt === "string" && !Number.isNaN(Date.parse(candidate.createdAt)) ? new Date(candidate.createdAt).toISOString() : now.toISOString(),
    updatedAt: now.toISOString(),
    sourceMessageIds,
    ...(eventAt ? { eventAt } : {}),
    ...(candidate?.userEdited ? { userEdited: true } : {}),
  };
}

function overlap(left, right) {
  const a = new Set(words(left));
  const b = new Set(words(right));
  if (!a.size || !b.size) return 0;
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / Math.min(a.size, b.size);
}

function namedPreferenceSubject(memory) {
  if (memory?.kind !== "preference") return "";
  const text = String(memory.text || "").toLowerCase();
  const match = text.match(/\b(?:the\s+)?user(?:'s)?\s+(?:current\s+)?favou?rite\s+(.{2,80}?)\s+(?:is|are|was|were)\b/i);
  return match ? match[1].replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim() : "";
}

function isDuplicate(left, right, context = {}) {
  // A lasting preference/fact and an episode illustrating it are distinct memories.
  const durableKinds = new Set(["preference", "boundary", "user_fact"]);
  if ((durableKinds.has(left.kind) && right.kind === "shared_event")
    || (durableKinds.has(right.kind) && left.kind === "shared_event")) return false;
  const leftRepeatedFact = repeatedFactKey(left, { userAliases: new Set(), ...context });
  const rightRepeatedFact = repeatedFactKey(right, { userAliases: new Set(), ...context });
  if (leftRepeatedFact && rightRepeatedFact && leftRepeatedFact !== rightRepeatedFact
    && leftRepeatedFact.replace(/^(?:positive|negative)-/, "") === rightRepeatedFact.replace(/^(?:positive|negative)-/, "")) return false;
  const leftPreference = namedPreferenceSubject(left);
  const rightPreference = namedPreferenceSubject(right);
  if (leftPreference && leftPreference === rightPreference) return true;
  const leftFact = stableFactIdentity(left, context);
  const rightFact = stableFactIdentity(right, context);
  if (leftFact?.key && leftFact.key === rightFact?.key) {
    if (left?.userEdited || right?.userEdited) return true;
    return Boolean(leftFact.value && leftFact.value === rightFact.value);
  }
  // Source windows and recurring activities can overlap. Reliable event dates
  // take precedence so separate occasions never collapse into one memory.
  if (areClearlySeparateDatedEvents(left, right)) return false;
  if (isSameEpisodeRefinement(left, right)) return true;
  if (overlap(left.text, right.text) >= 0.72) return true;
  if (left.kind !== right.kind && topicOverlap(left.text, right.text) >= 0.72) return true;
  if (isSamePlanLifecycle(left, right)) return true;
  if (isSourceBackedDuplicate(left, right)) return true;
  if (isLegacyNamedEventDuplicate(left, right)) return true;
  const leftText = String(left.text || "").toLowerCase();
  const rightText = String(right.text || "").toLowerCase();
  const identifyingKeywords = [...new Set([...stringList(left.keywords), ...stringList(right.keywords)])]
    .filter((keyword) => /[\s-]|\d/.test(keyword) || keyword.length >= 12);
  return identifyingKeywords.some((keyword) => leftText.includes(keyword) && rightText.includes(keyword));
}

function sourcedEvent(memory, sourceMap) {
  if (memory.eventAt || memory.kind !== "shared_event") return memory;
  const dates = (memory.sourceMessageIds || []).map(id => Date.parse(sourceMap.get(id)?.time)).filter(Number.isFinite);
  return dates.length ? { ...memory, eventAt: new Date(Math.min(...dates)).toISOString() } : memory;
}

function repeatedFactKey(memory, context) {
  const text = String(memory?.text || "");
  if (memory?.kind === "preference") {
    const match = text.match(/^((?:the )?user|[A-Z][a-z'-]+)\s+(likes|loves|enjoys|hates|dislikes)\s+(.+?)[.!]?$/i);
    if (match) {
      const subject = normalizedExactValue(match[1]).replace(/^the /, "");
      const polarity = /^(?:hates|dislikes)$/i.test(match[2]) ? "negative" : "positive";
      return `${polarity}-preference:${context.userAliases.has(subject) ? "user" : subject}:${normalizedExactValue(match[3])}`;
    }
  }
  if (memory?.kind === "user_fact") {
    const match = text.match(/^(.+?)\s+(?:share|live together in)\s+(?:a|an|the)\s+(.+?)[.!]?$/i);
    if (match && /\band\b/i.test(match[1])) {
      const subjects = match[1].split(/\s+and\s+/i).map(subject => normalizedExactValue(subject).replace(/^the /, ""))
        .map(subject => context.userAliases.has(subject) ? "user" : subject).sort();
      if (subjects.length === 2) return `shared-home:${subjects.join("|")}:${normalizedExactValue(match[2])}`;
    }
  }
  return null;
}

// Prospective only: reading an old collection must not perform new cleanup.
function isIncomingMemoryUpdate(existing, incoming, context, sourceMap) {
  const left = sourcedEvent(existing, sourceMap);
  const right = sourcedEvent(incoming, sourceMap);
  if (areClearlySeparateDatedEvents(left, right)) return false;
  const key = repeatedFactKey(existing, context);
  const incomingKey = repeatedFactKey(incoming, context);
  if (key && incomingKey && key !== incomingKey && key.replace(/^(?:positive|negative)-/, "") === incomingKey.replace(/^(?:positive|negative)-/, "")) return false;
  if (key && key === incomingKey) return true;
  if (isSameEpisodeRefinement(left, right)) return true;
  return isDuplicate(left, right, context);
}

function decisionTopicOverlap(left, right) {
  const ignored = new Set(["promise", "promised", "requested", "prepare", "prepared", "cook", "make", "made", "strong", "special", "her", "his", "their", "them"]);
  const a = new Set(evidenceWords({ text: left }).filter(word => !ignored.has(word)));
  const b = new Set(evidenceWords({ text: right }).filter(word => !ignored.has(word)));
  return [...a].filter(word => b.has(word)).length;
}

function episodeContinuity(target, evidenceId, messages) {
  const evidenceIndex = messages.findIndex(message => message.id === evidenceId);
  const sourceIds = new Set(target.sourceMessageIds || []);
  let lastSourceIndex = -1;
  for (let index = 0; index <= evidenceIndex; index++) if (sourceIds.has(messages[index]?.id)) lastSourceIndex = index;
  if (lastSourceIndex < 0 || evidenceIndex - lastSourceIndex > 24) return false;
  // Story boundaries, not time spent away from the app, separate occasions.
  const intervening = messages.slice(lastSourceIndex + 1, evidenceIndex + 1)
    .map(message => [message.text, message.narration].filter(Boolean).join(" ")).join("\n");
  return !/\b(?:the next (?:morning|day|evening|week)|another day|days? later|weeks? later|a second visit|our next visit|a new outing)\b/i.test(intervening);
}

export function recentMemoryEpisodes(memories = [], messages = [], windowMessages = []) {
  const evidenceId = windowMessages.at(-1)?.id;
  if (!evidenceId) return [];
  return memories.filter(memory => memory.kind === "shared_event" && !memory.userEdited
    && episodeContinuity(memory, evidenceId, messages))
    .sort((left, right) => {
      const latestIndex = memory => Math.max(-1, ...(memory.sourceMessageIds || []).map(id => messages.findIndex(message => message.id === id)));
      return latestIndex(right) - latestIndex(left);
    }).slice(0, 6);
}

export function validateMemoryDecision(target, candidate, messages = []) {
  if (!candidate?.action) return true; // Older chat capture uses add-only candidates.
  if (!["add", "update", "resolve"].includes(candidate.action)) return false;
  const source = messages.find(message => message.id === candidate.evidenceMessageId);
  const quote = candidate.evidenceQuote;
  const sourceText = [source?.text, source?.narration].filter(Boolean).join("\n");
  if (!source || !(candidate.sourceMessageIds || []).includes(source.id)
    || typeof quote !== "string" || quote.length < 8 || quote.length > 500 || !sourceText.includes(quote)) return false;
  if (candidate.action === "add") return !candidate.targetMemoryId;
  if (!target || target.id !== candidate.targetMemoryId || target.userEdited) return false;
  // A rescan may revisit evidence older than an already-applied decision.
  // Replay must not overwrite a newer fact or a completed commitment.
  const evidenceTime = Date.parse(source.time);
  const targetEvidenceTimes = (target.sourceMessageIds || [])
    .map(id => Date.parse(messages.find(message => message.id === id)?.time)).filter(Number.isFinite);
  if (Number.isFinite(evidenceTime) && targetEvidenceTimes.some(time => time > evidenceTime)) return false;
  const context = memoryMergeContext([target], [candidate]);
  const leftSubject = canonicalFactSubject(target, context);
  const rightSubject = canonicalFactSubject(candidate, context);
  if (leftSubject && rightSubject && leftSubject !== rightSubject) return false;
  const leftKey = repeatedFactKey(target, context);
  const rightKey = repeatedFactKey(candidate, context);
  if (leftKey && rightKey && leftKey !== rightKey
    && leftKey.replace(/^(?:positive|negative)-/, "") === rightKey.replace(/^(?:positive|negative)-/, "")) return false;
  const a = stableFactIdentity(target, context);
  const b = stableFactIdentity(candidate, context);
  if (a && b && a.key === b.key && a.value !== b.value) return false;
  if (namedMemoryValues(target.text).some(value => !exactValueAppears(value, candidate.text))) return false;
  if (candidate.action === "resolve") {
    if (!isUnresolvedMemory(target) || candidate.kind !== "shared_event" || source.from !== "user") return false;
    if (/\b(?:did not|didn't|not yet|going to|will|would|might|could|should|if|pretend|imagine)\b/i.test(quote)) return false;
    if (!/\b(?:prepared|cooked|made|served|set|put|finished|completed|delivered|arrived|went|visited|returned|bought|gave|cancelled|canceled|called off|no longer want|decided not to)\b/i.test(quote)) return false;
    const targetTime = Date.parse(target.eventAt || target.createdAt);
    const sourceTime = Date.parse(source.time);
    if (Number.isFinite(targetTime) && Number.isFinite(sourceTime) && sourceTime < targetTime) return false;
    return decisionTopicOverlap(target.text, quote) >= 2 && decisionTopicOverlap(target.text, candidate.text) >= 2;
  }
  if (target.kind !== candidate.kind) return false;
  const map = new Map(messages.map(message => [message.id, message]));
  if (target.kind === "shared_event") {
    if (!episodeContinuity(target, source.id, messages)) return false;
    const previousMilestones = milestoneClasses(target);
    const nextMilestones = milestoneClasses(candidate);
    if (previousMilestones.size !== nextMilestones.size
      || [...previousMilestones].some(value => !nextMilestones.has(value))) return false;
    if (decisionTopicOverlap(target.text, quote) < 1) return false;
  } else if (areClearlySeparateDatedEvents(sourcedEvent(target, map), sourcedEvent(candidate, map))) return false;
  return (a && b && a.key === b.key && a.value === b.value)
    || decisionTopicOverlap(target.text, candidate.text) >= 2;
}

function forgottenHash(value) {
  return createHash("sha256").update(String(value || "").toLowerCase().replace(/\s+/g, " ").trim()).digest("hex");
}

function forgottenTokenHashes(memory) {
  return [...new Set(words([memory?.text, ...(memory?.keywords || [])].filter(Boolean).join(" ")).map(forgottenHash))];
}

function matchesForgottenMemory(memory, forgotten) {
  // Support any early development tombstones that still contain readable text.
  if (forgotten?.text && isDuplicate(memory, forgotten)) return true;
  if (forgotten?.fingerprint && forgotten.fingerprint === forgottenHash(memory?.text)) return true;
  const memorySources = new Set(memory?.sourceMessageIds || []);
  const sharesSource = (forgotten?.sourceMessageIds || []).some((id) => memorySources.has(id));
  const memoryTokens = new Set(forgottenTokenHashes(memory));
  const forgottenTokens = new Set(forgotten?.tokenHashes || []);
  const sharedTokens = [...memoryTokens].filter((token) => forgottenTokens.has(token)).length;
  const tokenOverlap = memoryTokens.size && forgottenTokens.size ? sharedTokens / Math.min(memoryTokens.size, forgottenTokens.size) : 0;
  return (sharesSource && tokenOverlap >= 0.35) || tokenOverlap >= 0.72;
}

export function rememberForgottenMemory(forgotten, memory, now = new Date()) {
  if (!memory?.text) return Array.isArray(forgotten) ? forgotten : [];
  const tombstone = {
    kind: allowedKinds.has(memory.kind) ? memory.kind : "shared_event",
    fingerprint: forgottenHash(memory.text),
    tokenHashes: forgottenTokenHashes(memory).slice(0, 32),
    sourceMessageIds: [...new Set((memory.sourceMessageIds || []).map(String).filter(Boolean))].slice(-8),
    forgottenAt: now.toISOString(),
  };
  return [
    tombstone,
    ...(Array.isArray(forgotten) ? forgotten : []).filter((item) => item?.fingerprint !== tombstone.fingerprint),
  ].slice(0, 120);
}

export function normalizeForgottenMemories(forgotten) {
  return (Array.isArray(forgotten) ? forgotten : []).flatMap((item) => {
    if (typeof item?.fingerprint === "string" && /^[a-f0-9]{64}$/i.test(item.fingerprint)) {
      return [{
        kind: allowedKinds.has(item.kind) ? item.kind : "shared_event",
        fingerprint: item.fingerprint.toLowerCase(),
        tokenHashes: [...new Set((item.tokenHashes || []).map(String).filter((token) => /^[a-f0-9]{64}$/i.test(token)).map((token) => token.toLowerCase()))].slice(0, 32),
        sourceMessageIds: [...new Set((item.sourceMessageIds || []).map(String).filter(Boolean))].slice(-8),
        forgottenAt: typeof item.forgottenAt === "string" && !Number.isNaN(Date.parse(item.forgottenAt)) ? new Date(item.forgottenAt).toISOString() : new Date(0).toISOString(),
      }];
    }
    return item?.text ? rememberForgottenMemory([], item, item.forgottenAt ? new Date(item.forgottenAt) : new Date()) : [];
  }).slice(0, 120);
}

export function allowForgottenMemory(forgotten, memory) {
  const normalized = normalizeMemoryCandidate(memory);
  if (!normalized) return Array.isArray(forgotten) ? forgotten : [];
  return (Array.isArray(forgotten) ? forgotten : []).filter((item) => !matchesForgottenMemory(normalized, item));
}

function memoryDetailScore(memory) {
  const sources = new Set(memory?.sourceMessageIds || []).size;
  const identifyingKeywords = stringList(memory?.keywords).filter((keyword) => /[\s-]|\d/.test(keyword) || keyword.length >= 12).length;
  return sources * 8 + identifyingKeywords * 3 + Math.min(8, words(memory?.text).length / 4);
}

function rememberMemoryVersion(target, previous) {
  const versions = [...(target.previousVersions || [])];
  if (previous.text !== target.text || previous.kind !== target.kind) versions.push(previous);
  target.previousVersions = [...new Map(versions.map(version => [version.kind + "\0" + version.text, version])).values()];
}

function memoryVersion(memory) {
  return { text: memory.text, kind: memory.kind, sourceMessageIds: [...(memory.sourceMessageIds || [])],
    eventAt: memory.eventAt, updatedAt: memory.updatedAt };
}

function combineMemory(target, incoming, now) {
  const previous = memoryVersion(target);
  const targetPriority = kindPriority(target);
  const incomingPriority = kindPriority(incoming);
  const preferenceCorrection = !target.userEdited
    && namedPreferenceSubject(target)
    && namedPreferenceSubject(target) === namedPreferenceSubject(incoming)
    && Date.parse(incoming.createdAt || incoming.updatedAt || 0) >= Date.parse(target.createdAt || target.updatedAt || 0);
  if (incoming.userEdited && !target.userEdited) {
    target.kind = incoming.kind;
    target.text = incoming.text;
    target.userEdited = true;
    if (incoming.eventAt) target.eventAt = incoming.eventAt;
  } else if (preferenceCorrection) {
    target.kind = incoming.kind;
    target.text = incoming.text;
    target.keywords = [...new Set(incoming.keywords || [])].slice(0, 20);
  } else if (!target.userEdited && incomingPriority > targetPriority) {
    target.kind = incoming.kind;
    target.text = incoming.text;
    if (incoming.eventAt) target.eventAt = incoming.eventAt;
  } else if (!target.userEdited && incomingPriority === targetPriority && (memoryDetailScore(incoming) > memoryDetailScore(target)
    || (memoryDetailScore(incoming) === memoryDetailScore(target) && String(incoming.text || "").length >= String(target.text || "").length))) {
    target.text = incoming.text;
  }
  if (!preferenceCorrection) target.keywords = [...new Set([...(target.keywords || []), ...(incoming.keywords || [])])].slice(0, 20);
  target.importance = Math.max(Number(target.importance) || 1, Number(incoming.importance) || 1);
  target.updatedAt = now.toISOString();
  target.sourceMessageIds = [...new Set([...(target.sourceMessageIds || []), ...(incoming.sourceMessageIds || [])])];
  if (!target.eventAt && incoming.eventAt) target.eventAt = incoming.eventAt;
  else if (target.kind === "shared_event" && incoming.kind === "shared_event" && target.eventAt && incoming.eventAt) {
    target.eventAt = Date.parse(incoming.eventAt) < Date.parse(target.eventAt) ? incoming.eventAt : target.eventAt;
  }
  target.previousVersions = [...(target.previousVersions || []), ...(incoming.previousVersions || [])];
  if (incoming.resolution && !target.resolution) target.resolution = { ...incoming.resolution };
  rememberMemoryVersion(target, previous);
  // Duplicate consolidation must preserve the alternate wording/details too.
  rememberMemoryVersion(target, memoryVersion(incoming));
}

export function addManualMemory(existing, input, now = new Date()) {
  const candidate = {
    ...input,
    userEdited: true,
    keywords: Array.isArray(input?.keywords) && input.keywords.length ? input.keywords : recallWords(input?.text),
  };
  return mergeMemories(existing, [candidate], undefined, now);
}

export function editMemory(memories, memoryId, patch, now = new Date()) {
  const source = Array.isArray(memories) ? memories : [];
  const current = source.find((memory) => memory.id === memoryId);
  if (!current) return source;
  const text = String(patch?.text ?? current.text).replace(/\s+/g, " ").trim();
  if (text.length < 8 || text.length > 500 || !allowedMemoryText(text)) throw new Error("Write a complete memory between 8 and 500 characters.");
  const kind = allowedKinds.has(patch?.kind) ? patch.kind : current.kind;
  const importance = Math.max(1, Math.min(5, Math.round(Number(patch?.importance) || Number(current.importance) || 3)));
  const requestedEventAt = patch?.eventAt;
  const eventAt = requestedEventAt === null || requestedEventAt === ""
    ? undefined
    : typeof requestedEventAt === "string" && !Number.isNaN(Date.parse(requestedEventAt))
      ? new Date(requestedEventAt).toISOString()
      : current.eventAt;
  return retainMemories(source.map((memory) => memory.id === memoryId ? {
    ...memory,
    kind,
    text,
    keywords: recallWords(text).slice(0, 20),
    importance,
    updatedAt: now.toISOString(),
    userEdited: true,
    ...(eventAt ? { eventAt } : { eventAt: undefined }),
  } : memory));
}

function memoryDisplayOrder(left, right) {
  return Number(right.importance || 0) - Number(left.importance || 0)
    || String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
}

function protectedFromAutomaticEviction(memory) {
  if (memory?.userEdited) return true;
  if (new Set(["boundary", "preference", "user_fact", "shared_creation", "promise", "open_loop"]).has(memory?.kind)) return true;
  if (Number(memory?.importance || 0) >= 5) return true;
  return milestoneClasses(memory).size > 0;
}

function retentionScore(memory) {
  const importance = Math.max(1, Math.min(5, Number(memory?.importance || 1)));
  const sources = new Set(memory?.sourceMessageIds || []).size;
  const specificKeywords = stringList(memory?.keywords)
    .filter((keyword) => /[\s-]|\d/.test(keyword) || keyword.length >= 12).length;
  const dated = memory?.eventAt && !Number.isNaN(Date.parse(memory.eventAt)) ? 1 : 0;
  return importance * 100 + Math.min(8, sources) * 8 + Math.min(8, specificKeywords) * 3 + dated * 5;
}

export function retainMemories(memories, capacity = MEMORY_CAPACITY_TARGET) {
  const source = Array.isArray(memories) ? memories : [];
  const target = Math.max(0, Math.round(Number(capacity) || 0));
  const protectedMemories = source.filter(protectedFromAutomaticEviction);
  const protectedSet = new Set(protectedMemories);
  const automaticSlots = Math.max(0, target - protectedMemories.length);
  const retainedAutomatic = source
    .filter((memory) => !protectedSet.has(memory))
    .sort((left, right) => retentionScore(right) - retentionScore(left)
      || String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
    .slice(0, automaticSlots);
  const active = new Set([...protectedMemories, ...retainedAutomatic]);
  // Capacity limits the active collection, never the saved shared history.
  // Keep archives in the same collection so recall, editing, deletion and scans
  // all operate on one authoritative set rather than disconnected stores.
  return source.map(memory => {
    const { archived: previous, ...record } = memory;
    return active.has(memory) ? record : { ...record, archived: true };
  }).sort(memoryDisplayOrder);
}

export function mergeMemories(existing, candidates, sourceMessageId, now = new Date(), options = {}) {
  const forgotten = Array.isArray(options?.forgottenMemories) ? options.forgottenMemories : [];
  const mergeContext = memoryMergeContext(existing, candidates);
  const sourceMap = new Map((Array.isArray(options?.messages) ? options.messages : []).map(message => [message.id, message]));
  const memories = [];
  for (const item of Array.isArray(existing) ? existing : []) {
    if (!allowedMemoryText(String(item?.text || ""))) continue;
    if (isTemporarySceneSummary(item)) continue;
    const copy = { ...item, keywords: [...(item.keywords || [])], sourceMessageIds: [...(item.sourceMessageIds || [])] };
    if (sourceMap.size && candidates?.length) {
      const dated = sourcedEvent(copy, sourceMap);
      if (dated.eventAt) copy.eventAt = dated.eventAt;
    }
    const match = memories.find((memory) => isDuplicate(memory, copy, mergeContext));
    if (match) combineMemory(match, copy, now);
    else memories.push(copy);
  }
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    // Historical extraction can rediscover a superseded wording. Keep its saved
    // history, but never turn that old wording back into a new active fact/plan.
    const replay = memories.some(memory => {
      if (!memory.previousVersions?.length || !candidate.sourceMessageIds?.length) return false;
      const knownSources = new Set([...(memory.sourceMessageIds || []), ...memory.previousVersions.flatMap(version => version.sourceMessageIds || [])]);
      if (!candidate.sourceMessageIds.every(id => knownSources.has(id))) return false;
      return memory.previousVersions.some(version => version.kind === candidate.kind && isDuplicate(version, candidate, mergeContext));
    });
    if (replay) continue;
    const decisionTarget = candidate?.targetMemoryId ? memories.find(memory => memory.id === candidate.targetMemoryId) : null;
    if (!validateMemoryDecision(decisionTarget, candidate, options.messages || [])) continue;
    const normalized = normalizeMemoryCandidate(candidate, sourceMessageId, now);
    if (!normalized) continue;
    const dated = sourcedEvent(normalized, sourceMap);
    if (dated.eventAt) normalized.eventAt = dated.eventAt;
    if (!normalized.userEdited && forgotten.some((item) => matchesForgottenMemory(normalized, item))) continue;
    if (decisionTarget && ["update", "resolve"].includes(candidate.action)) {
      const previous = memoryVersion(decisionTarget);
      decisionTarget.text = normalized.text;
      decisionTarget.kind = normalized.kind;
      decisionTarget.keywords = [...new Set([...(decisionTarget.keywords || []), ...normalized.keywords])];
      decisionTarget.sourceMessageIds = [...new Set([...(decisionTarget.sourceMessageIds || []), ...normalized.sourceMessageIds])];
      decisionTarget.importance = Math.max(Number(decisionTarget.importance) || 1, normalized.importance);
      decisionTarget.updatedAt = now.toISOString();
      if (candidate.action === "resolve") {
        decisionTarget.eventAt = normalized.eventAt;
        decisionTarget.resolution = { resolvedAt: now.toISOString(), evidenceMessageId: candidate.evidenceMessageId };
      }
      rememberMemoryVersion(decisionTarget, previous);
      continue;
    }
    const match = memories.find((memory) => isIncomingMemoryUpdate(memory, normalized, mergeContext, sourceMap));
    if (match) {
      combineMemory(match, normalized, now);
    } else {
      memories.push(normalized);
    }
  }
  return retainMemories(memories);
}

function memoryTimestamp(memory) {
  const value = memory?.eventAt || memory?.createdAt;
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? null : parsed;
}

function relativeTimeTarget(query, now) {
  const source = String(query || "");
  const match = source.match(/\b(?:about\s+)?(?:a|one|1)\s+(week|month|year)\s+ago\b/i);
  let days;
  let toleranceDays;
  if (match) {
    days = match[1].toLowerCase() === "week" ? 7 : match[1].toLowerCase() === "month" ? 30 : 365;
    toleranceDays = Math.max(3, Math.round(days * 0.35));
  } else if (/\byesterday\b/i.test(source)) {
    days = 1;
    toleranceDays = 1;
  } else if (/\b(?:last|the other) night\b/i.test(source)) {
    days = 1;
    toleranceDays = 3;
  } else if (/\blast week\b/i.test(source)) {
    days = 7;
    toleranceDays = 4;
  } else if (/\blast month\b/i.test(source)) {
    days = 30;
    toleranceDays = 15;
  } else if (/\blast year\b/i.test(source)) {
    days = 365;
    toleranceDays = 60;
  } else {
    return null;
  }
  return { target: now.getTime() - days * 86_400_000, tolerance: toleranceDays * 86_400_000 };
}

export function includeConflictingFacts(allMemories, selectedMemories, limit = 8) {
  const all = Array.isArray(allMemories) ? allMemories : [];
  const selected = Array.isArray(selectedMemories) ? selectedMemories : [];
  const context = memoryMergeContext(all, []);
  const result = [];
  const included = new Set();
  for (const memory of selected) {
    if (!memory || included.has(memory.id)) continue;
    result.push(memory);
    included.add(memory.id);
    const identity = stableFactIdentity(memory, context);
    if (identity) {
      for (const sibling of all) {
        if (included.has(sibling?.id)) continue;
        const siblingIdentity = stableFactIdentity(sibling, context);
        if (siblingIdentity?.key === identity.key && siblingIdentity.value !== identity.value) {
          result.push(sibling);
          included.add(sibling.id);
        }
      }
    }
    if (result.length >= limit) break;
  }
  return result.slice(0, Math.max(0, limit));
}

export function hasConfidentMemoryMatch(memories, query) {
  const selected = Array.isArray(memories) ? memories : [];
  if (!selected.length) return false;
  if (relativeTimeTarget(query, new Date()) || /\b(?:first|earliest|last|latest|most recent|other night)\b/i.test(String(query || ""))) return true;
  const queryWords = new Set(recallWords(query));
  return selected.some((memory) => {
    const memoryWords = new Set(recallWords([...(memory?.keywords || []), memory?.text].join(" ")));
    const distinctiveMatches = [...queryWords].filter((word) => memoryWords.has(word) && !broadRecallWords.has(word)).length;
    const multiwordKeyword = stringList(memory?.keywords).some((keyword) => keyword.includes(" ") && keyword.length >= 5 && String(query || "").toLowerCase().includes(keyword));
    if (multiwordKeyword || distinctiveMatches >= 2) return true;
    return new Set(["boundary", "preference", "user_fact"]).has(memory?.kind) && distinctiveMatches >= 1;
  });
}

export function selectRelevantMemories(memories, query, limit = 8, now = new Date()) {
  const queryTerms = recallWords(query).filter((word) => !temporalRecallWords.has(word));
  const queryWords = new Set(queryTerms);
  const recallQuestion = isRecallQuestion(query);
  const relativeTarget = relativeTimeTarget(query, now);
  const wantsFirst = /\b(?:first|earliest)\b/i.test(String(query || ""));
  const wantsLatest = /\b(?:last|latest|most recent|other night)\b/i.test(String(query || ""));
  const factContext = memoryMergeContext(memories, []);
  const scored = (Array.isArray(memories) ? memories : [])
    .map(memory => {
      // Earlier episode details remain recallable after a summary is refined.
      // Never inject superseded preferences or unfulfilled plan wording into
      // current recall: those versions are audit history, not current facts.
      if (memory.kind !== "shared_event") return memory;
      const earlierDetails = (memory.previousVersions || []).filter(version => version.kind === "shared_event"
        && queryTerms.some(term => !broadRecallWords.has(term) && recallWords(version.text).includes(term)));
      if (!earlierDetails.length) return memory;
      return { ...memory, text: [memory.text, ...earlierDetails.slice(-2).map(version => "Earlier details of this event: " + version.text)].join("\n") };
    })
    .map((memory) => {
      const textWords = new Set(recallWords(memory.text));
      const keywordWords = new Set(recallWords((memory.keywords || []).join(" ")));
      const textMatches = [...queryWords].filter((word) => textWords.has(word)).length;
      const keywordOnlyMatches = [...queryWords].filter((word) => !textWords.has(word) && keywordWords.has(word)).length;
      const matches = textMatches + keywordOnlyMatches;
      const distinctiveMatches = [...queryWords].filter((word) => (textWords.has(word) || keywordWords.has(word)) && !broadRecallWords.has(word));
      const exactKeyword = stringList(memory.keywords).some((keyword) => {
        const terms = recallWords(keyword);
        return terms.length >= 2 && terms.every((term) => queryWords.has(term));
      });
      const timestamp = memoryTimestamp(memory);
      const temporalDistance = relativeTarget && timestamp !== null ? Math.abs(timestamp - relativeTarget.target) : null;
      const temporalRelevance = temporalDistance !== null && temporalDistance <= relativeTarget.tolerance
        ? Math.max(4, 16 - Math.round(temporalDistance / 86_400_000))
        : 0;
      const stableFactBoost = stableFactIdentity(memory, factContext) && textMatches ? 8 : 0;
      const relevance = textMatches * 10 + keywordOnlyMatches * 3 + distinctiveMatches.length * 3 + (exactKeyword ? 5 : 0) + temporalRelevance + stableFactBoost;
      return { memory, matches, distinctiveMatches: distinctiveMatches.length, relevance, temporalRelevance, timestamp, score: relevance + Number(memory.importance || 1) };
    })
    .filter((item) => item.relevance > 0);
  if (!scored.length) return [];
  const strongestMatchCount = Math.max(...scored.map((item) => item.matches));
  const strongestRelevance = Math.max(...scored.map((item) => item.relevance));
  const minimumMatches = strongestMatchCount === 0
    ? 0
    : (wantsFirst || wantsLatest) && strongestMatchCount >= 2
      ? strongestMatchCount
      : Math.max(1, strongestMatchCount - 1);
  let relevant = scored.filter((item) => {
    if (item.matches < minimumMatches || item.relevance < strongestRelevance - (recallQuestion ? 6 : 12)) return false;
    if (!recallQuestion) return true;
    if (item.temporalRelevance > 0 || item.matches >= 2 || item.distinctiveMatches >= 1) return true;
    return queryTerms.length === 1 && item.matches === 1;
  });
  const dated = relevant.filter((item) => item.timestamp !== null);
  if ((wantsFirst || wantsLatest) && dated.length > 1) {
    const targetTimestamp = wantsFirst
      ? Math.min(...dated.map((item) => item.timestamp))
      : Math.max(...dated.map((item) => item.timestamp));
    relevant = relevant.filter((item) => item.timestamp === targetTimestamp);
  }
  const effectiveLimit = recallQuestion && queryTerms.length <= 2 ? Math.min(limit, 4) : limit;
  const selected = relevant
    .sort((a, b) => b.score - a.score || String(b.memory.updatedAt).localeCompare(String(a.memory.updatedAt)))
    .slice(0, Math.max(0, effectiveLimit))
    .map(({ memory }) => memory);
  return includeConflictingFacts(memories, selected, effectiveLimit);
}

export function memoryRecallGuidance(memories, query, options = {}) {
  if (!options?.recallIntent && !isRecallQuestion(query)) return "";
  if (Array.isArray(memories) && memories.length) {
    const context = memoryMergeContext(memories, []);
    const facts = memories.map((memory) => stableFactIdentity(memory, context)).filter(Boolean);
    const conflictingFact = facts.some((fact, index) => facts.some((other, otherIndex) => otherIndex !== index && other.key === fact.key && other.value !== fact.value));
    if (conflictingFact) {
      return "The user is explicitly asking you to remember, but the relevant durable memories conflict about a concrete fact. Do not silently choose one value or blend them. Say naturally that your memory of that exact detail is uncertain, briefly state the conflicting versions when useful, and invite the user to correct the record. Do not guess.";
    }
    return "The user is explicitly asking you to remember a past event. Answer only from the relevant durable memories that existed before this latest turn and from older visible conversation. For exact names, nicknames, titles, and labels, treat the supplied relevant durable memory as authoritative over an unsupported name from an earlier character reply; never repeat the character's prior guess unless a user message established it. Details supplied in the user's current message are a reminder, not proof that you already remembered them. Distinguish what was previously recorded from what the user just told you, and never fill missing details with a plausible guess.";
  }
  return "The user is explicitly asking you to remember a past event, but no previously saved memory directly answers the question. Say naturally that you do not remember the specific detail. If the current message supplies the answer, acknowledge it as a reminder or newly provided context rather than pretending you already knew it. Do not guess or reconstruct a likely event.";
}

export function forgetMemory(memories, memoryId) {
  return (Array.isArray(memories) ? memories : []).filter((memory) => memory.id !== memoryId);
}
