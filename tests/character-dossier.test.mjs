import test from "node:test";
import assert from "node:assert/strict";
import {
  blockingProfileReviewIssues,
  buildDossier,
  dossierBlockedByResearchOutage,
  deterministicDossierFacts,
  dossierPassages,
  dossierSupportsStrictUnsupportedReview,
  filterProfileReviewIssues,
  profileReviewEvidence,
  removeSoftUnsupportedCompetencies,
  removeVariantDerivedClaims,
  removeUnsupportedQuotedClaims,
  splitProfileReviewIssues,
  scopeContinuityFacts,
  validateDossier,
} from "../server/character-dossier.mjs";
import { dossierAdultAge } from "../server/character-dossier.mjs";

test("creation age defaults to 18 rather than inventing an adult age", () => {
  assert.equal(dossierAdultAge({ facts: [{ claim: "Third-year high school student", quote: "Third-year high school student", scope: "baseline" }] }), 18);
  assert.equal(dossierAdultAge({ facts: [{ claim: "She is 32 years old", quote: "age = 32", scope: "baseline" }] }), 32);
  assert.equal(dossierAdultAge({ facts: [{ claim: "She is 17 years old", quote: "age = 17", scope: "baseline" }] }), 18);
  assert.equal(dossierAdultAge({ facts: [{ claim: "Her listed age is 800+", quote: "Listed age: 800+", scope: "baseline" }] }), 800);
  assert.equal(dossierAdultAge({ facts: [{ claim: "She is approximately 1578 years old", quote: "Age: 1578", scope: "baseline" }] }), 1578);
  assert.equal(dossierAdultAge({ facts: [{ claim: "She is over 40 years old", quote: "over 40 years old", scope: "baseline" }] }), 41);
});

test("anime facts are variant context when the selected result is the game continuity", () => {
  const scoped = scopeContinuityFacts({ series: "Pokémon Sun And Moon" }, { facts: [
    { claim: "In the game, she is the true antagonist.", quote: "In the game", scope: "baseline" },
    { claim: "In the anime, she is not an antagonist.", quote: "In the anime", scope: "baseline" },
  ] });
  assert.equal(scoped.facts[0].scope, "baseline");
  assert.equal(scoped.facts[1].scope, "variant");
});

test("review preserves catalogue appearance evidence even without dossier appearance claims", () => {
  const dossier = { facts: [{ category: "role", claim: "Student" }] };
  const result = profileReviewEvidence({ tags: ["brown eyes", "brown hair", "short hair"], sourceUrl: "https://example.com/haru" }, dossier);
  assert.deepEqual(result.catalogueVisualEvidence.tags, ["brown eyes", "brown hair", "short hair"]);
  assert.equal(result.dossier, dossier);
  assert.match(result.catalogueVisualEvidence.usage, /Never infer biography/);
});

test("rejects invented source IDs and quotations while preserving scope", () => {
  const passages = [{ id: "source", text: "Erica is a waitress at the Stray Sheep." }];
  const result = validateDossier({ facts: [
    { category: "role", claim: "Waitress", sourceId: "source", quote: "a waitress at the Stray Sheep", scope: "baseline" },
    { claim: "Office manager", sourceId: "source", quote: "an ambitious office manager" },
    { claim: "Alien", sourceId: "invented", quote: "a waitress at the Stray Sheep" },
  ] }, passages);
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].scope, "baseline");
  assert.equal(result.rejected.length, 2);
  assert.equal(result.evidenceLimited, false);
});

test("rejects isolated derogatory fan-wiki labels as defining character evidence", () => {
  const passage = "This leads to her being labeled as a Slut by Ami, though Hana doesn't deny it after hearing it.";
  const result = validateDossier({ facts: [{
    category: "personality",
    claim: "Hana does not deny being labeled as a Slut by Ami.",
    sourceId: "fan-wiki",
    quote: passage,
    scope: "baseline",
  }] }, [{ id: "fan-wiki", text: passage }]);
  assert.deepEqual(result.facts, []);
  assert.equal(result.rejected.length, 1);
});

test("prioritizes franchise evidence within a bounded packet", () => {
  const passages = dossierPassages({ evidence: { passages: [
    { id: "wiki", provider: "wikipedia", text: "a".repeat(30000) },
    { id: "franchise", provider: "franchise_wiki", text: "b".repeat(30000) },
    { id: "other", text: "c".repeat(30000) },
  ] } });
  assert.equal(passages[0].id, "franchise");
  assert.ok(passages.reduce((sum, item) => sum + item.text.length, 0) <= 24000);
});

