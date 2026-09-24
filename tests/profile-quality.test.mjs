import assert from "node:assert/strict";
import test from "node:test";
import { CHARACTER_PROFILE_VERSION, hasUsableCoreProfile, preserveUsableCoreProfile, profileCoreQualityIssues, profilePerformanceGuide, profileQualityIssues, rotatingPerformanceExamples, stabilizeBaselineVoice } from "../server/profile-quality.mjs";

test("a correction cannot erase a previously usable summary, traits, or speaking style", () => {
  const prior = { summary: "A grounded character summary with enough detail to remain usable.", persona: {
    traits: ["direct"], speechStyle: "Uses direct, conversational sentences and asks practical follow-up questions.",
  } };
  const corrected = { summary: "", persona: { traits: [], speechStyle: "Speak naturally in character.", competencies: ["documented combat skill"] } };
  const kept = preserveUsableCoreProfile(corrected, prior);
  assert.equal(hasUsableCoreProfile(kept), true);
  assert.equal(kept.summary, prior.summary);
  assert.deepEqual(kept.persona.traits, prior.persona.traits);
  assert.equal(kept.persona.speechStyle, prior.persona.speechStyle);
  assert.deepEqual(kept.persona.competencies, corrected.persona.competencies);
});

const completeDepthGuide = {
  selfConcept: ["Confident in her analysis.", "Unsure about unfamiliar social situations."],
  competencies: ["Careful technical analysis.", "Independent problem-solving."],
  vulnerabilityMap: ["rejection: guarded wording; not incompetence", "praise: briefly uncertain; not panic"],
  relationshipProgression: ["unfamiliar: cautious", "trusted: candid", "close: warm without compliance"],
  conversationHabits: ["Answers direct questions first.", "Contributes a concrete detail or useful follow-up."],
  mischaracterizations: ["Guarded does not mean constantly hostile.", "Social uncertainty does not mean unintelligent.", "Closeness does not mean automatically agreeable."],
  initiativeSeeds: ["Suggest a new game to try.", "Share an observation from current research.", "Propose a quiet activity together.", "Ask about a future place they might visit."],
  deepeningPaths: ["Discuss why trust is difficult for her.", "Ask about a specific shared plan or future possibility."],
  characterTensions: [
    "Usually composed and analytical, but can become impatient and petulant when control or comfort is disrupted; this is contextual, not constant.",
    "Guarded with unfamiliar people, but increasingly candid and warm after trust without losing independence or critical judgment.",
  ],
};

test("optional performance-guide gaps do not make a grounded core unusable", () => {
  const core = {
    summary: "A thoughtful researcher who studies unfamiliar phenomena and answers others with measured curiosity.",
    persona: { traits: ["Curious"], speechStyle: "She writes in measured, direct sentences and asks specific questions." },
  };
  assert.equal(hasUsableCoreProfile(core), true);
  assert.ok(profileQualityIssues(core).length > 0);
  assert.equal(hasUsableCoreProfile({ ...core, persona: { ...core.persona, speechStyle: "Speak naturally in character." } }), false);
});

test("rejects a cached-style persona with no usable performance guide or examples", () => {
  const issues = profileQualityIssues({
    persona: {
      speechStyle: "Uses gaming metaphors.",
      exampleLines: [],
    },
  });
  assert.ok(issues.length >= 5);
  assert.ok(issues.some((issue) => issue.includes("baselineVoice")));
  assert.ok(issues.some((issue) => issue.includes("exampleLines")));
});

test("rejects a technically complete guide whose core characterization disappeared", () => {
  const issues = profileCoreQualityIssues({
    summary: "A talented and powerful sorceress from the Witcher series, known for her commanding presence.",
    persona: {
      traits: [],
      mannerisms: [],
      speechStyle: "Speak naturally in character.",
      emotionalRules: [],
    },
  });
  assert.ok(issues.some((issue) => issue.includes("character summary")));
  assert.ok(issues.some((issue) => issue.includes("personality traits")));
  assert.ok(issues.some((issue) => issue.includes("speechStyle")));
});

test("accepts a specific core characterization", () => {
  assert.deepEqual(profileCoreQualityIssues({
    summary: "A formidable court sorceress whose cultivated composure conceals fierce loyalty and old wounds. She is exacting, politically shrewd, and difficult to impress, yet her bonds with Geralt and Ciri reveal a protective tenderness she rarely displays openly.",
    persona: {
      traits: ["imperious", "perceptive", "fiercely loyal"],
      mannerisms: ["Corrects weak assumptions with dry precision.", "Uses a pointed question to make others reconsider their premise."],
      speechStyle: "Polished and incisive, favoring exact diction, dry barbs, and controlled sentences that become startlingly direct when emotion breaks through.",
      emotionalRules: ["Protects vulnerability with composure or sarcasm.", "Expresses care through decisive help before verbal reassurance."],
    },
  }), []);
});

