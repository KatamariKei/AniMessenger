import test from "node:test";
import assert from "node:assert/strict";
import { addManualMemory, allowForgottenMemory, automaticMemoryCandidates, editMemory, explicitMemoryCandidates, forgetMemory, historicalJukeboxMemories, isRecallQuestion, memoryRecallGuidance, mergeMemories, normalizeForgottenMemories, rememberForgottenMemory, removeUnsupportedNamedMemories, retainMemories, selectRelevantMemories } from "../server/memory.mjs";
import { contextualRecallQuery, historicalMemoryTranscript, incrementalMemoryWindow, isContextualRecallTurn, relevantMemoriesForTurn } from "../server/ollama.mjs";

test("durable memories normalize and merge duplicate facts", () => {
  const first = mergeMemories([], [{
    kind: "shared_creation",
    text: "The user and Nova created a band called Midnight Spoons and named its genre DESSERT-WAVE.",
    keywords: ["band", "midnight spoons", "dessert-wave"],
    importance: 5,
  }], "message-1", new Date("2026-07-15T12:00:00Z"));
  const merged = mergeMemories(first, [{
    kind: "shared_creation",
    text: "Nova and the user created the band Midnight Spoons, whose genre is DESSERT-WAVE.",
    keywords: ["music"],
    importance: 4,
  }], "message-2", new Date("2026-07-15T13:00:00Z"));
  assert.equal(merged.length, 1);
  assert.equal(merged[0].importance, 5);
  assert.deepEqual(merged[0].sourceMessageIds, ["message-1", "message-2"]);
});

test("a newly stated named favorite replaces its older value", () => {
  const first = mergeMemories([], [{
    kind: "preference",
    text: "The user's favorite drink is coffee.",
    keywords: ["favorite drink", "coffee"],
    importance: 3,
  }], "coffee-message", new Date("2026-09-01T12:00:00Z"));
  const corrected = mergeMemories(first, [{
    kind: "preference",
    text: "The user's favorite drink is jasmine tea.",
    keywords: ["favorite drink", "jasmine tea"],
    importance: 3,
  }], "tea-message", new Date("2026-09-28T12:00:00Z"));
  assert.equal(corrected.length, 1);
  assert.match(corrected[0].text, /jasmine tea/i);
  assert.doesNotMatch(corrected[0].keywords.join(" "), /coffee/i);
  assert.deepEqual(corrected[0].sourceMessageIds, ["coffee-message", "tea-message"]);
});

test("automatic preference updates cannot overwrite a manual correction", () => {
  const { memories: manual } = addManualMemory([], {
    kind: "preference",
    text: "The user's favorite drink is jasmine tea.",
    importance: 4,
  }, new Date("2026-09-28T12:00:00Z"));
  const afterAutomaticReview = mergeMemories(manual, [{
    kind: "preference",
    text: "The user's favorite drink is coffee.",
    importance: 4,
  }], "older-coffee-message", new Date("2026-09-28T13:00:00Z"));
  assert.equal(afterAutomaticReview.length, 1);
  assert.match(afterAutomaticReview[0].text, /jasmine tea/i);
});

test("same durable fact merges across the user's established name alias", () => {
  const memories = mergeMemories([], [
    { kind: "user_fact", text: "The user's name is Alex.", keywords: ["name", "Alex"], importance: 5 },
    { kind: "user_fact", text: "The user is divorced and single.", keywords: ["divorced", "single"], importance: 3, sourceMessageIds: ["status-one"] },
    { kind: "user_fact", text: "Alex is single and divorced.", keywords: ["relationship status"], importance: 3, sourceMessageIds: ["status-two"] },
  ]);

  assert.equal(memories.length, 2);
  const status = memories.find((memory) => /divorced/i.test(memory.text));
  assert.deepEqual(status.sourceMessageIds, ["status-one", "status-two"]);
});

test("conflicting automatic measurements remain separate", () => {
  const memories = mergeMemories([], [
    { kind: "user_fact", text: "The user's height is 70 inches.", keywords: ["height"], importance: 3 },
    { kind: "user_fact", text: "The user's height is 72 inches.", keywords: ["height"], importance: 3 },
  ]);

  assert.equal(memories.length, 2);
});

test("a manual correction supersedes a conflicting automatic fact", () => {
  const automatic = mergeMemories([], [
    { kind: "user_fact", text: "The user's height is 70 inches.", keywords: ["height"], importance: 3 },
  ]);
  const { memories: corrected } = addManualMemory(automatic, {
    kind: "user_fact",
    text: "The user's height is 72 inches.",
    importance: 4,
  });

  assert.equal(corrected.length, 1);
  assert.match(corrected[0].text, /72 inches/i);
  assert.equal(corrected[0].userEdited, true);
});

test("recall guidance exposes unresolved fact conflicts instead of guessing", () => {
  const memories = mergeMemories([], [
    { kind: "user_fact", text: "The user's height is 70 inches.", keywords: ["height"], importance: 3 },
    { kind: "user_fact", text: "The user's height is 72 inches.", keywords: ["height"], importance: 3 },
  ]);
  const relevant = selectRelevantMemories(memories, "Do you remember my height?", 8);
  const guidance = memoryRecallGuidance(relevant, "Do you remember my height?");

  assert.equal(relevant.length, 2);
  assert.match(guidance, /memories conflict/i);
  assert.match(guidance, /Do not guess/i);
});

test("a band-name question retrieves the specific shared creation", () => {
  const memories = mergeMemories([], [
    { kind: "preference", text: "The user prefers coffee without sugar.", keywords: ["coffee"], importance: 3 },
    { kind: "shared_creation", text: "The user and Nova created a band called Midnight Spoons and named its genre DESSERT-WAVE.", keywords: ["band", "band name", "midnight spoons", "dessert-wave", "genre"], importance: 5 },
  ]);
  const relevant = selectRelevantMemories(memories, "What was our band name and genre?", 2);
  assert.match(relevant[0].text, /Midnight Spoons/);
  assert.match(relevant[0].text, /DESSERT-WAVE/);
});

test("a memory can be explicitly forgotten", () => {
  const memories = mergeMemories([], [{ kind: "user_fact", text: "The user has a cat named Pixel.", keywords: ["cat", "pixel"], importance: 4 }]);
  assert.deepEqual(forgetMemory(memories, memories[0].id), []);
});

test("a forgotten memory cannot be recreated by automatic extraction", () => {
  const original = mergeMemories([], [{
    kind: "shared_event",
    text: "The user and Erica planned a beach trip for September 29.",
    keywords: ["beach trip", "September 29"],
    importance: 3,
    sourceMessageIds: ["trip-plan"],
  }]);
  const forgottenMemories = rememberForgottenMemory([], original[0], new Date("2026-09-28T12:00:00Z"));
  assert.equal(forgottenMemories[0].text, undefined);
  assert.equal(forgottenMemories[0].keywords, undefined);
  assert.match(forgottenMemories[0].fingerprint, /^[a-f0-9]{64}$/);
  const rescanned = mergeMemories([], [{
    kind: "open_loop",
    text: "Erica and the user plan to take their beach trip on September 29.",
    keywords: ["beach trip", "September 29"],
    importance: 3,
    sourceMessageIds: ["trip-plan"],
  }], undefined, new Date("2026-09-28T13:00:00Z"), { forgottenMemories });
  assert.deepEqual(rescanned, []);
});