test("catalogue evidence supplements online passages instead of disappearing when research succeeds", () => {
  const passages = dossierPassages({
    catalogueNotes: ["Game continuity: she is the antagonist and her controlling behavior puts her children at risk."],
    evidence: { passages: [
      { id: "anilist", provider: "anilist", text: "She is the president of the Aether Foundation." },
      { id: "wiki", provider: "wikipedia", text: "A broad franchise article with little characterization." },
    ] },
  });
  assert.deepEqual(passages.map((passage) => passage.id), ["anilist", "catalogue-0", "wiki"]);
  assert.match(passages[1].text, /controlling behavior/);
});

test("dossier extraction preserves a concrete canonical outfit when the source provides one", async () => {
  const source = "Her school uniform is a beige cardigan over a white blouse with a red ribbon and plaid skirt.";
  let instruction = "";
  await buildDossier({ name: "Tsubasa Oribe", series: "Tokyo Mirage Sessions ♯FE" }, { notes: [source] }, async (messages) => {
    instruction = messages.map((message) => message.content).join("\n");
    return {
      facts: [{ category: "appearance", claim: "She wears a beige school uniform.", sourceId: "catalogue-0", quote: source, scope: "baseline" }],
      unknowns: [], conflicts: [],
    };
  });
  assert.match(instruction, /reserve at least one appearance fact/i);
  assert.match(instruction, /named garments, supported colors, and distinctive details/i);
});

test("dossier extraction keeps a selected form separate from shared identity evidence", async () => {
  const source = "Ranma Saotome is a martial artist whose female form has red hair.";
  let request;
  await buildDossier({ name: "Ranma-chan", series: "Ranma 1/2" }, {
    selectedForm: "Female physical form of Ranma Saotome",
    catalogueNotes: [source],
  }, async (messages) => {
    request = JSON.parse(messages.at(-1).content);
    return { facts: [{ category: "appearance", claim: "Female form has red hair", sourceId: "catalogue-0", quote: source, scope: "baseline" }], unknowns: [], conflicts: [] };
  });
  assert.equal(request.character, "Ranma-chan");
  assert.equal(request.selectedForm, "Female physical form of Ranma Saotome");
  assert.match(request.passages[0].text, /female form has red hair/);
});

test("missing research is explicitly limited without a model call", async () => {
  const result = await buildDossier({ name: "Unknown" }, {}, () => { throw new Error("unexpected call"); });
  assert.equal(result.evidenceLimited, true);
  assert.deepEqual(result.facts, []);
});

test("a rejected dossier extraction receives one stricter automatic retry", async () => {
  let calls = 0;
  const result = await buildDossier({ name: "Tsubaki", series: "Blue Archive" }, {
    notes: ["Tsubaki is the President of the Inner Discipline Club."],
  }, async (messages) => {
    calls += 1;
    if (calls === 1) return {
      facts: [{ category: "role", claim: "Club president", sourceId: "catalogue-0", quote: "invented quotation", scope: "baseline" }],
      unknowns: [], conflicts: [],
    };
    assert.match(messages.at(-1).content, /Copy every quote exactly/i);
    return {
      facts: [{ category: "role", claim: "Club president", sourceId: "catalogue-0", quote: "President of the Inner Discipline Club", scope: "baseline" }],
      unknowns: [], conflicts: [],
    };
  });
  assert.equal(calls, 2);
  assert.equal(result.facts.length, 1);
});

test("repeated invalid model quotations fall back to exact retrieved source facts", async () => {
  let calls = 0;
  const source = "A character from [[Blue Archive]]. President of the Inner Discipline Club. Her full name is [b]Kasuga Tsubaki[/b]. Voiced by Saho Shirasu.";
  const result = await buildDossier({ name: "Tsubaki", series: "Blue Archive" }, { notes: [source] }, async () => {
    calls += 1;
    return {
      facts: [{ category: "role", claim: "Invented", sourceId: "wrong", quote: "not in the source", scope: "baseline" }],
      unknowns: [], conflicts: [],
    };
  });
  assert.equal(calls, 2);
  assert.ok(result.facts.some((fact) => fact.quote === "President of the Inner Discipline Club."));
  assert.ok(result.facts.some((fact) => fact.quote.includes("Kasuga Tsubaki")));
  assert.ok(!result.facts.some((fact) => /Voiced by/i.test(fact.quote)));
  assert.equal(result.evidenceLimited, false);
  for (const fact of result.facts) assert.ok(source.includes(fact.quote));
});