test("accepts a complete model-independent character-depth guide", () => {
  const profile = {
    profileVersion: CHARACTER_PROFILE_VERSION,
    persona: {
      baselineVoice: "She writes in short, observant sentences and can be quietly funny without forcing a theme.",
      emotionalVariations: ["relaxed: warmer wording", "excited: faster sentences", "defensive: brief replies", "vulnerable: more direct"],
      signatureAccents: ["A gaming comparison may appear occasionally when it clarifies her point."],
      avoidPatterns: ["repeated gaming metaphors", "H-Hey openings", "panic over ordinary affection"],
      exampleLines: ["That sounds nice.", "I wasn't expecting that.", "Give me a minute to think.", "This quest is difficult.", "My stats are fine."],
      ...completeDepthGuide,
    },
  };
  assert.deepEqual(profileQualityIssues(profile), []);
});

test("accepts an empty signatureAccents list when the character has no useful recurring verbal tic", () => {
  const persona = {
    baselineVoice: "She writes in direct, natural sentences with a warm but grounded rhythm and no recurring gimmick.",
    emotionalVariations: ["relaxed: warmer", "excited: quicker", "defensive: firmer", "vulnerable: more direct"],
    signatureAccents: [],
    avoidPatterns: ["repeated catchphrases", "identical openings", "forced verbal tics"],
    exampleLines: ["That sounds good.", "Give me a moment.", "I understand.", "Let's try it.", "What happened next?"],
    ...completeDepthGuide,
  };
  assert.deepEqual(profileQualityIssues({ persona }), []);
});

test("does not mistake ordinary heavy-on phrasing for dependence on technical jargon", () => {
  const persona = {
    baselineVoice: "Friendly and conversational, heavy on earnest encouragement and straightforward emotional honesty.",
    emotionalVariations: ["relaxed: warmer", "excited: quicker", "defensive: firmer", "vulnerable: more direct"],
    signatureAccents: [],
    avoidPatterns: ["repeated catchphrases", "identical openings", "forced verbal tics"],
    exampleLines: ["That sounds good.", "Give me a moment.", "I understand.", "Let's try it.", "What happened next?"],
    ...completeDepthGuide,
  };
  assert.deepEqual(profileQualityIssues({ persona }), []);
});

test("allows a baseline to explicitly avoid technical or internet jargon", () => {
  const persona = {
    baselineVoice: "She writes in warm, earnest sentences and avoids technical jargon or internet slang in ordinary conversation.",
    emotionalVariations: ["relaxed wording", "brighter punctuation", "firmer replies", "more direct when vulnerable"],
    signatureAccents: [],
    avoidPatterns: ["repeated catchphrases", "identical openings", "forced verbal tics"],
    exampleLines: ["That sounds good.", "Give me a moment.", "I understand.", "Let's try it.", "What happened next?"],
    ...completeDepthGuide,
  };
  assert.deepEqual(profileQualityIssues({ persona }), []);
});

test("allows a physical cue when an emotional variation still gives usable texting direction", () => {
  const persona = {
    baselineVoice: "She writes in friendly, direct sentences with an earnest conversational rhythm.",
    emotionalVariations: [
      "relaxed: her voice softens and her wording becomes warmer",
      "excited: quicker sentences and brighter punctuation",
      "defensive: firmer, clipped replies",
      "vulnerable: more direct phrasing",
    ],
    signatureAccents: [],
    avoidPatterns: ["repeated catchphrases", "identical openings", "forced verbal tics"],
    exampleLines: ["That sounds good.", "Give me a moment.", "I understand.", "Let's try it.", "What happened next?"],
    ...completeDepthGuide,
  };
  assert.deepEqual(profileQualityIssues({ persona }), []);
});

test("does not invent character tensions merely to satisfy a profile quota", () => {
  const persona = {
    baselineVoice: "She writes in precise, conversational sentences and uses dry humor without leaning on a recurring gimmick.",
    emotionalVariations: ["relaxed: warmer wording", "excited: faster sentences", "defensive: brief replies", "vulnerable: more direct"],
    signatureAccents: ["An occasional dry aside when the situation invites it."],
    avoidPatterns: ["repeated warnings", "the same opening", "automatic hostility"],
    exampleLines: ["That works.", "Give me a minute.", "I understand.", "We can try another route.", "Tell me what changed."],
    ...completeDepthGuide,
    characterTensions: [],
  };
  const issues = profileQualityIssues({ persona });
  assert.ok(!issues.some((issue) => issue.includes("characterTensions")));
});

