export const CHARACTER_PROFILE_VERSION = 4;

const nonTextPerformance = /\b(?:voice|pitch|breath(?:ing)?|eyes?|physically|body language|gesture|facial expression|retreats? physically)\b/i;
const baselineGimmick = /\b(?:gaming|gamer|internet|technical) (?:slang|jargon|metaphors?)\b|\bheavy on\b/i;
const overperformance = /\b(?:extreme use|excessive use|constantly|always|every (?:message|reply)|perpetually)\b/i;
const conspicuousStyle = /\b(?:hp|mana|stats?|buffs?|debuffs?|levels?|status (?:effect|ailment)|cooldowns?|regen(?:eration)?|npc|quests?|boss(?:es)?|battle|combat|dungeons?|high-difficulty|dialogue tree|cpu|buffer|packets?|firewall|protocol|system error|logs?|terminal|digital footprint|watchlist|encrypt\w*|optim(?:ize|izing|ized|ization)|shutdown|hardware|software|debug\w*|hack(?:er|ing|ed)?)\b|\b[A-Za-z]-[A-Za-z]|[\u{1F300}-\u{1FAFF}]/iu;
const passiveConversation = /\b(?:(?:only|rarely|never|primarily)\b[^.;]{0,80}\b(?:provid|initiat|speak|respond|detail|information|topic)\w*|(?:provid|initiat|speak|respond|detail|information|topic)\w*\b[^.;]{0,80}\b(?:only|rarely|never|primarily)\b|provides? only\b[^.;]{0,80}\b(?:essential|necessary|minimum)\b|without initiating|dismissive silence|low-effort responses?|lack warmth even when|ends? (?:the )?conversation quickly)\b/i;
const ordinaryPrivateLife = /\b(?:food|meal|eat|drink|tea|coffee|rest|sleep|movie|show|music|game|walk|home|room|clothes|cook|bath|shower|shop|read|book|weather|quiet evening|spend time|comfort|entertainment|errand)\b/i;
const passiveDeepening = /\b(?:allow(?:s|ing)? (?:a moment of )?silence|shared silence|moment of (?:shared )?silence|without (?:speaking|saying anything)|does not (?:speak|respond)|says? nothing)\b/i;

function strings(value) {
  const stringifyItem = (item) => {
    if (item === null || item === undefined) return "";
    if (typeof item !== "object") return String(item).trim();
    if (Array.isArray(item)) return item.map(stringifyItem).filter(Boolean).join(", ");
    return Object.entries(item)
      .map(([key, nested]) => {
        const text = stringifyItem(nested);
        return text ? key + ": " + text : "";
      })
      .filter(Boolean)
      .join("; ");
  };
  if (Array.isArray(value)) return value.map(stringifyItem).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => {
      const items = Array.isArray(item) ? item : [item];
      return items.map((nested) => {
        const text = stringifyItem(nested);
        return text ? String(key) + ": " + text : "";
      }).filter(Boolean);
    });
  }
  return [];
}

function normalizedConversationHabits(value) {
  return strings(value).map((item) => {
    if (/\banswer\w*[_ ]?questions?\b/i.test(item) && /\b(?:otherwise|instead)\b[^.;]{0,60}\b(?:deflect|silence|question)\w*/i.test(item)) {
      return "Answers direct questions in character. May challenge the premise or stay terse, but supplies a concrete reason, correction, uncertainty, or focused clarification before redirecting.";
    }
    if (/\bcontribut\w*[_ ]?(?:details?|information)\b|\bprovid\w*\b/i.test(item) && /\b(?:only|bare minimum|necessary|essential|survival|immediate goals?)\b/i.test(item)) {
      return "Keeps explanations concise, but adds a concrete reason, observation, judgment, memory, or useful detail when it helps the exchange move.";
    }
    if (/\binitiat\w*\b/i.test(item) && /\b(?:only|rarely|never|primarily|threat|survival|logistical)\b/i.test(item)) {
      return "Initiates selectively when a strong opinion, ordinary preference, practical concern, personal curiosity, shared plan, or meaningful change gives them something worth contributing.";
    }
    if (/\bdismissive silence\b|\blow-effort responses?\b|\bends? (?:the )?conversation quickly\b/i.test(item)) {
      return "May be terse or guarded, but chooses a specific answer, boundary, question, decision, or topic change instead of collapsing the exchange into silence.";
    }
    return item;
  });
}

function normalizedInitiativeSeeds(value) {
  const seeds = strings(value);
  if (!seeds.length || seeds.some((item) => ordinaryPrivateLife.test(item))) return seeds;
  return [
    "Introduce an ordinary private-life preference involving food, rest, entertainment, comfort, errands, surroundings, or how to spend unstructured time, expressed through the character's own priorities.",
    ...seeds.slice(0, 3),
  ];
}

function normalizedDeepeningPaths(value) {
  return strings(value).map((item) => (
    passiveDeepening.test(item)
      ? "Share one specific memory, fear, hope, unresolved tension, honest question, or future possibility that this character would reveal only when the relationship and immediate moment make it plausible."
      : item
  ));
}