test("a timed-out local dossier extraction falls back to quoted source facts", async () => {
  const source = "YoRHa No.2 Type B, or just 2B, is a protagonist of NieR:Automata. She is a YoRHa battle android. She is calm and reserved.";
  let calls = 0;
  const result = await buildDossier({ name: "2B", series: "NieR:Automata" }, {
    evidence: { passages: [{ id: "franchise-2b", provider: "franchise_wiki", text: source }] },
  }, async () => { calls += 1; throw new Error("Ollama reached its response token limit"); });
  assert.equal(calls, 1);
  assert.ok(result.facts.some((fact) => fact.quote.includes("2B")));
  assert.ok(result.facts.every((fact) => source.includes(fact.quote)));
});

test("deterministic source facts remain empty when no usable claims exist", () => {
  assert.deepEqual(deterministicDossierFacts([{ id: "empty", text: "See also. External links." }]), []);
});

test("sparse evidence does not turn unmentioned traits into fatal contradictions", () => {
  const dossier = {
    facts: [
      { category: "identity", claim: "A sorceress", scope: "baseline" },
      { category: "role", claim: "A main character", scope: "baseline" },
      { category: "appearance", claim: "Black hair", scope: "baseline" },
    ],
  };
  assert.equal(dossierSupportsStrictUnsupportedReview(dossier), false);
  assert.deepEqual(blockingProfileReviewIssues([
    "Unsupported defining claim: strategic planning (Competencies)",
    "Contradiction: the profile says she has blonde hair, but the dossier says black hair",
  ], dossier), [
    "Contradiction: the profile says she has blonde hair, but the dossier says black hair",
  ]);
});

test("broad evidence retains strict unsupported-claim review", () => {
  const dossier = {
    facts: [
      { category: "identity", scope: "baseline" },
      { category: "role", scope: "baseline" },
      { category: "personality", scope: "baseline" },
      { category: "relationship", scope: "baseline" },
      { category: "history", scope: "baseline" },
      { category: "knowledge", scope: "baseline" },
    ],
  };
  assert.equal(dossierSupportsStrictUnsupportedReview(dossier), true);
  assert.deepEqual(blockingProfileReviewIssues([
    "Unsupported defining claim: strategic planning (Competencies)",
  ], dossier), [
    "Unsupported defining claim: strategic planning (Competencies)",
  ]);
});

test("after correction subjective review opinions and alternate wardrobe choices do not strand setup", () => {
  const dossier = { facts: [
    { category: "identity", scope: "baseline" },
    { category: "role", scope: "baseline" },
    { category: "personality", scope: "baseline" },
    { category: "relationship", scope: "baseline" },
    { category: "history", scope: "baseline" },
    { category: "knowledge", scope: "baseline" },
  ] };
  const issues = [
    "Unsupported defining claim: The profile defines her personality as 'Resiliently stubborn' and 'Guarded yet compassionate', but the dossier only supports a reluctant supervillain and superhero.",
    "defaultWardrobe: The profile uses a cowgirl outfit, while the source describes other iconic clothing.",
    "Unsupported defining claim: The profile makes her a professional pastry chef without evidence.",
    "Contradiction: The profile says she is a pilot, but the source directly states she is a nurse.",
  ];
  assert.deepEqual(blockingProfileReviewIssues(issues, dossier, { afterRepair: true }), issues.slice(2));
});

