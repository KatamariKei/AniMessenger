import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendRevelationDefinitions, createRevelationStore, publicRevelationPreparation, revelationIdentity, validateRevelationDraft } from "../server/revelations.mjs";
import { generateCharacterRevelations } from "../server/ollama.mjs";

const character = { id: "fixture-character", name: "Test Character", series: "Selected continuity", tags: [] };
const passages = [{ id: "source-one", provider: "franchise_wiki", url: "https://example.test/source", text: "She learned to repair clocks from her grandmother, and still treasures that skill." }];
const draft = { title: "A familiar craft", truth: "She learned clock repair from her grandmother.", awareness: "character_knows", scope: "selected_continuity",
  clue: "An old clock catches her attention.", paths: ["Ask how she learned her craft.", "Discuss the clock she is examining."],
  directQuestion: "Who taught you to repair clocks?", revealCondition: "A natural conversation about the source of her skill.", minimumTrust: 20,
  sources: [{ sourceId: "source-one", quote: "She learned to repair clocks from her grandmother" }] };

test("definitions require exact source quotations, selected continuity, and distinct routes", () => {
  assert.equal(validateRevelationDraft(character, { revelations: [draft] }, passages).length, 1);
  for (const patch of [{ sources: [{ sourceId: "source-one", quote: "She secretly loves flowers." }] }, { scope: "uncertain" }, { awareness: "character_unaware" }, { paths: ["Ask her.", "Ask her."] }, { minimumTrust: 200 }, { clue: draft.truth }]) {
    assert.equal(validateRevelationDraft(character, { revelations: [{ ...draft, ...patch }] }, passages).length, 0);
  }
});

test("sparse evidence yields fewer discoveries and IDs remain stable", () => {
  const definitions = validateRevelationDraft(character, { revelations: [draft, draft] }, passages);
  assert.equal(definitions.length, 1);
  assert.deepEqual(validateRevelationDraft(character, { revelations: [] }, passages), []);
  assert.equal(validateRevelationDraft(character, { revelations: [draft] }, passages)[0].id, definitions[0].id);
  assert.notEqual(revelationIdentity(character), revelationIdentity({ ...character, series: "Other continuity" }));
});

test("public preparation projection contains no answers, titles, clues, counts, or source data", () => {
  const state = { status: "ready", definitions: validateRevelationDraft(character, { revelations: [draft] }, passages), rawResponse: "private answer" };
  assert.deepEqual(publicRevelationPreparation(state), { status: "ready", discoveryEnabled: false, canResearchMore: true });
  assert.doesNotMatch(JSON.stringify(publicRevelationPreparation(state)), /grandmother|clock|title|truth|clue|sources|definitions|count/);
});

test("private definitions survive restart and are immutable once prepared", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-revelations-"));
  t.after(async () => { assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); await fs.rm(directory, { recursive: true, force: true }); });
  const store = createRevelationStore(directory);
  const definitions = validateRevelationDraft(character, { revelations: [draft] }, passages);
  await store.save(character, { status: "ready", definitions });
  await store.save(character, { status: "failed", definitions: [] });
  const saved = await createRevelationStore(directory).load(character);
  assert.equal(saved.status, "ready");
  assert.deepEqual(saved.definitions, definitions);
  assert.equal(await store.load({ ...character, series: "Different continuity" }), null);
});

test("corrupt private state fails closed without replacing stored definitions", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-revelations-"));
  t.after(async () => { assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); await fs.rm(directory, { recursive: true, force: true }); });
  const file = path.join(directory, revelationIdentity(character) + ".json");
  await fs.writeFile(file, "corrupt fixture");
  await assert.rejects(createRevelationStore(directory).save(character, { status: "queued" }), /not changed/);
  assert.equal(await fs.readFile(file, "utf8"), "corrupt fixture");
});