test("manually adding a corrected memory clears its matching forgotten marker", () => {
  const forgottenMemories = rememberForgottenMemory([], {
    kind: "shared_event",
    text: "The user and Erica traveled to the rental property.",
    keywords: ["rental property"],
    sourceMessageIds: ["trip-plan"],
  });
  const corrected = {
    kind: "open_loop",
    text: "The user and Erica plan to travel to the rental property.",
    keywords: ["rental property"],
    sourceMessageIds: ["trip-plan"],
    importance: 3,
    userEdited: true,
  };
  assert.deepEqual(allowForgottenMemory(forgottenMemories, corrected), []);
  assert.equal(mergeMemories([], [corrected], undefined, new Date(), { forgottenMemories }).length, 1);
});

test("legacy readable forgotten markers migrate to opaque fingerprints", () => {
  const normalized = normalizeForgottenMemories([{
    kind: "shared_event",
    text: "A readable memory that should no longer remain in hidden storage.",
    keywords: ["readable memory"],
    sourceMessageIds: ["source-1"],
    forgottenAt: "2026-09-28T12:00:00.000Z",
  }]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].text, undefined);
  assert.equal(normalized[0].keywords, undefined);
  assert.match(normalized[0].fingerprint, /^[a-f0-9]{64}$/);
});

test("incomplete local-model fragments are not stored as memories", () => {
  const memories = mergeMemories([], [{
    kind: "shared_creation",
    text: "Nova describes their plan as a",
    keywords: ["relationship"],
    importance: 4,
  }]);
  assert.deepEqual(memories, []);
});

test("routine wardrobe changes are not promoted into durable memories", () => {
  const candidates = automaticMemoryCandidates([{
    kind: "shared_event",
    text: "The user helped Erica out of her waitress apron and uniform after her shift to help her relieve stress.",
    keywords: ["apron", "uniform", "shift"],
    importance: 3,
  }], { userText: "[action: I help Erica remove her apron after her shift.]" });
  assert.deepEqual(candidates, []);
});

test("automatic memories cannot expand a named garment beyond the user's action", () => {
  const candidates = automaticMemoryCandidates([{
    kind: "shared_event",
    text: "On their anniversary, the user removed Erica's apron and uniform as part of an important milestone.",
    keywords: ["anniversary", "apron", "uniform"],
    importance: 4,
  }], { userText: "On our anniversary, I remove Erica's apron." });
  assert.deepEqual(candidates, []);
});

test("meaningful wardrobe-related milestones survive when the exact garment is grounded", () => {
  const candidates = automaticMemoryCandidates([{
    kind: "shared_event",
    text: "For their anniversary, the user gifted Erica a keepsake dress.",
    keywords: ["anniversary", "keepsake", "dress"],
    importance: 4,
  }], { userText: "For our anniversary, I gift Erica a keepsake dress." });
  assert.equal(candidates.length, 1);
});

test("automatic memory extraction rejects an invented exact name", () => {
  const candidates = automaticMemoryCandidates([{
    kind: "shared_creation",
    text: "The user and Erica named a small turtle 'Barnaby' during their visit to the tide pools.",
    keywords: ["turtle", "Barnaby"],
    importance: 5,
  }], {
    userText: "Don't you dare lay a hand on poor little Donatello!",
    sourceText: "The user called the turtle Donatello.",
    requireNamedEvidence: true,
  });
  assert.deepEqual(candidates, []);
});

test("automatic memory extraction preserves a sourced exact name", () => {
  const candidates = automaticMemoryCandidates([{
    kind: "user_fact",
    text: "The user has named a small turtle 'Donatello'.",
    keywords: ["turtle", "Donatello"],
    importance: 4,
  }], {
    userText: "Don't you dare lay a hand on poor little Donatello!",
    sourceText: "Don't you dare lay a hand on poor little Donatello!",
    requireNamedEvidence: true,
  });
  assert.equal(candidates.length, 1);
});

test("unsupported user naming memories are retired while sourced names remain", () => {
  const messages = [
    { id: "user-donatello", from: "user", text: "Don't you dare lay a hand on poor little Donatello!" },
    { id: "character-barnaby", from: "character", text: "His name is Barnaby!" },
  ];
  const memories = [
    { id: "true", kind: "user_fact", text: "The user has named a small turtle 'Donatello'.", sourceMessageIds: ["user-donatello"] },
    { id: "false", kind: "shared_creation", text: "The user and Erica named a sea turtle 'Barnaby'.", sourceMessageIds: ["user-donatello", "character-barnaby"] },
  ];
  assert.deepEqual(removeUnsupportedNamedMemories(memories, messages).map((memory) => memory.id), ["true"]);
});

test("referential name questions are treated as recall and enriched with immediate context", () => {
  const question = "What was his name again? Drawing a blank...";
  assert.equal(isRecallQuestion(question), true);
  const query = contextualRecallQuery(question, "We found our little turtle friend at the tide pools.");
  assert.match(query, /turtle friend/i);
  const relevant = selectRelevantMemories([{
    id: "donatello",
    kind: "user_fact",
    text: "The user has named a small turtle 'Donatello'.",
    keywords: ["turtle", "Donatello"],
    importance: 4,
  }], query, 4);
  assert.deepEqual(relevant.map((memory) => memory.id), ["donatello"]);
});

test("natural forgot phrasing activates recall and retrieves the described dish", () => {
  const query = "Did you forget that other dish I made for you? You were quite impressed. The Thai one?";
  assert.equal(isRecallQuestion(query), true);
  const memories = mergeMemories([], [
    { id: "breakfast", kind: "user_fact", text: "The user is a skilled breakfast cook.", keywords: ["breakfast"], importance: 4 },
    { id: "curry", kind: "user_fact", text: "The user prepared spicy Panang curry with chicken for Erica.", keywords: ["Thai food", "Panang curry"], importance: 3 },
    { id: "takeout", kind: "shared_event", text: "The user and Erica once ordered Thai food.", keywords: ["Thai food", "takeout"], importance: 3 },
  ]);
  const relevant = selectRelevantMemories(memories, query, 8);
  assert.ok(relevant.some((memory) => /Panang curry/i.test(memory.text)));
});

test("a corrective hint remains part of the immediately preceding recall attempt", () => {
  const context = [
    "Did you forget that other dish I made for you? The Thai one?",
    "I don't remember. Was it Pad Thai?",
  ].join("\n");
  const followUp = "Not Pad Thai... the other one! You really loved it!";
  assert.equal(isContextualRecallTurn(followUp, context), true);
  assert.match(contextualRecallQuery(followUp, context), /Thai one/i);
  assert.match(memoryRecallGuidance([], followUp, { recallIntent: true }), /do not remember/i);
});