test("review cannot deny an exact catalogue appearance tag or require sexual harm as an active behavior rule", () => {
  const issues = [
    'Character research needs clarification: The profile\'s visual identity lists "white horns," which contradicts the dossier\'s claim that she has "two thick horns" (and the visual evidence tags "low horns" and "demon horns" without specifying white).',
    "The profile claims Albedo has 'white horns' in the visual identity section, which contradicts the dossier's explicit description of 'two thick horns' (and the visual tags' 'low horns'/'demon horns' are generic, but the dossier's 'thick horns' is the concrete baseline).",
    "Omission of the defining flaw/pressure reaction where Albedo can lose self-control around Ainz to the point of attempting non-consensual sexual acts within the 'persona' or 'emotionalRules' sections; while mentioned in 'boundaries', it is absent from the behavioral guidelines that govern her active interactions.",
    "Contradiction: The profile says she has blue horns, but the dossier explicitly says black horns.",
  ];
  const dossier = { facts: [{ category: "appearance", quote: "She has two thick horns." }] };
  assert.deepEqual(filterProfileReviewIssues(issues, dossier, { tags: ["low horns", "demon horns", "white horns"] }), [issues[3]]);
  assert.deepEqual(blockingProfileReviewIssues([issues[2]], dossier, { afterRepair: true }), []);
  const contrary = { facts: [{ category: "appearance", quote: "She has black horns." }] };
  assert.deepEqual(filterProfileReviewIssues([issues[0]], contrary, { tags: ["white horns"] }), [issues[0]]);
});

test("a reviewer cannot turn a documented game skill into an unsupported expertise error", () => {
  const dossier = { facts: [{ category: "knowledge", claim: "Anti-Air skill", quote: "increases this ship's Anti-Air" }] };
  const wording = "Unsupported defining claim: The profile attributes specific competencies to her, such as 'anti-air defense.' While the dossier lists an AA stat and a skill that increases Anti-Air, it does not explicitly define this as a personal competency or area of expertise.";
  assert.deepEqual(blockingProfileReviewIssues([wording], dossier, { afterRepair: true }), []);
  assert.deepEqual(blockingProfileReviewIssues([
    "Unsupported defining claim: The profile says she is an expert at anti-air defense, but the dossier only lists a stat.",
  ], dossier, { afterRepair: true }).length, 1);
  assert.deepEqual(blockingProfileReviewIssues([
    "Unsupported defining claim: The profile says she is a professional fitness coach with no evidence.",
  ], dossier, { afterRepair: true }).length, 1);
});

test("compound review findings stay independent and job-derived temperament is not a contradiction", () => {
  const combined = "Unsupported defining claim: The profile describes her as having a 'timid temperament' but the dossier contains no evidence of timidness. This contradicts her role as an emissary, a position that requires diplomatic confidence; Unsupported defining claim: The profile claims she has \"deep botanical knowledge of Liyue's flora\" but the dossier only supports her preference for eating the qingxin flower.";
  const issues = splitProfileReviewIssues([combined]);
  assert.equal(issues.length, 2);
  assert.deepEqual(blockingProfileReviewIssues(issues, { facts: [] }, { afterRepair: true }), []);
  const cleaned = removeUnsupportedQuotedClaims({ persona: { competencies: ["deep botanical knowledge of Liyue's flora", "An emissary for Liyue"] } }, issues);
  assert.deepEqual(cleaned.profile.persona.competencies, ["An emissary for Liyue"]);
  assert.deepEqual(cleaned.resolved, [issues[1]]);
});

test("soft relationship labels and mixed competency inferences are repaired instead of blocking setup", () => {
  const combined = "The claim that she maintains a 'professional rivalry' with Masamune Izumi is unsupported; the dossier identifies them as fellow authors and neighbors, but does not mention rivalry.; The competencies (Novel writing, Literary analysis, Maintaining a persona) are unsupported; while she is an author, the specific expertise in 'analysis' and 'persona maintenance' is an inference.";
  const issues = splitProfileReviewIssues([combined]);
  assert.equal(issues.length, 2);
  const profile = { persona: { competencies: [
    "Novel writing",
    "Literary analysis",
    "Maintaining a persona",
  ] }, canon: { relationships: [
    "She maintains a professional rivalry with Masamune Izumi.",
    "Masamune Izumi is her neighboring fellow author.",
  ] } };
  const relationshipCleaned = removeUnsupportedQuotedClaims(profile, issues);
  assert.deepEqual(relationshipCleaned.profile.canon.relationships, ["Masamune Izumi is her neighboring fellow author."]);
  const competencyCleaned = removeSoftUnsupportedCompetencies(relationshipCleaned.profile, issues, { facts: [
    { category: "role", scope: "baseline", claim: "She is a light novel author.", quote: "a light novel author" },
  ] });
  assert.deepEqual(competencyCleaned.profile.persona.competencies, ["Novel writing"]);
  assert.deepEqual(blockingProfileReviewIssues(
    issues.filter((issue) => ![...relationshipCleaned.resolved, ...competencyCleaned.resolved].includes(issue)),
    { facts: [] }, { afterRepair: true },
  ), []);
});