test("generation performs independent review and ignores unapproved or invented IDs", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    calls++;
    let response;
    if (calls === 1) {
      assert.equal(request.format.properties.revelations.maxItems, 9);
      response = { revelations: [{ ...draft, evidenceIds: [request.format.properties.revelations.items.properties.evidenceIds.items.enum[0]] }] };
    } else {
      assert.ok(request.format.properties.approvedIds);
      response = { approvedIds: [...request.format.properties.approvedIds.items.enum, "invented-id"] };
    }
    return new Response(JSON.stringify({ message: { content: JSON.stringify(response) } }), { status: 200 });
  };
  try {
    const result = await generateCharacterRevelations({ ollamaUrl: "http://local-test", profileModel: "test" }, character, { summary: "Fixture", canon: {}, persona: { traits: [] } }, passages);
    assert.equal(calls, 2);
    assert.equal(result.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("no source passages means no model call or invented revelations", async () => {
  assert.deepEqual(await generateCharacterRevelations({}, character, {}, []), []);
});

test("a larger validated pool selects three in reviewer preference order and records metadata only", async () => {
  const originalFetch = globalThis.fetch;
  const candidates = Array.from({ length: 7 }, (_, i) => ({ ...draft, title: `Candidate ${i}`, truth: `Supported independent topic ${i}.` }));
  let calls = 0;
  let diagnostic;
  globalThis.fetch = async (_, options) => {
    const request = JSON.parse(options.body);
    calls++;
    const ids = request.format.properties.approvedIds?.items.enum;
    const content = calls === 1 ? { revelations: candidates.map(item => ({ ...item, evidenceIds: [request.format.properties.revelations.items.properties.evidenceIds.items.enum[0]] })) } : { approvedIds: [ids[6], ids[4], ids[1], "invented"] };
    return new Response(JSON.stringify({ message: { content: JSON.stringify(content) } }));
  };
  try {
    const result = await generateCharacterRevelations({ ollamaUrl: "http://local-test", profileModel: "test" }, character,
      { summary: "Fixture", canon: {}, persona: { traits: [] } }, passages, [], { onDiagnostics: value => { diagnostic = value; } });
    assert.deepEqual(result.map(item => item.title), ["Candidate 6", "Candidate 4", "Candidate 1"]);
    assert.equal(calls, 2);
    assert.equal(diagnostic.proposed, 7);
    assert.equal(diagnostic.validated, 7);
    assert.equal(diagnostic.selected, 3);
    assert.equal(diagnostic.shortfall, 0);
    assert.doesNotMatch(JSON.stringify(diagnostic), /grandmother|Supported independent|Candidate|source-one/);
  } finally { globalThis.fetch = originalFetch; }
});

test("candidate rejection diagnostics distinguish unsupported quotes, awareness and duplicates", () => {
  const diagnostics = {};
  validateRevelationDraft(character, { revelations: [draft, draft,
    { ...draft, awareness: "character_unaware" },
    { ...draft, sources: [{ sourceId: "source-one", quote: "An invented unsupported claim." }] },
  ] }, passages, diagnostics);
  assert.deepEqual(diagnostics.rejections, { duplicate: 1, "character-unaware": 1, "unsupported-quotation": 1 });
});

test("follow-up research uses rejection feedback without relabeling character-unaware facts", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async (_, options) => {
    const request = JSON.parse(options.body);
    called = true;
    const instructions = request.messages.map(item => item.content).join("\n");
    assert.match(instructions, /DIFFERENT topics/);
    assert.match(instructions, /Do not relabel unknown genealogy/);
    assert.match(instructions, /character-unaware/);
    const input = JSON.parse(request.messages.at(-1).content);
    assert.equal(input.candidatePoolTarget, 9);
    assert.equal(input.finalSelectionSlots, 3);
    return new Response(JSON.stringify({ message: { content: '{"revelations":[]}' } }));
  };
  try {
    assert.deepEqual(await generateCharacterRevelations({ ollamaUrl: "http://local-test", profileModel: "test" }, character,
      { summary: "Fixture", canon: {}, persona: { traits: [] } }, passages, [],
      { feedback: { rejections: { "character-unaware": 2 } } }), []);
    assert.equal(called, true);
  } finally { globalThis.fetch = originalFetch; }
});

test("a retry cannot relabel and resubmit an already rejected truth", async () => {
  const originalFetch = globalThis.fetch;
  let diagnostic, rejected;
  globalThis.fetch = async (_, options) => {
    const request = JSON.parse(options.body);
    const input = JSON.parse(request.messages.at(-1).content);
    assert.deepEqual(input.rejectedTopicsDoNotRepeat, [draft.truth]);
    assert.match(request.messages.map(item => item.content).join("\n"), /Even when only ONE final slot remains/);
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ revelations: [{ ...draft,
      evidenceIds: [request.format.properties.revelations.items.properties.evidenceIds.items.enum[0]] }] }) } }));
  };
  try {
    const result = await generateCharacterRevelations({ ollamaUrl: "http://local-test", profileModel: "test" }, character,
      { summary: "Fixture", canon: {}, persona: { traits: [] } }, passages, [], {
        rejectedTopics: [draft.truth], onDiagnostics: value => { diagnostic = value; }, onRejectedTopics: value => { rejected = value; },
      });
    assert.deepEqual(result, []);
    assert.deepEqual(rejected, [draft.truth]);
    assert.equal(diagnostic.rejections["repeated-rejected-topic"], 1);
    assert.doesNotMatch(JSON.stringify(diagnostic), /grandmother/);
  } finally { globalThis.fetch = originalFetch; }
});