test("recall clarification survives a second failed character guess", () => {
  const context = [
    "Not Pad Thai... the other one! You really loved it!",
    "What other one? Give me a hint before I worry it has slipped my mind.",
  ].join("\n");
  assert.equal(isContextualRecallTurn("It was the spicy curry!", context), true);
});

test("low-value automatic events are rejected while concrete open plans remain useful", () => {
  assert.deepEqual(automaticMemoryCandidates([{ kind: "shared_event", text: "The user and Erica made ordinary small talk.", importance: 2 }]), []);
  assert.equal(automaticMemoryCandidates([{ kind: "open_loop", text: "The user and Erica plan to visit the observatory next Saturday.", importance: 2 }]).length, 1);
});

test("temporary scene status is not promoted into durable memory", () => {
  assert.deepEqual(automaticMemoryCandidates([{
    kind: "shared_event",
    text: "The user and Erica are currently on vacation together.",
    importance: 3,
  }]), []);
  assert.equal(automaticMemoryCandidates([{
    kind: "shared_event",
    text: "The user and Erica arrived at their vacation rental and exchanged anniversary gifts.",
    importance: 4,
  }]).length, 1);
});

test("legacy automatic scene summaries are retired while manual versions remain", () => {
  const automatic = mergeMemories([{
    id: "temporary",
    kind: "shared_event",
    text: "The user and Erica are currently on vacation together.",
    importance: 3,
    createdAt: "2026-09-28T20:00:00.000Z",
    updatedAt: "2026-09-28T20:00:00.000Z",
    sourceMessageIds: ["vacation-turn"],
  }], []);
  assert.deepEqual(automatic, []);

  const manual = mergeMemories([{
    id: "temporary-manual",
    kind: "shared_event",
    text: "The user and Erica are currently on vacation together.",
    importance: 3,
    userEdited: true,
    createdAt: "2026-09-28T20:00:00.000Z",
    updatedAt: "2026-09-28T20:00:00.000Z",
    sourceMessageIds: [],
  }], []);
  assert.equal(manual.length, 1);
});