test("identity-grounded characters may use a modest interpretive personality guide", () => {
  const combined = "The profile claims she maintains a 'composed, professional temperament' and is 'socially guarded,' but there is no evidence in the dossier regarding her personality or behavior to support these traits.; The profile's relationship progression and emotional rules are unsupported by the provided evidence.; The profile's 'characterTensions' regarding the conflict between her professional recognition and her age is an unsupported inference; the dossier does not provide evidence of her internal struggle or how she views her age in relation to her career.";
  const dossier = { facts: [
    { category: "identity", scope: "baseline", claim: "Elf Yamada", quote: "Elf Yamada" },
    { category: "role", scope: "baseline", claim: "A light novel author", quote: "a light novel author" },
  ] };
  const split = splitProfileReviewIssues([combined]);
  assert.equal(split.length, 3);
  assert.deepEqual(filterProfileReviewIssues([combined], dossier, {}), []);
  assert.deepEqual(filterProfileReviewIssues([
    "The profile claims her sister is her mother, which directly contradicts the dossier.",
  ], dossier, {}), ["The profile claims her sister is her mother, which directly contradicts the dossier."]);
});

test("fallback evidence keeps useful facts after a leading wiki heading", () => {
  const facts = deterministicDossierFacts([{ id: "wiki", provider: "franchise_wiki", text:
    "h2. Biography\nPurah is the head of the research lab. She is energetic and curious, and she enjoys experiments. She has distinctive red glasses. h2. External links\nIgnore this link." }]);
  assert.ok(facts.some((fact) => fact.category === "role"));
  assert.ok(facts.some((fact) => fact.category === "personality"));
  assert.ok(facts.every((fact) => !fact.quote.includes("External links")));
});

test("an exact unsupported self-concept claim is dropped without rewriting the whole profile", () => {
  const unsupported = "takes pride in her professional efficiency despite her hatred for the act of killing";
  const profile = { persona: { selfConcept: [
    "She " + unsupported + ".",
    "She values her freedom and resents the Blacksnakes' control.",
  ] }, summary: "An independent thief who wants freedom." };
  const issue = "The profile claims Throné '" + unsupported + "' under selfConcept; however, the dossier provides no evidence that she feels pride in her efficiency.";
  const cleaned = removeUnsupportedQuotedClaims(profile, [issue]);
  assert.deepEqual(cleaned.resolved, [issue]);
  assert.deepEqual(cleaned.profile.persona.selfConcept, ["She values her freedom and resents the Blacksnakes' control."]);
  assert.deepEqual(profile.persona.selfConcept.length, 2);
});

test("an unsupported descriptor is removed from a supported identity instead of blocking setup", () => {
  const profile = {
    summary: "Lain discovers she is a fragmented software entity given human form.",
    persona: { selfConcept: ["She wonders about her nature as a fragmented software entity."] },
    canon: { knowledge: ["She is a software-based entity given human form."] },
  };
  const issue = "Unsupported defining claim: The profile claims Lain is a 'fragmented software entity' and that she has a 'nature as a fragmented software entity.' The dossier only states she 'uncovers her true nature' and is a 'software-based entity given human form,' without the specific descriptor 'fragmented' as a defining trait of her nature.";
  const cleaned = removeUnsupportedQuotedClaims(profile, [issue]);
  assert.deepEqual(cleaned.resolved, [issue]);
  assert.equal(cleaned.profile.summary, "Lain discovers she is a software entity given human form.");
  assert.deepEqual(cleaned.profile.persona.selfConcept, ["She wonders about her nature as a software entity."]);
  assert.deepEqual(cleaned.profile.canon.knowledge, profile.canon.knowledge);
});