test("enrichment appends without replacing existing definitions and stops at three", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-revelations-"));
  t.after(async () => { assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); await fs.rm(directory, { recursive: true, force: true }); });
  const store = createRevelationStore(directory);
  const first = validateRevelationDraft(character, { revelations: [draft] }, passages)[0];
  await store.save(character, { status: "ready", definitions: [first] });
  await store.save(character, { status: "queued" }, { enrich: true });
  assert.deepEqual((await store.load(character)).definitions, [first]);
  const extra = [1, 2, 3].map(i => ({ ...first, id: `additional-${i}`, truth: `A different supported discovery ${i}.` }));
  await store.save(character, { status: "ready", definitions: extra }, { enrich: true });
  const prepared = await store.load(character);
  assert.equal(prepared.definitions.length, 3);
  assert.deepEqual(prepared.definitions[0], first);
  assert.equal(publicRevelationPreparation(prepared).canResearchMore, false);
  await store.save(character, { status: "failed", definitions: [] }, { enrich: true });
  assert.deepEqual((await store.load(character)).definitions, prepared.definitions);
  assert.equal((await store.load(character)).status, "ready");
});

test("append-only merging rejects reworded-identical truths and reused IDs", () => {
  const first = { id: "first", truth: "She learned clock repair from her grandmother." };
  assert.deepEqual(appendRevelationDefinitions([first], [{ id: "new", truth: "SHE learned clock repair from her grandmother!" }, { id: "first", truth: "Replacement answer." }]), [first]);
});

test("clue refinement preserves discoveries, source evidence, trust gates and unlock history", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-clues-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createRevelationStore(directory);
  const definition = validateRevelationDraft(character, { revelations: [draft] }, passages)[0];
  await store.save(character, { status: "ready", definitions: [definition], historyReviews: { chat: { acknowledgedUnlockIds: ["saved-unlock"], discoveries: [{ discoveryId: definition.id }] } } });
  const before = await store.load(character);
  await store.save(character, {}, { clueUpdates: [{ id: definition.id, clue: "An old clock hints at a skill with personal roots.", truth: "Do not save", minimumTrust: 0 }] });
  const after = await store.load(character);
  assert.equal(after.definitions[0].clue, "An old clock hints at a skill with personal roots.");
  assert.equal(after.definitions[0].previousClue, before.definitions[0].clue);
  for (const key of ["id", "truth", "minimumTrust", "sources", "paths", "directQuestion", "revealCondition"]) assert.deepEqual(after.definitions[0][key], before.definitions[0][key]);
  assert.deepEqual(after.historyReviews, before.historyReviews);
});