test("older profiles fall back to their existing speech style at runtime", () => {
  const guide = profilePerformanceGuide({ speechStyle: "Quiet, direct, and dryly amused." });
  assert.equal(guide.baselineVoice, "Quiet, direct, and dryly amused.");
  assert.equal(guide.emotionalVariations.length, 4);
  assert.ok(guide.emotionalVariations.some((variation) => variation.includes("brevity must not flatten")));
  assert.deepEqual(guide.avoidPatterns, []);
  assert.deepEqual(guide.selfConcept, []);
});

test("rotates a spread of character examples instead of always repeating the first lines", () => {
  const persona = { exampleLines: ["one", "two", "three", "four", "five", "six"] };
  assert.deepEqual(rotatingPerformanceExamples(persona, 0, 3), ["one", "three", "five"]);
  assert.deepEqual(rotatingPerformanceExamples(persona, 1, 3), ["two", "four", "six"]);
});

test("normalizes keyed emotional states and a single signature accent from local models", () => {
  const persona = {
    baselineVoice: "She is concise and conversational, with dry humor that does not require a recurring gimmick.",
    emotionalVariations: { relaxed: "warmer", excited: "faster", defensive: "brief", vulnerable: "more direct" },
    signatureAccents: "Use one gaming comparison only when the topic naturally invites it.",
    avoidPatterns: ["repeated metaphors", "identical openings", "panic over ordinary warmth"],
    exampleLines: ["That sounds good.", "Give me a minute.", "I can help with that.", "This quest is difficult.", "My stats are fine."],
    ...completeDepthGuide,
  };
  assert.deepEqual(profileQualityIssues({ persona }), []);
  assert.equal(profilePerformanceGuide(persona).emotionalVariations.length, 4);
  assert.equal(profilePerformanceGuide(persona).signatureAccents.length, 1);
});

test("normalizes nested object arrays without leaking object placeholders into prompts", () => {
  const guide = profilePerformanceGuide({
    vulnerabilityMap: {
      triggers: [
        { trigger: "loss of agency", expression: "becomes sharply direct", doesNotImply: "a loss of intelligence" },
        { trigger: "unexpected kindness", expression: "deflects briefly", doesNotImply: "hatred of the other person" },
      ],
    },
  });
  assert.equal(guide.vulnerabilityMap.length, 2);
  assert.match(guide.vulnerabilityMap[0], /loss of agency/);
  assert.doesNotMatch(guide.vulnerabilityMap.join(" "), /\[object Object\]/);
});

test("rejects a performance guide that turns reserve into conversational dead ends", () => {
  const persona = {
    baselineVoice: "She is concise and observant, using dry humor without relying on a recurring gimmick.",
    emotionalVariations: ["relaxed: direct", "excited: quicker", "defensive: clipped", "vulnerable: honest"],
    signatureAccents: ["An occasional dry aside."],
    avoidPatterns: ["repeated warnings", "same opening", "automatic hostility"],
    exampleLines: ["That works.", "Give me a minute.", "I know the route.", "We can try.", "Tell me what happened."],
    ...completeDepthGuide,
    conversationHabits: ["Provides only what is necessary for survival or immediate goals.", "Rarely initiates unless there is an immediate threat."],
  };
  const issues = profileQualityIssues({ persona });
  assert.ok(issues.some((issue) => issue.includes("selective, character-appropriate initiative")));
});

test("rejects silence-only deepening and initiative with too little range", () => {
  const persona = {
    baselineVoice: "She is concise and observant, using dry humor without relying on a recurring gimmick.",
    emotionalVariations: ["relaxed: direct", "excited: quicker", "defensive: clipped", "vulnerable: honest"],
    signatureAccents: ["An occasional dry aside."],
    avoidPatterns: ["repeated warnings", "same opening", "automatic hostility"],
    exampleLines: ["That works.", "Give me a minute.", "I know the route.", "We can try.", "Tell me what happened."],
    ...completeDepthGuide,
    initiativeSeeds: ["Find a weapon.", "Plan a battle.", "Inspect a threat."],
    deepeningPaths: ["Allowing a moment of silence without needing to fill it.", "Discussing a shared plan."],
  };
  const issues = profileQualityIssues({ persona });
  assert.ok(issues.some((issue) => issue.includes("at least four varied initiativeSeeds")));
  assert.ok(issues.some((issue) => issue.includes("rather than silence alone")));
});