test("unsupported quoted prose and competencies are removed while supported details survive", () => {
  const profile = {
    summary: "Lain uncovers her true nature. She is caught in a tension between her fragile human persona and the omniscient, detached entity she is becoming.",
    persona: { competencies: [
      "She has intuitive understanding of network architecture.",
      "She has high capacity for abstract, philosophical, and metaphysical reasoning.",
      "She knows the Wired exists.",
    ] },
  };
  const issues = [
    "Unsupported defining claim: The profile claims she is 'caught in a tension between her fragile human persona and the omniscient, detached entity she is becoming,' but the dossier does not describe her as fragile or omniscient.",
    "Unsupported defining claim: The profile attributes 'intuitive understanding of network architecture' and 'high capacity for abstract, philosophical, and metaphysical reasoning' to her competencies; while the canon section mentions knowledge of the Wired, the dossier does not explicitly define these as innate competencies.",
  ];
  const cleaned = removeUnsupportedQuotedClaims(profile, issues);
  assert.deepEqual(cleaned.resolved, issues);
  assert.equal(cleaned.profile.summary, "Lain uncovers her true nature.");
  assert.deepEqual(cleaned.profile.persona.competencies, ["She knows the Wired exists."]);
});

test("unsupported competencies reported as profile list items are deleted before review can block setup", () => {
  const profile = { persona: { competencies: [
    "Morale management and emotional support",
    "She can operate as a heavy cruiser in combat.",
  ] } };
  const issue = "Unsupported defining claim: The profile lists 'Morale management and emotional support' as a competency. The dossier only supports combat-related competencies (Heavy Cruiser operations, Anti-air).";
  const cleaned = removeUnsupportedQuotedClaims(profile, [issue]);
  assert.deepEqual(cleaned.resolved, [issue]);
  assert.deepEqual(cleaned.profile.persona.competencies, ["She can operate as a heavy cruiser in combat."]);
  assert.deepEqual(profile.persona.competencies, ["Morale management and emotional support", "She can operate as a heavy cruiser in combat."]);
});

test("an overclaimed competence is removed when the reviewer says the dossier only supports a narrower behavior", () => {
  const profile = { persona: { competencies: [
    "Expertise in deception, illusion, and elaborate pranking",
    "She enjoys playing tricks on people.",
  ] } };
  const issue = "The profile claims Nyotengu has 'Expertise in deception, illusion, and elaborate pranking' under competencies; however, the dossier only supports that she is 'something of a prankster' who has posed as a statue's voice and an undead schoolgirl, which does not establish professional expertise or mastery of illusion.";
  const cleaned = removeUnsupportedQuotedClaims(profile, [issue]);
  assert.deepEqual(cleaned.resolved, [issue]);
  assert.deepEqual(cleaned.profile.persona.competencies, ["She enjoys playing tricks on people."]);
  assert.deepEqual(profile.persona.competencies[0], "Expertise in deception, illusion, and elaborate pranking");
});

test("subjective personality claims flagged by the reviewer are removed without a full rewrite", () => {
  const profile = { persona: { traits: [
    "Resiliently stubborn",
    "Guarded yet compassionate",
    "Reluctant to accept help",
  ] }, summary: "She has a fierce, protective nature. She once joined the X-Men." };
  const issue = "Unsupported defining claim: The profile defines her personality as 'Resiliently stubborn' and 'Guarded yet compassionate', and describes her as having a 'fierce, protective nature', but the dossier only supports her being a 'reluctant supervillain' and a 'superhero'.";
  const cleaned = removeUnsupportedQuotedClaims(profile, [issue]);
  assert.deepEqual(cleaned.resolved, [issue]);
  assert.deepEqual(cleaned.profile.persona.traits, ["Reluctant to accept help"]);
  assert.equal(cleaned.profile.summary, "She once joined the X-Men.");
});

test("quoted omissions and direct contradictions are never silently deleted", () => {
  const profile = { persona: { traits: ["She enjoys killing."] } };
  const issues = [
    "The profile omits 'She enjoys killing' despite strong evidence.",
    "The profile claims 'She enjoys killing' but this directly contradicts the dossier.",
  ];
  const cleaned = removeUnsupportedQuotedClaims(profile, issues);
  assert.deepEqual(cleaned.resolved, []);
  assert.deepEqual(cleaned.profile, profile);
});

test("a repeatedly repaired profile is not stranded by increasingly specific omission wording", () => {
  const dossier = {
    facts: [
      { category: "identity", scope: "baseline" },
      { category: "role", scope: "baseline" },
      { category: "personality", scope: "baseline" },
      { category: "relationship", scope: "baseline" },
      { category: "history", scope: "baseline" },
      { category: "knowledge", scope: "baseline" },
    ],
  };
  assert.deepEqual(blockingProfileReviewIssues([
    "Omission: The profile fails to mention her fixation on sweets.",
    "Unsupported defining claim: She is a professional pastry chef.",
    "Contradiction: The profile reverses her relationship with her sister.",
  ], dossier, { afterRepair: true }), [
    "Unsupported defining claim: She is a professional pastry chef.",
    "Contradiction: The profile reverses her relationship with her sister.",
  ]);
});