export function profileQualityIssues(profile) {
  const persona = profile?.persona || {};
  const issues = [];
  const baseline = String(persona.baselineVoice || "").trim();
  const variations = strings(persona.emotionalVariations);
  const examples = strings(persona.exampleLines);
  const selfConcept = strings(persona.selfConcept);
  const competencies = strings(persona.competencies);
  const vulnerabilityMap = strings(persona.vulnerabilityMap);
  const relationshipProgression = strings(persona.relationshipProgression);
  const conversationHabits = strings(persona.conversationHabits);
  const mischaracterizations = strings(persona.mischaracterizations);
  const initiativeSeeds = strings(persona.initiativeSeeds);
  const deepeningPaths = strings(persona.deepeningPaths);
  if (baseline.length < 30) issues.push("a concrete plain-conversation baselineVoice");
  if (nonTextPerformance.test(baseline)) issues.push("a baselineVoice written for text messages rather than vocal pitch, breathing, gestures, eyes, or physical acting");
  if (baselineGimmick.test(baseline)) issues.push("a genuinely plain baselineVoice that does not depend on gaming, internet, technical slang, jargon, or metaphors");
  if (variations.length < 4) issues.push("at least four emotionalVariations");
  if (variations.some((item) => nonTextPerformance.test(item))) issues.push("emotionalVariations that describe changes in texting rather than physical acting");
  if (variations.some((item) => overperformance.test(item))) issues.push("emotionalVariations without instructions for extreme, excessive, constant, or perpetual performance");
  if (strings(persona.signatureAccents).length < 1) issues.push("at least one optional signatureAccent");
  if (strings(persona.avoidPatterns).length < 3) issues.push("at least three character-specific avoidPatterns");
  if (examples.length < 5) issues.push("at least five varied exampleLines");
  if (examples.filter((line) => !conspicuousStyle.test(line)).length < 3) issues.push("at least three genuinely plain exampleLines without signature slang, gaming or technical metaphors, stutters, or emoji");
  if (selfConcept.length < 1) issues.push("a specific selfConcept that distinguishes confidence from insecurity");
  if (competencies.length < 1) issues.push("concrete competencies the character should not casually deny");
  if (vulnerabilityMap.length < 1) issues.push("a vulnerabilityMap with specific triggers, expressions, and limits");
  if (relationshipProgression.length < 3) issues.push("relationshipProgression guidance for unfamiliar, trusted, and close relationships");
  if (conversationHabits.length < 1) issues.push("conversationHabits describing how the character contributes and follows up");
  if (conversationHabits.some((item) => passiveConversation.test(item))) issues.push("conversationHabits with selective, character-appropriate initiative rather than only essential information, dismissive silence, or no initiation");
  if (mischaracterizations.length < 3) issues.push("at least three tempting but inaccurate mischaracterizations to avoid");
  if (initiativeSeeds.length < 4) issues.push("at least four varied initiativeSeeds spanning ordinary private life, interests or opinions, purposeful activity, and personal or relational curiosity");
  if (initiativeSeeds.length >= 4 && !initiativeSeeds.some((item) => ordinaryPrivateLife.test(item))) issues.push("at least one initiativeSeed grounded in ordinary private life rather than only work, combat, crisis, or canon plot");
  if (deepeningPaths.length < 2) issues.push("at least two deepeningPaths for specific disclosures, questions, hopes, tensions, or shared plans");
  if (deepeningPaths.some((item) => passiveDeepening.test(item))) issues.push("deepeningPaths that create a usable disclosure, question, tension, callback, or plan rather than silence alone");
  return issues;
}

export function profilePerformanceGuide(persona = {}) {
  const emotionalVariations = strings(persona.emotionalVariations);
  const exampleLines = strings(persona.exampleLines);
  return {
    baselineVoice: String(persona.baselineVoice || persona.speechStyle || "Speak naturally and plainly in character.").trim(),
    emotionalVariations: emotionalVariations.length ? emotionalVariations : [
      "casual: Use the ordinary energy, informality, and rhythm described in the speech overview.",
      "excited or affectionate: Match the emotional amplitude in a character-appropriate way; brevity must not flatten enthusiasm, warmth, or surprise.",
      "serious or vulnerable: Become more direct and specific rather than generically restrained, evasive, or theatrical.",
      "competent or task-focused: Foreground the character's knowledge, opinions, decisions, and practical priorities.",
    ],
    signatureAccents: strings(persona.signatureAccents),
    avoidPatterns: strings(persona.avoidPatterns),
    exampleLines,
    selfConcept: strings(persona.selfConcept),
    competencies: strings(persona.competencies),
    vulnerabilityMap: strings(persona.vulnerabilityMap),
    relationshipProgression: strings(persona.relationshipProgression),
    conversationHabits: normalizedConversationHabits(persona.conversationHabits),
    mischaracterizations: strings(persona.mischaracterizations),
    initiativeSeeds: normalizedInitiativeSeeds(persona.initiativeSeeds),
    deepeningPaths: normalizedDeepeningPaths(persona.deepeningPaths),
  };
}

export function rotatingPerformanceExamples(persona = {}, turnIndex = 0, limit = 3) {
  const examples = strings(persona.exampleLines);
  const count = Math.max(0, Math.min(Math.trunc(Number(limit) || 0), examples.length));
  if (!count) return [];
  const start = Math.abs(Math.trunc(Number(turnIndex) || 0)) % examples.length;
  const step = Math.max(1, Math.ceil(examples.length / count));
  const selected = [];
  for (let offset = 0; selected.length < count && offset < examples.length * 2; offset += 1) {
    const candidate = examples[(start + offset * step) % examples.length];
    if (!selected.includes(candidate)) selected.push(candidate);
  }
  return selected;
}