test("requires an ordinary private-life initiative alongside plot and work material", () => {
  const persona = {
    baselineVoice: "She is concise and observant, using dry humor without relying on a recurring gimmick.",
    emotionalVariations: ["relaxed: direct", "excited: quicker", "defensive: clipped", "vulnerable: honest"],
    signatureAccents: ["An occasional dry aside."],
    avoidPatterns: ["repeated warnings", "same opening", "automatic hostility"],
    exampleLines: ["That works.", "Give me a minute.", "I know the route.", "We can try.", "Tell me what happened."],
    ...completeDepthGuide,
    initiativeSeeds: ["Find supplies.", "Plan a battle.", "Inspect a threat.", "Question an enemy's motives."],
  };
  const issues = profileQualityIssues({ persona });
  assert.ok(issues.some((issue) => issue.includes("ordinary private life")));
});

test("runtime guide neutralizes passive phrasing from any profile model", () => {
  const guide = profilePerformanceGuide({
    conversationHabits: [
      "contributing_details: Only provides details relevant to immediate survival.",
      "initiating_topics: Primarily initiates when there is a threat.",
    ],
    initiativeSeeds: ["Find supplies.", "Plan a battle.", "Inspect a threat.", "Question an enemy."],
    deepeningPaths: ["A moment of shared silence.", "Admitting a specific fear."],
  });
  assert.doesNotMatch(guide.conversationHabits.join(" "), /\bonly provides\b|\bprimarily initiates\b/i);
  assert.match(guide.initiativeSeeds[0], /ordinary private-life preference/);
  assert.doesNotMatch(guide.deepeningPaths.join(" "), /\bshared silence\b/i);
});

test("runtime guide catches passive wording that does not name a schema field", () => {
  const guide = profilePerformanceGuide({
    conversationHabits: [
      "Speaks only when necessary and otherwise lets the conversation end.",
      "Offers an opinion when the subject genuinely interests her.",
    ],
  });
  assert.doesNotMatch(guide.conversationHabits.join(" "), /\bonly when necessary\b|\bconversation end\b/i);
  assert.match(guide.conversationHabits[0], /Engages selectively/);
});

test("rejects performance notes about physical acting and example sets dominated by gimmicks", () => {
  const persona = {
    baselineVoice: "Her voice rises in pitch and she looks away whenever she feels embarrassed by a compliment.",
    emotionalVariations: ["relaxed wording", "eyes widen", "defensive phrasing", "more direct when serious"],
    signatureAccents: ["gaming metaphors"],
    avoidPatterns: ["repeated metaphors", "same opening", "constant panic"],
    exampleLines: ["My stats are low.", "That's a debuff.", "New quest!", "Give me a minute.", "I understand."],
  };
  const issues = profileQualityIssues({ persona });
  assert.ok(issues.some((issue) => issue.includes("text messages")));
  assert.ok(issues.some((issue) => issue.includes("genuinely plain")));
});

test("rejects a baseline or emotional mode that prescribes constant character gimmicks", () => {
  const persona = {
    baselineVoice: "Informal and fast-paced, with heavy internet slang and gaming metaphors in ordinary replies.",
    emotionalVariations: ["relaxed wording", "excessive use of exclamation points", "brief when defensive", "direct when vulnerable"],
    signatureAccents: ["gaming metaphor occasionally"],
    avoidPatterns: ["repeated metaphors", "same opening", "constant panic"],
    exampleLines: ["That sounds good.", "Give me a minute.", "I can help with that.", "This quest is difficult.", "My stats are fine."],
  };
  const issues = profileQualityIssues({ persona });
  assert.ok(issues.some((issue) => issue.includes("genuinely plain baselineVoice")));
  assert.ok(issues.some((issue) => issue.includes("excessive")));
});

test("a plain baseline can explicitly forbid jargon without failing setup", () => {
  const baselineVoice = "Her messages are spare and observant, with no gaming slang or technical jargon in ordinary replies.";
  assert.equal(stabilizeBaselineVoice({ baselineVoice }), baselineVoice);
  assert.ok(!profileQualityIssues({ persona: { baselineVoice } }).some((issue) => issue.includes("genuinely plain baselineVoice")));
});

test("a genuinely gimmick-heavy baseline is stabilized instead of stranding setup", () => {
  const persona = {
    baselineVoice: "Informal and fast-paced, with heavy internet slang and gaming metaphors in ordinary replies.",
    traits: ["guarded around strangers", "dryly humorous", "loyal to her friends"],
  };
  const stabilized = stabilizeBaselineVoice(persona);
  assert.match(stabilized, /guarded around strangers/);
  assert.ok(!profileQualityIssues({ persona: { ...persona, baselineVoice: stabilized } }).some((issue) => issue.includes("genuinely plain baselineVoice")));
});
