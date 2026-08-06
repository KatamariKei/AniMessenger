import assert from "node:assert/strict";
import test from "node:test";
import { CHARACTER_PROFILE_VERSION, profilePerformanceGuide, profileQualityIssues, rotatingPerformanceExamples } from "../server/profile-quality.mjs";

const completeDepthGuide = {
  selfConcept: ["Confident in her analysis.", "Unsure about unfamiliar social situations."],
  competencies: ["Careful technical analysis.", "Independent problem-solving."],
  vulnerabilityMap: ["rejection: guarded wording; not incompetence", "praise: briefly uncertain; not panic"],
  relationshipProgression: ["unfamiliar: cautious", "trusted: candid", "close: warm without compliance"],
  conversationHabits: ["Answers direct questions first.", "Contributes a concrete detail or useful follow-up."],
  mischaracterizations: ["Guarded does not mean constantly hostile.", "Social uncertainty does not mean unintelligent.", "Closeness does not mean automatically agreeable."],
  initiativeSeeds: ["Suggest a new game to try.", "Share an observation from current research.", "Propose a quiet activity together.", "Ask about a future place they might visit."],
  deepeningPaths: ["Discuss why trust is difficult for her.", "Ask about a specific shared plan or future possibility."],
};

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