test("variant-only personality leakage is removed from the named profile fields", () => {
  const issue = "Character research needs clarification: The profile includes a 'selfConcept' of insecurity and a 'vulnerabilityMap' regarding her status as the only ship of her class, as well as 'characterTensions' regarding internal grief over lacking sister ships; however, the dossier marks the claim that she feels depressed about being the only ship of her class as 'variant' (specific to another manga), meaning it must not define the baseline profile.";
  const profile = { persona: {
    selfConcept: ["She is proud of her speed.", "She is insecure about being the only ship of her class."],
    vulnerabilityMap: ["Being the only ship of her class makes her withdraw and doubt herself."],
    characterTensions: ["Her energetic surface hides internal grief over lacking sister ships.", "She is fast but sometimes impatient."],
  } };
  const cleaned = removeVariantDerivedClaims(profile, [issue]);
  assert.deepEqual(cleaned.resolved, [issue]);
  assert.deepEqual(cleaned.profile.persona.selfConcept, ["She is proud of her speed."]);
  assert.deepEqual(cleaned.profile.persona.vulnerabilityMap, []);
  assert.deepEqual(cleaned.profile.persona.characterTensions, ["She is fast but sometimes impatient."]);
});

test("blocks a shallow personality profile when every remote research source failed", () => {
  const research = { evidence: { diagnostics: [
    { provider: "wikipedia", status: "failed" },
    { provider: "anilist", status: "failed" },
    { provider: "franchise_wiki", status: "failed" },
  ] } };
  assert.equal(dossierBlockedByResearchOutage({ facts: [
    { category: "identity", scope: "baseline" },
    { category: "appearance", scope: "baseline" },
  ] }, research), true);
  assert.equal(dossierBlockedByResearchOutage({ facts: [
    { category: "personality", scope: "baseline" },
  ] }, research), false);
});

test("blocks a shallow profile when remote sources return no matching character", () => {
  const research = { evidence: { diagnostics: [
    { provider: "wikipedia", status: "no_match" },
    { provider: "anilist", status: "no_match" },
    { provider: "franchise_wiki", status: "no_match" },
  ] } };
  assert.equal(dossierBlockedByResearchOutage({ facts: [
    { category: "identity", scope: "baseline" },
  ] }, research), true);
});

test("successful substantial research outranks imperfect dossier category labels", () => {
  const research = { evidence: {
    diagnostics: [
      { provider: "wikipedia", status: "retrieved" },
      { provider: "anilist", status: "retrieved" },
      { provider: "franchise_wiki", status: "retrieved" },
    ],
    passages: [{
      provider: "franchise_wiki",
      text: "Motoko Kusanagi is the field leader of Public Security Section 9. She is an enigmatic full-body cyborg, an expert hacker, and a trusted commander who questions the nature of identity while retaining dry humor and close bonds with her team.",
    }],
  } };
  assert.equal(dossierBlockedByResearchOutage({ facts: [
    { category: "knowledge", claim: "Section 9 field operations", scope: "baseline" },
    { category: "appearance", claim: "Full-body cyborg", scope: "baseline" },
  ] }, research), false);
});

test("an identity-grounded character without fixed canon personality can proceed conservatively", () => {
  const research = { catalogueNotes: [
    "Aster Vale is a virtual singer developed by a music software company. The character is used as a voicebank and appears in performances and user-created songs. Her visual design includes blue hair and a black skirt.",
  ], evidence: { diagnostics: [
    { provider: "wikipedia", status: "no_match" },
    { provider: "anilist", status: "no_match" },
  ] } };
  assert.equal(dossierBlockedByResearchOutage({ facts: [
    { category: "identity", claim: "Aster Vale is a virtual singer", scope: "baseline" },
  ] }, research), false);
  assert.equal(dossierBlockedByResearchOutage({ facts: [
    { category: "appearance", claim: "Blue hair", scope: "baseline" },
  ] }, research), true);
});