test("retention protects curated and durable memories when automatic events reach capacity", () => {
  const routine = Array.from({ length: 245 }, (_, index) => ({
    id: `routine-${index}`,
    kind: "shared_event",
    text: `Nova and Alex completed ordinary activity number ${index}.`,
    keywords: ["ordinary activity", `activity ${index}`],
    importance: 3,
    createdAt: `2026-09-${String((index % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
    updatedAt: `2026-09-${String((index % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
    sourceMessageIds: [],
  }));
  const protectedMemories = [
    { id: "manual", kind: "shared_event", text: "A manually corrected old memory.", importance: 1, userEdited: true, updatedAt: "2020-01-01T00:00:00.000Z" },
    { id: "fact", kind: "user_fact", text: "The user is allergic to shellfish.", importance: 2, updatedAt: "2020-01-01T00:00:00.000Z" },
    { id: "boundary", kind: "boundary", text: "The user does not want surprise visitors.", importance: 2, updatedAt: "2020-01-01T00:00:00.000Z" },
    { id: "plan", kind: "open_loop", text: "Nova and Alex plan to visit the observatory.", importance: 2, updatedAt: "2020-01-01T00:00:00.000Z" },
    { id: "milestone", kind: "shared_event", text: "Nova and Alex shared their first kiss.", importance: 3, updatedAt: "2020-01-01T00:00:00.000Z" },
    { id: "important", kind: "shared_event", text: "Nova and Alex repaired the community telescope together.", importance: 4, updatedAt: "2020-01-01T00:00:00.000Z", sourceMessageIds: ["repair-1", "repair-2"] },
  ];

  const retained = retainMemories([...routine, ...protectedMemories], 240);
  assert.equal(retained.length, routine.length + protectedMemories.length);
  assert.equal(retained.filter(memory => !memory.archived).length, 240);
  assert.equal(retained.filter(memory => memory.archived).length, 11);
  for (const memory of protectedMemories) assert.ok(retained.some((item) => item.id === memory.id), memory.id);
});

test("manual memories are never automatically evicted to satisfy the capacity target", () => {
  const manual = Array.from({ length: 3 }, (_, index) => ({
    id: `manual-${index}`,
    kind: "shared_event",
    text: `User-curated memory ${index}.`,
    importance: 1,
    userEdited: true,
  }));
  assert.equal(retainMemories(manual, 1).length, 3);
});

test("adding a manual memory to a full collection saves it and keeps older history", () => {
  const routine = Array.from({ length: 240 }, (_, index) => ({
    id: `routine-${index}`, kind: "shared_event", text: `Routine event number ${index}.`, importance: 1,
  }));
  const input = { kind: "preference", text: "Always has a thermos to hand" };
  const result = addManualMemory(routine, input);
  assert.equal(result.memories.length, 241);
  assert.equal(result.memories.filter(memory => memory.archived).length, 1);
  assert.ok(result.memories.some(memory => memory.id === result.saved.id && memory.userEdited && !memory.archived));
  const curated = routine.map(memory => ({ ...memory, userEdited: true }));
  assert.equal(addManualMemory(curated, input).memories.filter(memory => !memory.archived).length, 241);
});

test("manual notes survive automatic review and repeat submits reuse the same note", () => {
  const input = { kind: "user_fact", text: "The place we always go to" };
  const first = addManualMemory([], input);
  const repeat = addManualMemory(first.memories, input);
  assert.equal(repeat.alreadySaved, true);
  assert.equal(repeat.saved.id, first.saved.id);
  const second = addManualMemory(first.memories, { ...input, text: "The place we always go to is near the coast." });
  assert.equal(second.alreadySaved, false);
  assert.deepEqual(new Set(mergeMemories(second.memories, []).map(memory => memory.id)), new Set([first.saved.id, second.saved.id]));
});

test("detailed future plans cannot be promoted to completed trips", () => {
  const candidates = automaticMemoryCandidates([{
    kind: "shared_event",
    text: "The user and Erica planned a trip, packed dinner outfits and swimsuits, and traveled to a rental property on September 29th.",
    importance: 4,
  }], {
    userText: "We planned our trip for September 29. We'll pack light with dinner outfits and swimsuits before going to the rental property.",
  });
  assert.deepEqual(candidates, []);
});

test("a future plan becomes a shared event only with explicit user completion evidence", () => {
  const candidates = automaticMemoryCandidates([{
    kind: "shared_event",
    text: "The user and Erica planned a trip, packed dinner outfits and swimsuits, and traveled to a rental property on September 29th.",
    importance: 4,
  }], {
    userText: "We planned this trip last week, and now we arrived at the rental property with our dinner outfits and swimsuits.",
  });
  assert.equal(candidates.length, 1);
});

test("manual memories are durable and automatic extraction cannot overwrite the correction", () => {
  const { memories: added } = addManualMemory([], {
    kind: "shared_event",
    text: "Alex gave Nagatoro the nickname Purple Llama during their arcade visit.",
    importance: 4,
    eventAt: "2026-09-25T12:00:00.000Z",
  }, new Date("2026-09-26T12:00:00.000Z"));
  assert.equal(added.length, 1);
  assert.equal(added[0].userEdited, true);

  const afterAutomaticReview = mergeMemories(added, [{
    kind: "shared_event",
    text: "Nagatoro called Alex Purple Llama at the arcade.",
    importance: 5,
    keywords: ["Purple Llama", "arcade"],
  }], "later-message", new Date("2026-09-26T13:00:00.000Z"));
  assert.equal(afterAutomaticReview[0].text, added[0].text);
  assert.equal(afterAutomaticReview[0].userEdited, true);
  assert.ok(afterAutomaticReview[0].sourceMessageIds.includes("later-message"));
});

test("editing a memory preserves its identity and source trail", () => {
  const original = mergeMemories([], [{
    kind: "shared_event",
    text: "Alex and Erica listened to music at work.",
    importance: 3,
    sourceMessageIds: ["song", "reaction"],
    eventAt: "2026-09-13T02:31:07.525Z",
  }], undefined, new Date("2026-09-14T00:00:00.000Z"));
  const edited = editMemory(original, original[0].id, {
    text: "On Alex's first workplace visit, he played provocative jukebox songs to tease Erica.",
    kind: "shared_event",
    importance: 5,
    eventAt: "2026-09-12T12:00:00.000Z",
  }, new Date("2026-09-26T14:00:00.000Z"));

  assert.equal(edited[0].id, original[0].id);
  assert.equal(edited[0].createdAt, original[0].createdAt);
  assert.deepEqual(edited[0].sourceMessageIds, ["song", "reaction"]);
  assert.equal(edited[0].importance, 5);
  assert.equal(edited[0].userEdited, true);
  assert.match(edited[0].text, /jukebox songs/i);
});

test("meaningful intimate memories are preserved without topic censorship", () => {
  const memories = mergeMemories([], [{
    kind: "shared_event",
    text: "Alex and Erica had consensual sex for the first time and afterward agreed that the experience made them feel safer and more emotionally connected.",
    keywords: ["first time", "consensual sex", "emotional connection"],
    importance: 5,
  }], "intimate-event");

  assert.equal(memories.length, 1);
  assert.match(memories[0].text, /consensual sex/i);
  assert.deepEqual(mergeMemories(memories, []), memories);
});

test("explicit remember requests and durable personal facts are captured deterministically", () => {
  const requested = explicitMemoryCandidates("Please remember that our first night together was deeply important to me.");
  assert.equal(requested.length, 1);
  assert.equal(requested[0].importance, 5);
  assert.match(requested[0].text, /first night together/i);

  const favorites = explicitMemoryCandidates("My favorite song is Sex on Fire.");
  assert.equal(favorites[0].kind, "preference");
  assert.match(favorites[0].text, /Sex on Fire/);

  const allergy = explicitMemoryCandidates("I'm allergic to shellfish.");
  assert.equal(allergy[0].kind, "boundary");
  assert.equal(allergy[0].importance, 5);

  assert.deepEqual(explicitMemoryCandidates("Do you remember that first night together?"), []);
});

test("completed jukebox episodes are captured while hypothetical song plans are ignored", () => {
  const memories = historicalJukeboxMemories([
    { id: "hard", from: "user", text: "[action: I play AC/DC’s “Hard as a Rock” on the jukebox. lol not subtle.]", time: "2026-09-13T02:31:07.525Z" },
    { id: "fire", from: "user", text: "[action: I drop another coin in the jukebox and pick Kings of Leon’s Sex on Fire]", time: "2026-09-13T02:56:34.731Z" },
    { id: "plan", from: "user", text: "I might play some more provocative songs on the jukebox later.", time: "2026-09-14T02:56:34.731Z" },
    { id: "recap", from: "user", text: "On my first visit to your workplace, I played “Sex on Fire” on the jukebox to tease you.", time: "2026-09-26T18:46:40.289Z" },
  ], "Erica");

  assert.equal(memories.length, 1);
  assert.match(memories[0].text, /first visit to Erica's workplace/i);
  assert.match(memories[0].text, /Hard as a Rock/i);
  assert.match(memories[0].text, /Sex on Fire/i);
  assert.match(memories[0].text, /tease Erica/i);
  assert.deepEqual(memories[0].sourceMessageIds, ["hard", "fire", "recap"]);
  assert.equal(memories[0].eventAt, "2026-09-13T02:31:07.525Z");
});

test("a natural completed jukebox statement becomes an immediate memory candidate", () => {
  const candidates = explicitMemoryCandidates("On my first visit to your workplace, I played “Sex on Fire” on the jukebox to tease you.", "Erica");
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].kind, "shared_event");
  assert.equal(candidates[0].importance, 4);
  assert.match(candidates[0].text, /Sex on Fire/);
});

test("memory candidates retain model-supplied provenance and event time", () => {
  const memories = mergeMemories([], [{
    kind: "shared_event",
    text: "Alex played two teasing songs on the jukebox during Erica's shift.",
    keywords: ["jukebox", "shift"],
    importance: 4,
    sourceMessageIds: ["action-1", "reaction-1", "action-2"],
    eventAt: "2026-09-02T01:02:00.000Z",
  }]);

  assert.deepEqual(memories[0].sourceMessageIds, ["action-1", "reaction-1", "action-2"]);
  assert.equal(memories[0].eventAt, "2026-09-02T01:02:00.000Z");
});

test("a later reminder enriches provenance without replacing the fuller original episode", () => {
  const original = mergeMemories([], [{
    kind: "shared_event",
    text: "During the user's first visit to Erica's workplace, the user played Hard as a Rock and Sex on Fire on the jukebox to tease Erica.",
    keywords: ["jukebox", "Hard as a Rock", "Sex on Fire"],
    importance: 4,
    sourceMessageIds: ["hard", "fire", "reaction"],
    eventAt: "2026-09-13T02:31:07.525Z",
  }]);
  const reminded = mergeMemories(original, [{
    kind: "shared_event",
    text: "The user recently reminded Erica that Sex on Fire was one of the songs played on the jukebox during that workplace visit.",
    keywords: ["jukebox", "Sex on Fire", "workplace visit"],
    importance: 3,
    sourceMessageIds: ["reminder"],
    eventAt: "2026-09-26T19:00:00.000Z",
  }]);

  assert.equal(reminded.length, 1);
  assert.match(reminded[0].text, /Hard as a Rock/);
  assert.deepEqual(reminded[0].sourceMessageIds, ["hard", "fire", "reaction", "reminder"]);
  assert.equal(reminded[0].eventAt, "2026-09-13T02:31:07.525Z");
});

test("incremental checkpoints resume after the last reviewed message with nearby context", () => {
  const messages = Array.from({ length: 10 }, (_, index) => ({
    id: `message-${index}`,
    from: index % 2 ? "character" : "user",
    text: `Exchange ${index}`,
    time: `2026-09-20T10:0${index}:00.000Z`,
  }));
  const window = incrementalMemoryWindow(messages, { lastReviewedMessageId: "message-3" }, {
    minimumMessages: 4,
    maximumMessages: 4,
    contextMessages: 2,
  });

  assert.deepEqual(window.reviewedMessages.map((message) => message.id), ["message-4", "message-5", "message-6", "message-7"]);
  assert.deepEqual(window.messages.map((message) => message.id), ["message-2", "message-3", "message-4", "message-5", "message-6", "message-7"]);
  assert.equal(window.lastReviewedMessageId, "message-7");
});

test("incremental checkpoints wait for a complete multi-turn window", () => {
  const messages = [
    { id: "one", from: "user", text: "One" },
    { id: "two", from: "character", text: "Two" },
    { id: "three", from: "user", text: "Three" },
  ];
  assert.equal(incrementalMemoryWindow(messages, {}, { minimumMessages: 4 }), null);
});

test("the default incremental checkpoint reviews one completed exchange", () => {
  const messages = [
    { id: "user-one", from: "user", text: "My favorite dessert is tiramisu." },
    { id: "character-one", from: "character", text: "I'll remember that." },
  ];
  const window = incrementalMemoryWindow(messages);
  assert.deepEqual(window.reviewedMessages.map((message) => message.id), ["user-one", "character-one"]);
  assert.equal(window.lastReviewedMessageId, "character-one");
});

test("a completed event replaces matching promises and open loops across memory kinds", () => {
  const beforeRace = mergeMemories([], [
    {
      kind: "open_loop",
      text: "Nagatoro and Alex still need to settle their swimming race at the gym.",
      keywords: ["swimming race", "gym"],
      importance: 3,
    },
    {
      kind: "promise",
      text: "Nagatoro and Alex agreed to a swimming race tonight at the gym.",
      keywords: ["swimming race", "gym", "tonight"],
      importance: 3,
    },
  ], "planning-turn", new Date("2026-08-19T17:41:00Z"));

  const afterRace = mergeMemories(beforeRace, [{
    kind: "shared_event",
    text: "Nagatoro won the swimming race at the gym after Alex got a leg cramp, so Alex owes her one week as her servant.",
    keywords: ["swimming race", "gym", "nagatoro won", "servant"],
    importance: 4,
  }], "race-finished", new Date("2026-08-20T01:45:00Z"));

  assert.equal(afterRace.length, 1);
  assert.equal(afterRace[0].kind, "shared_event");
  assert.match(afterRace[0].text, /Nagatoro won/i);
  assert.match(afterRace[0].text, /servant/i);
  assert.deepEqual(afterRace[0].sourceMessageIds, ["planning-turn", "race-finished"]);
});

test("same-topic promise and open-loop wording consolidate into one active plan", () => {
  const memories = mergeMemories([], [
    {
      kind: "open_loop",
      text: "Alex and Nova still want to visit the moonlight observatory.",
      keywords: ["moonlight observatory", "visit"],
      importance: 2,
    },
    {
      kind: "promise",
      text: "Nova promised Alex they would visit the moonlight observatory together.",
      keywords: ["moonlight observatory", "visit"],
      importance: 3,
    },
  ], "observatory-plan");

  assert.equal(memories.length, 1);
  assert.equal(memories[0].kind, "promise");
  assert.match(memories[0].text, /promised/i);
});

test("a completed beach departure retires differently worded versions of the same plan", () => {
  const memories = mergeMemories([], [
    {
      kind: "open_loop",
      text: "The user and Erica are departing for a road trip to the beach.",
      keywords: ["road trip", "beach", "departing"],
      importance: 3,
    },
    {
      kind: "promise",
      text: "Alex and Erica are planning a beach trip for the upcoming weekend.",
      keywords: ["beach trip", "weekend"],
      importance: 3,
    },
    {
      kind: "open_loop",
      text: "Alex and Erica have planned a trip to the beach for September 29, 2026, including a potential visit to a nude beach.",
      keywords: ["nude beach", "beach trip", "September 29"],
      importance: 3,
    },
    {
      kind: "open_loop",
      text: "The user and Erica have plans to leave for the beach on September 26th.",
      keywords: ["beach trip", "September 26"],
      importance: 2,
    },
    {
      kind: "shared_event",
      text: "The user and Erica Anderson left the city for a two-hour drive to the beach.",
      keywords: ["beach trip", "travel", "drive"],
      importance: 3,
    },
  ], "beach-trip");

  assert.equal(memories.length, 1);
  assert.equal(memories[0].kind, "shared_event");
  assert.match(memories[0].text, /left the city/i);
  assert.match(memories[0].text, /drive to the beach/i);
});

test("lifecycle consolidation does not combine plans with different subjects", () => {
  const memories = mergeMemories([], [
    {
      kind: "promise",
      text: "Nova promised Alex they would drive to the beach this weekend.",
      keywords: ["beach trip"],
      importance: 3,
    },
    {
      kind: "open_loop",
      text: "Nova and Alex plan to drive to the mountain observatory this weekend.",
      keywords: ["mountain observatory"],
      importance: 3,
    },
  ]);

  assert.equal(memories.length, 2);
});

test("similar completed trips on different occasions remain separate", () => {
  const memories = mergeMemories([], [
    {
      kind: "shared_event",
      text: "Nova and Alex drove to the beach and watched the winter sunrise.",
      keywords: ["beach trip", "winter sunrise"],
      eventAt: "2026-01-08T08:00:00Z",
      importance: 3,
    },
    {
      kind: "shared_event",
      text: "Nova and Alex drove to the beach and watched the summer sunset.",
      keywords: ["beach trip", "summer sunset"],
      eventAt: "2026-07-18T20:00:00Z",
      importance: 3,
    },
  ]);

  assert.equal(memories.length, 2);
});

test("completed event summaries with shared source evidence consolidate", () => {
  const memories = mergeMemories([], [
    {
      kind: "shared_event",
      text: "Alex and Erica played a curated three-song set on the jukebox to tease each other at the bar.",
      keywords: ["bar", "music", "teasing", "playful exchange", "curated set", "jukebox", "The Breeders", "Divine Hammer"],
      sourceMessageIds: ["song-one", "reaction", "song-two"],
      importance: 3,
    },
    {
      kind: "shared_event",
      text: "At the bar, Alex played Big Ten Inch Record on the jukebox and waited for Erica's teasing reaction.",
      keywords: ["jukebox", "songs", "workplace", "Big Ten Inch Record", "Aerosmith", "bar", "provoke"],
      sourceMessageIds: ["reaction", "song-three"],
      importance: 3,
    },
  ]);

  assert.equal(memories.length, 1);
  assert.deepEqual(memories[0].sourceMessageIds, ["song-one", "reaction", "song-two", "song-three"]);
});

test("a source-backed merge never combines facts about different people", () => {
  const memories = mergeMemories([], [
    {
      kind: "user_fact",
      text: "The user's cock is 5 inches when flaccid and 8.5 inches when erect.",
      keywords: ["size", "anatomy", "cock", "inches"],
      sourceMessageIds: ["measurement-turn"],
      importance: 3,
    },
    {
      kind: "user_fact",
      text: "Erica's cock is 9.5 inches.",
      keywords: ["size", "anatomy", "cock", "inches"],
      sourceMessageIds: ["measurement-turn"],
      importance: 3,
    },
  ]);

  assert.equal(memories.length, 2);
});

test("source evidence consolidates differently phrased versions of a move-in decision", () => {
  const memories = mergeMemories([], [
    {
      kind: "shared_event",
      text: "Alex and Erica officially decided to move in together and make the home their shared space.",
      keywords: ["move in", "commitment", "home", "proposal", "relationship milestone", "decision"],
      sourceMessageIds: ["proposal", "decision"],
      importance: 5,
    },
    {
      kind: "shared_event",
      text: "The user and Erica entered an official partnership and decided to make the user's home ours, with Erica moving her belongings in.",
      keywords: ["partnership", "moving in", "home", "official", "belongings"],
      sourceMessageIds: ["decision", "moving-day"],
      importance: 4,
    },
  ]);

  assert.equal(memories.length, 1);
  assert.equal(memories[0].importance, 5);
});

test("one source can support separate durable events without merging them", () => {
  const memories = mergeMemories([], [
    {
      kind: "shared_event",
      text: "Nova and Alex confessed their love during the quiet train ride home.",
      keywords: ["love confession", "train ride"],
      sourceMessageIds: ["long-recap"],
      importance: 5,
    },
    {
      kind: "shared_event",
      text: "Nova and Alex adopted a stray cat they found outside the station.",
      keywords: ["adopted cat", "station"],
      sourceMessageIds: ["long-recap"],
      importance: 4,
    },
  ]);

  assert.equal(memories.length, 2);
});

test("a legacy named event merges with its dated detailed replacement", () => {
  const memories = mergeMemories([], [
    {
      kind: "shared_event",
      text: "Alex and Erica watched the movie 'Octopussy' together and discussed its opening sequence and the Octopus Cult.",
      keywords: ["Octopussy", "movie"],
      importance: 3,
    },
    {
      kind: "shared_event",
      text: "Alex and Erica watched the James Bond movie 'Octopussy', laughing at its absurd opening sequence and unrealistic plane climax.",
      keywords: ["Octopussy", "James Bond", "movie"],
      eventAt: "2026-09-22T06:21:59.927Z",
      sourceMessageIds: ["movie-start", "movie-reaction"],
      importance: 3,
    },
  ]);

  assert.equal(memories.length, 1);
  assert.equal(memories[0].eventAt, "2026-09-22T06:21:59.927Z");
  assert.match(memories[0].text, /plane climax/i);
});

test("revisiting the same named event on two dated occasions stays separate", () => {
  const memories = mergeMemories([], [
    {
      kind: "shared_event",
      text: "Nova and Alex watched 'Octopussy' at the old theater.",
      keywords: ["Octopussy", "theater"],
      eventAt: "2026-05-02T20:00:00Z",
      importance: 3,
    },
    {
      kind: "shared_event",
      text: "Nova and Alex watched 'Octopussy' again during a movie night at home.",
      keywords: ["Octopussy", "movie night"],
      eventAt: "2026-09-02T20:00:00Z",
      importance: 3,
    },
  ]);

  assert.equal(memories.length, 2);
});

test("separate dated events remain distinct even when a rescan window overlaps", () => {
  const memories = mergeMemories([], [
    {
      kind: "shared_event",
      text: "During the first workplace visit, Alex played two teasing songs on the jukebox for Erica.",
      keywords: ["jukebox", "songs", "workplace", "teasing"],
      sourceMessageIds: ["first-visit", "overlapping-scan"],
      eventAt: "2026-09-13T02:31:07.525Z",
      importance: 4,
    },
    {
      kind: "shared_event",
      text: "At the later bar outing, Alex played three teasing songs on the jukebox for Erica.",
      keywords: ["jukebox", "songs", "bar", "teasing"],
      sourceMessageIds: ["overlapping-scan", "later-visit"],
      eventAt: "2026-09-26T21:36:54.101Z",
      importance: 3,
    },
  ]);

  assert.equal(memories.length, 2);
});

test("nearby differently worded summaries of one episode consolidate", () => {
  const memories = mergeMemories([], [
    {
      kind: "shared_event",
      text: "Nova and Alex shared a long kiss while floating in the ocean.",
      keywords: ["ocean", "kiss"],
      eventAt: "2026-09-28T19:55:00.000Z",
      importance: 3,
    },
    {
      kind: "shared_event",
      text: "Nova and Alex embraced during an intimate kiss while floating together in warm ocean water.",
      keywords: ["ocean", "embrace", "kiss"],
      eventAt: "2026-09-28T20:20:00.000Z",
      importance: 3,
    },
  ]);

  assert.equal(memories.length, 1);
});

test("different activities from the same outing remain separate memories", () => {
  const memories = mergeMemories([], [
    {
      kind: "shared_event",
      text: "Nova and Alex explored the beach tide pools and watched a baby turtle.",
      keywords: ["beach", "tide pools", "baby turtle"],
      eventAt: "2026-09-28T19:20:00.000Z",
      importance: 3,
    },
    {
      kind: "shared_event",
      text: "Nova and Alex shared a long kiss while floating in the ocean by the beach.",
      keywords: ["beach", "ocean", "kiss"],
      eventAt: "2026-09-28T20:00:00.000Z",
      importance: 3,
    },
  ]);

  assert.equal(memories.length, 2);
});

test("a milestone remains distinct from an ordinary moment in the same episode", () => {
  const memories = mergeMemories([], [
    {
      kind: "shared_event",
      text: "Nova and Alex shared a long kiss while floating in the ocean.",
      keywords: ["ocean", "kiss"],
      eventAt: "2026-09-28T20:00:00.000Z",
      importance: 3,
    },
    {
      kind: "shared_event",
      text: "Nova and Alex exchanged vows while floating together in the ocean.",
      keywords: ["ocean", "vows", "commitment"],
      eventAt: "2026-09-28T20:30:00.000Z",
      importance: 5,
    },
  ]);

  assert.equal(memories.length, 2);
});

test("written and numeric measurement facts consolidate system-wide", () => {
  const memories = mergeMemories([], [
    {
      kind: "user_fact",
      text: "The user describes their cock as being eight inches long.",
      keywords: ["measurement", "cock", "eight inches"],
      importance: 3,
    },
    {
      kind: "user_fact",
      text: "The user has an 8 inch cock.",
      keywords: ["measurement", "cock", "8 inches"],
      importance: 3,
    },
  ]);

  assert.equal(memories.length, 1);
});

test("similar event and open-loop descriptions keep one active canonical plan", () => {
  const memories = mergeMemories([], [
    {
      kind: "shared_event",
      text: "Nagatoro mentioned a different cafe down the street that serves oversized parfaits.",
      keywords: ["parfait", "cafe"],
      importance: 2,
    },
    {
      kind: "open_loop",
      text: "Nagatoro suggested going to a new cafe with oversized parfaits.",
      keywords: ["cafe", "parfaits"],
      importance: 2,
    },
  ]);

  assert.equal(memories.length, 1);
  assert.equal(memories[0].kind, "open_loop");
  assert.match(memories[0].text, /suggested going/i);
});

test("memories involving the same people remain separate when their subjects differ", () => {
  const memories = mergeMemories([], [
    {
      kind: "promise",
      text: "Nova promised Alex they would visit the moonlight observatory.",
      keywords: ["moonlight observatory"],
      importance: 3,
    },
    {
      kind: "shared_event",
      text: "Nova and Alex baked cinnamon rolls together.",
      keywords: ["cinnamon rolls", "baking"],
      importance: 3,
    },
  ]);

  assert.equal(memories.length, 2);
});

test("recall questions do not receive unrelated high-importance memories", () => {
  const memories = mergeMemories([], [
    {
      kind: "shared_event",
      text: "Erica and Alex made a major decision together in the kitchen.",
      keywords: ["major decision", "kitchen"],
      importance: 5,
    },
    {
      kind: "shared_event",
      text: "Alex finished a difficult project at home.",
      keywords: ["project", "home"],
      importance: 4,
    },
  ]);

  const relevant = selectRelevantMemories(memories, "Do you remember what I did the first time I visited you at work?", 8);
  assert.deepEqual(relevant, []);
  assert.match(memoryRecallGuidance(relevant, "Do you remember what I did the first time I visited you at work?"), /do not remember/i);
  assert.match(memoryRecallGuidance(relevant, "Do you remember what I did the first time I visited you at work?"), /Do not guess/i);
});

test("a detail supplied in the current recall question is treated as a reminder, not prior knowledge", () => {
  const missing = memoryRecallGuidance([], "Do you remember when I wore a silver jacket to the arcade?");
  assert.match(missing, /current message supplies the answer/i);
  assert.match(missing, /rather than pretending you already knew/i);

  const known = memoryRecallGuidance([{ text: "The user wore a silver jacket to the arcade." }], "Do you remember my arcade outfit?");
  assert.match(known, /existed before this latest turn/i);
});

test("first-workplace-visit recall retrieves the specific jukebox episode", () => {
  const memories = mergeMemories([], [
    {
      kind: "shared_event",
      text: "During Alex's first visit to Erica at work at the Stray Sheep, he playfully chose AC/DC's Hard as a Rock and Kings of Leon's Sex on Fire on the jukebox to get a reaction from her.",
      keywords: ["first visit", "Erica's work", "Stray Sheep", "jukebox", "provocative songs", "Hard as a Rock", "Sex on Fire"],
      importance: 4,
    },
    {
      kind: "user_fact",
      text: "Alex once finished a long workday full of meetings.",
      keywords: ["workday", "meetings"],
      importance: 2,
    },
  ]);

  const relevant = selectRelevantMemories(memories, "Do you remember what I did the first time I visited you at work?", 8);
  assert.equal(relevant.length, 1);
  assert.match(relevant[0].text, /jukebox/i);
  assert.match(relevant[0].text, /Hard as a Rock/i);
});

test("semantic aliases recall a jukebox episode from natural paraphrasing", () => {
  const memories = mergeMemories([], [{
    kind: "shared_event",
    text: "Alex chose two provocative songs on the jukebox during Erica's work shift to tease her.",
    keywords: ["jukebox", "songs", "shift", "teasing"],
    importance: 4,
  }]);
  const relevant = selectRelevantMemories(memories, "Do you remember the music I played while you were working to get a reaction?", 4);
  assert.equal(relevant.length, 1);
  assert.match(relevant[0].text, /jukebox/i);
});

test("a recall question with no shared keywords gets a bounded semantic archive lookup", async () => {
  const memories = mergeMemories([], [
    { id: "sunrise", kind: "shared_event", text: "The user and Erica watched the sunrise from a quiet rooftop.", keywords: ["sunrise", "rooftop"], importance: 4 },
    { id: "coffee", kind: "preference", text: "The user prefers coffee without sugar.", keywords: ["coffee"], importance: 3 },
  ]);
  const sunrise = memories.find((memory) => /sunrise/i.test(memory.text));
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ memoryIds: [sunrise.id] }) } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const relevant = await relevantMemoriesForTurn({ ollamaUrl: "http://ollama.test", chatModel: "test-model" }, memories, "Do you remember our dawn together?", 8);
    assert.deepEqual(relevant.map((memory) => memory.id), [sunrise.id]);
    assert.equal(requestBody.options.num_predict, 400);
    assert.equal(requestBody.format.properties.memoryIds.maxItems, 8);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a weak lexical hit does not prevent meaning-based recall", async () => {
  const memories = mergeMemories([], [
    { id: "painting", kind: "shared_event", text: "The user showed Erica a dawn-themed painting.", keywords: ["dawn", "painting"], importance: 4 },
    { id: "sunrise", kind: "shared_event", text: "The user and Erica quietly watched the sunrise together from the roof.", keywords: ["sunrise", "rooftop"], importance: 3 },
  ]);
  const sunrise = memories.find((memory) => /sunrise/i.test(memory.text));
  const originalFetch = globalThis.fetch;
  let requested = false;
  globalThis.fetch = async () => {
    requested = true;
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ memoryIds: [sunrise.id] }) } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const relevant = await relevantMemoriesForTurn({ ollamaUrl: "http://ollama.test", chatModel: "test-model" }, memories, "Do you remember our quiet dawn together?", 8);
    assert.equal(requested, true);
    assert.deepEqual(relevant.map((memory) => memory.id), [sunrise.id]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an underspecified name question uses conversational context instead of a generic lexical hit", async () => {
  const memories = mergeMemories([], [
    { id: "art", kind: "user_fact", text: "The user has shared secret art with close friends.", keywords: ["art", "friends"], importance: 4 },
    { id: "donatello", kind: "user_fact", text: "The user has named a small turtle 'Donatello'.", keywords: ["turtle", "Donatello"], importance: 4 },
  ]);
  const donatello = memories.find((memory) => /Donatello/i.test(memory.text));
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ memoryIds: [donatello.id] }) } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const relevant = await relevantMemoriesForTurn(
      { ollamaUrl: "http://ollama.test", chatModel: "test-model" },
      memories,
      "What was his name again? Drawing a blank...",
      8,
      { contextText: "We found our little turtle friend at the tide pools." },
    );
    assert.deepEqual(relevant.map((memory) => memory.id), [donatello.id]);
    const selectorPayload = JSON.parse(requestBody.messages.at(-1).content);
    assert.match(selectorPayload.immediateContext, /turtle friend/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("first and most-recent recall use event chronology after topic matching", () => {
  const memories = mergeMemories([], [
    {
      kind: "shared_event",
      text: "On Alex's initial visit to Erica at work, he played teasing music on the jukebox.",
      keywords: ["visit", "work", "jukebox"],
      importance: 4,
      eventAt: "2026-09-01T20:00:00.000Z",
    },
    {
      kind: "shared_event",
      text: "During a later workplace visit, Alex brought Erica coffee and a pastry.",
      keywords: ["visit", "work", "coffee", "pastry"],
      importance: 3,
      eventAt: "2026-09-20T20:00:00.000Z",
    },
  ]);
  const first = selectRelevantMemories(memories, "What happened the first time I visited you at work?", 4);
  assert.equal(first.length, 1);
  assert.match(first[0].text, /jukebox/i);
  const latest = selectRelevantMemories(memories, "What happened the last time I visited you at work?", 4);
  assert.equal(latest.length, 1);
  assert.match(latest[0].text, /coffee/i);
});

test("relative-time recall can retrieve an event without a shared topic word", () => {
  const now = new Date("2026-09-26T20:00:00.000Z");
  const memories = mergeMemories([], [
    { kind: "shared_event", text: "Alex and Erica went stargazing by the lake.", keywords: ["stargazing", "lake"], importance: 3, eventAt: "2026-09-19T20:00:00.000Z" },
    { kind: "shared_event", text: "Alex and Erica baked a cake together.", keywords: ["cake", "baking"], importance: 3, eventAt: "2026-08-20T20:00:00.000Z" },
  ]);
  const relevant = selectRelevantMemories(memories, "Do you remember what happened a week ago?", 4, now);
  assert.equal(relevant.length, 1);
  assert.match(relevant[0].text, /stargazing/i);
});

test("last-week recall uses time even without shared subject words", () => {
  const now = new Date("2026-09-28T20:00:00.000Z");
  const memories = mergeMemories([], [
    { kind: "shared_event", text: "Alex and Erica visited the aquarium.", keywords: ["aquarium"], importance: 3, eventAt: "2026-09-21T20:00:00.000Z" },
    { kind: "shared_event", text: "Alex and Erica repaired a bicycle.", keywords: ["bicycle"], importance: 3, eventAt: "2026-08-02T20:00:00.000Z" },
  ]);
  const relevant = selectRelevantMemories(memories, "Do you remember what we did last week?", 4, now);
  assert.equal(relevant.length, 1);
  assert.match(relevant[0].text, /aquarium/i);
});

test("first-event recall excludes an undated lookalike when dated history exists", () => {
  const memories = mergeMemories([], [
    { kind: "shared_event", text: "Alex visited Erica at work and played songs.", keywords: ["visit", "work"], importance: 3 },
    { kind: "shared_event", text: "On the first dated workplace visit, Alex used the jukebox.", keywords: ["visit", "work", "jukebox"], importance: 3, eventAt: "2026-09-01T20:00:00.000Z" },
    { kind: "shared_event", text: "On a later workplace visit, Alex brought coffee.", keywords: ["visit", "work", "coffee"], importance: 3, eventAt: "2026-09-20T20:00:00.000Z" },
  ]);
  const relevant = selectRelevantMemories(memories, "What happened the first time I visited you at work?", 4);
  assert.equal(relevant.length, 1);
  assert.match(relevant[0].text, /jukebox/i);
});

test("first-event chronology is applied only after the strongest topic match", () => {
  const memories = mergeMemories([], [
    { kind: "shared_event", text: "Alex and Erica shared their first kiss and then visited her apartment.", keywords: ["first kiss", "visit", "apartment"], importance: 4, eventAt: "2026-09-01T20:00:00.000Z" },
    { kind: "shared_event", text: "During Alex's first visit to Erica at work, he played songs on the jukebox.", keywords: ["first visit", "work", "jukebox"], importance: 4, eventAt: "2026-09-04T20:00:00.000Z" },
    { kind: "shared_event", text: "During a later visit to Erica at work, Alex brought coffee.", keywords: ["visit", "work", "coffee"], importance: 3, eventAt: "2026-09-20T20:00:00.000Z" },
  ]);
  const relevant = selectRelevantMemories(memories, "What happened the first time I visited you at work?", 4);
  assert.equal(relevant.length, 1);
  assert.match(relevant[0].text, /jukebox/i);
});

test("a narrow recall question receives a compact memory set", () => {
  const memories = mergeMemories([], Array.from({ length: 8 }, (_, index) => ({
    kind: "shared_event",
    text: `Alex and Erica compared size detail ${index} during a different conversation.`,
    keywords: ["size", `detail ${index}`],
    importance: 3,
    eventAt: `2026-09-${String(index + 1).padStart(2, "0")}T20:00:00.000Z`,
  })));
  const relevant = selectRelevantMemories(memories, "Do you remember our measurements?", 8);
  assert.ok(relevant.length <= 4);
});

test("legacy keyword contamination cannot outrank the memory's actual text", () => {
  const memories = mergeMemories([], [
    { kind: "user_fact", text: "The user's height is 72 inches.", keywords: ["height", "measurement"], importance: 3 },
    { kind: "shared_event", text: "Alex and Erica relaxed in the foyer after work.", keywords: ["foyer", "work", "measure", "size", "comparison"], importance: 4 },
  ]);
  const relevant = selectRelevantMemories(memories, "Do you remember my measurements?", 8);
  assert.equal(relevant.length, 1);
  assert.match(relevant[0].text, /72 inches/i);
});

test("a stable fact outranks a loosely related event for a factual recall", () => {
  const memories = mergeMemories([], [
    { kind: "user_fact", text: "The user's height is 72 inches.", keywords: ["height"], importance: 3 },
    { kind: "shared_event", text: "Alex used a measuring tape while decorating the room.", keywords: ["measuring tape"], importance: 4 },
  ]);
  const relevant = selectRelevantMemories(memories, "Do you remember my measurement?", 8);
  assert.equal(relevant.length, 1);
  assert.match(relevant[0].text, /72 inches/i);
});

test("historical scans retain the surrounding episode for a durable cue in a long chat", () => {
  const messages = Array.from({ length: 320 }, (_, index) => ({
    id: `filler-${index}`,
    from: index % 2 ? "character" : "user",
    text: `Ordinary exchange ${index}.`,
    time: `2026-09-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
  }));
  messages.splice(150, 0,
    { id: "visit", from: "user", text: "[action: I let Erica work and head over to the jukebox.]", time: "2026-09-02T01:00:00.000Z" },
    { id: "reaction-one", from: "character", narration: "Erica glances over from her shift, curious about the selection.", time: "2026-09-02T01:01:00.000Z" },
    { id: "song-one", from: "user", text: "[action: I play AC/DC's Hard as a Rock on the jukebox.]", time: "2026-09-02T01:02:00.000Z" },
    { id: "reaction-two", from: "character", narration: "She recognizes the teasing choice and tries not to laugh.", time: "2026-09-02T01:03:00.000Z" },
    { id: "song-two", from: "user", text: "[action: I pick Kings of Leon's Sex on Fire next.]", time: "2026-09-02T01:04:00.000Z" },
  );

  const transcript = historicalMemoryTranscript(messages);
  assert.ok(transcript.length < messages.length);
  assert.ok(transcript.some((message) => message.id === "visit"));
  assert.ok(transcript.some((message) => message.id === "song-one"));
  assert.ok(transcript.some((message) => message.id === "song-two"));
  assert.ok(transcript.some((message) => message.id === "reaction-one" && /glances over/i.test(message.text)));
});
