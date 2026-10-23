import test from "node:test";
import assert from "node:assert/strict";
import { destinationKey, trackAchievementCandidate, sceneLaughterProposal, normalizeAchievementTracking, journeyDestinationKeys } from "../server/achievement-events.mjs";
import { evaluateAchievementShadow, reconsiderDestinationShadow, reconsiderLaughterShadow } from "../server/achievements.mjs";
import { achievementReviewBatch, mergeAchievementReviews } from "../server/achievement-review.mjs";

const turn = (id, scene) => ({ userMessageId: id, characterMessageId: `${id}-reply`, scene });
const quotes = (user, character) => [{ source: "user", quote: user }, { source: "character", quote: character }];
const event = (id, kind, subject = null, occasion = null) => ({ id, event: kind, subject, occasion });

test("visible laughter reaches independent review even without model signals", () => {
  for (const characterText of ["She laughs at your joke.", "She giggles at your teasing.", "She chuckles at the pun."]) {
    const thread = { id: "fixture", character: { id: "erica" } };
    const exchange = { ...turn("u1"), userText: "Now who's being sappy?", characterText };
    const next = { ...thread, ...evaluateAchievementShadow(thread, exchange, []) };
    const batch = achievementReviewBatch(next);
    assert.equal(batch.length, 1);
    assert.equal(batch[0].signal.event, "laughter");
    assert.equal(next.achievementShadow.verifiedTracking.laughter.length, 0);
    const approved = mergeAchievementReviews(next, batch, [{ id: batch[0].id, verdict: "supported", confidence: .99, reason: "clear_shared_event" }]);
    assert.equal(approved.achievementShadow.verifiedTracking.laughter.length, 1);
  }
});

test("incidental laughter is a candidate, never automatically verified", () => {
  const thread = { id: "fixture", character: { id: "erica" } };
  const exchange = { ...turn("u1"), userText: "I pour you a drink.", characterText: "She chuckles at a joke on television." };
  const next = { ...thread, ...evaluateAchievementShadow(thread, exchange, []) };
  const batch = achievementReviewBatch(next);
  const rejected = mergeAchievementReviews(next, batch, [{ id: batch[0].id, verdict: "rejected", confidence: .99, reason: "incidental_or_generic" }]);
  assert.equal(rejected.achievementShadow.verifiedTracking.laughter.length, 0);
  assert.equal(sceneLaughterProposal({ userText: "I make a joke.", characterText: "She smiles at you." }), null);
});

test("recent laughter repair preserves other signals and is idempotent", () => {
  const thread = { id: "fixture", character: { id: "erica" }, messages: [
    { id: "u1", from: "user", text: "Now who's being sappy?" },
    { id: "u1-reply", from: "character", narration: "She laughs at your teasing.", time: "2026-10-03T12:00:00Z" }],
    achievementShadow: { revision: 1, turns: [{ ...turn("u1"), characterId: "erica", signals: [{ id: "heartfelt", reason: "needs-semantic-review" }] }] } };
  const repaired = { ...thread, ...reconsiderLaughterShadow(thread) };
  assert.equal(repaired.achievementShadow.turns[0].signals[0].id, "heartfelt");
  assert.equal(achievementReviewBatch(repaired).length, 1);
  assert.deepEqual(repaired.messages, thread.messages);
  assert.deepEqual(reconsiderLaughterShadow(repaired), { achievementShadow: repaired.achievementShadow });
});

test("room labels group under their enclosing destination", () => {
  assert.equal(destinationKey("The rental's bedroom"), destinationKey("our rental"));
  assert.equal(destinationKey("kitchen at the rental"), "rental");
  assert.notEqual(destinationKey("Moonlight Cafe"), destinationKey("Starlight Cafe"));
});

test("visits require final shared presence and repeated destinations do not advance", () => {
  const proposal = event("new-horizons", "arrival", "Moonlight Cafe");
  const evidence = quotes("We arrived at Moonlight Cafe.", "I step inside with you.");
  const together = { presence: "together", location: "Moonlight Cafe" };
  const first = trackAchievementCandidate({}, proposal, evidence, turn("u1", together));
  assert.equal(first.state.destinations.length, 1);
  const again = trackAchievementCandidate(first.state, proposal, evidence, turn("u2", together));
  assert.equal(again.reason, "repeat-destination");
  assert.equal(again.state.destinations.length, 1);
  assert.equal(trackAchievementCandidate({}, proposal, evidence, turn("u3", { ...together, presence: "apart" })).reason, "not-confirmed-shared-final-destination");
});

test("legacy rooms and aliases cannot consume the ten-destination evidence capacity", () => {
  const destinations = Array.from({ length: 10 }, (_, i) => ({ key: `legacy-${i}`, userMessageId: `old-${i}` }));
  const state = { destinations };
  const added = trackAchievementCandidate(state, event("new-horizons", "arrival", "Moonlight Cafe"),
    quotes("We arrived at Moonlight Cafe.", "I step inside with you."), turn("new", { presence: "together", location: "Moonlight Cafe" }));
  assert.equal(added.state.destinations.length, 11);
  assert.equal(normalizeAchievementTracking(added.state).destinations.length, 11);
  assert.deepEqual(added.state.destinations.slice(0, 10), destinations);
  assert.equal(state.destinations.length, 10);
  for (const subject of ["bedroom", "living room", "guest room", "sand to the shoreline"]) {
    assert.equal(trackAchievementCandidate(state, event("new-horizons", "arrival", subject),
      quotes("We step inside together.", "I join you in this place."), turn(subject, { presence: "together", location: subject })).reason, "ambiguous-destination");
  }
});

test("destination counting preserves evidence and does not merge distinct named venues", () => {
  const destinations = ["our beach rental", "rental", "bedroom", "the Moonlight Cafe", "Starlight Cafe"].map(key => ({ key }));
  assert.deepEqual([...journeyDestinationKeys(destinations)], ["beach rental", "moonlight cafe", "starlight cafe"]);
  assert.equal(destinations.length, 5);
});

test("laughter needs both a user contribution and a clear character reaction", () => {
  const proposal = event("shared-laughter", "laughter");
  assert.equal(trackAchievementCandidate({}, proposal, quotes("I make a joke about the menu.", "She takes a sip of coffee."), turn("u1")).reason, "missing-user-contribution-or-laughter");
  const first = trackAchievementCandidate({}, proposal, quotes("I make a joke about the menu.", "She laughs at your joke."), turn("u1"));
  assert.equal(first.state.laughter.length, 1);
  const again = trackAchievementCandidate(first.state, proposal, quotes("I make a joke about the menu.", "She laughs at your joke."), turn("u1"));
  assert.equal(again.state.laughter.length, 1);
});

test("repair needs an earlier matching disagreement and reciprocal evidence", () => {
  const evidence = quotes("I am sorry about our argument.", "I understand, and accept your apology.");
  const repair = event("worked-through-it", "repair", "interrupting");
  assert.equal(trackAchievementCandidate({}, repair, evidence, turn("u2")).reason, "no-prior-disagreement");
  const opened = trackAchievementCandidate({}, event("worked-through-it", "disagreement", "interrupting"), quotes("I disagree about interrupting.", "I am upset about that."), turn("u1"));
  const fixed = trackAchievementCandidate(opened.state, repair, evidence, turn("u2"));
  assert.equal(fixed.state.disagreements[0].repaired.userMessageId, "u2");
  assert.equal(opened.state.disagreements[0].repaired, null);
  assert.equal(trackAchievementCandidate(opened.state, { ...repair, subject: "other topic" }, evidence, turn("u2")).reason, "no-prior-disagreement");
});

test("traditions need an agreement and two explicitly distinct story occasions", () => {
  const agreement = event("our-tradition", "tradition_agreement", "morning coffee");
  const opened = trackAchievementCandidate({}, agreement, quotes("Let's make morning coffee our tradition.", "Yes, I love that idea."), turn("u1"));
  const occurrence = event("our-tradition", "tradition_occurrence", "morning coffee", "the next morning");
  const evidence = quotes("The next morning, I brew our coffee.", "I join you for our morning coffee.");
  const first = trackAchievementCandidate(opened.state, occurrence, evidence, turn("u2"));
  const repeat = trackAchievementCandidate(first.state, occurrence, evidence, turn("u3"));
  assert.equal(repeat.reason, "repeat-tradition-occasion");
  assert.equal(repeat.state.traditions[0].occurrences.length, 1);
  const second = trackAchievementCandidate(first.state, { ...occurrence, occasion: "two mornings later" }, quotes("Two mornings later, I brew our coffee.", "I join you for coffee again."), turn("u4"));
  assert.equal(second.state.traditions[0].occurrences.length, 2);
  assert.equal(trackAchievementCandidate(opened.state, { ...occurrence, occasion: null }, evidence, turn("u5")).reason, "missing-grounded-distinct-occasion");
});

test("ordinary compliments and negated actions remain uncounted", () => {
  assert.equal(trackAchievementCandidate({}, event("heartfelt", "feelings"), quotes("Your dress looks nice.", "Thank you for saying that."), turn("u1")).reason, "missing-meaningful-user-feelings");
  assert.equal(trackAchievementCandidate({}, event("shared-laughter", "laughter"), quotes("I tell a joke about dinner.", "She didn't laugh at your joke."), turn("u2")).reason, "negated-or-ambiguous");
});

test("shadow chains persist beyond the diagnostic sample without granting rewards", () => {
  let thread = { id: "host", character: { id: "erica" } };
  const userText = "I love the trust we have built.";
  const characterText = "Your friendship matters to me.";
  thread = { ...thread, ...evaluateAchievementShadow(thread, { ...turn("first"), userText, characterText }, [{ ...event("heartfelt", "feelings"), actor: "shared", phase: "completed", evidence: quotes(userText, characterText) }]) };
  for (let i = 0; i < 110; i++) thread = { ...thread, ...evaluateAchievementShadow(thread, turn(`turn-${i}`), []) };
  assert.equal(thread.achievementShadow.tracking.feelings.userMessageId, "first");
  assert.equal(thread.achievementShadow.turns.length, 100);
  assert.equal(thread.achievementPoints, undefined);
  assert.equal(thread.achievements, undefined);
});

test("a dining scene becomes reviewable without arrival words or repeated venue name", () => {
  const thread = { id: "fixture", character: { id: "hana" } };
  const exchange = { ...turn("u1", { presence: "together", location: "Moonlight Bistro" }),
    userText: "I take the menu and ask what looks good.", characterText: "She settles into the booth beside you and studies her menu." };
  const next = { ...thread, ...evaluateAchievementShadow(thread, exchange, [{ id: "new-horizons", event: "arrival", actor: "shared", phase: "completed", subject: "a new restaurant", evidence: quotes("invented quote", "another invented quote") }]) };
  const batch = achievementReviewBatch(next);
  assert.equal(batch.length, 1);
  assert.equal(batch[0].signal.subject, "Moonlight Bistro");
  assert.deepEqual(batch[0].signal.evidence, quotes(exchange.userText, exchange.characterText));
  assert.deepEqual(batch[0].priorEvidence, []);
  assert.equal(next.achievementShadow.verifiedTracking.destinations.length, 0);
  const verified = mergeAchievementReviews(next, batch, [{ id: batch[0].id, verdict: "supported", confidence: 0.99, reason: "clear_shared_event" }]);
  assert.equal(verified.achievementShadow.verifiedTracking.destinations.length, 1);
  const repeated = evaluateAchievementShadow({ ...next, ...verified }, { ...exchange, userMessageId: "u2", characterMessageId: "u2-reply" }, []);
  assert.equal(repeated.achievementShadow.turns.at(-1).signals.length, 0);
});

test("uncertain earlier candidates do not permanently block a later completed visit", () => {
  let thread = { id: "fixture", character: { id: "hana" } };
  const exchange = { ...turn("plan", { presence: "together", location: "Moonlight Bistro" }), userText: "Maybe we can try that restaurant tomorrow.", characterText: "Yes, we could order dinner there tomorrow." };
  thread = { ...thread, ...evaluateAchievementShadow(thread, exchange, []) };
  const batch = achievementReviewBatch(thread);
  thread = { ...thread, ...mergeAchievementReviews(thread, batch, [{ id: batch[0].id, verdict: "rejected", confidence: 0.99, reason: "planned_or_negated" }]) };
  assert.equal(thread.achievementShadow.verifiedTracking.destinations.length, 0);
  thread = { ...thread, ...evaluateAchievementShadow(thread, { ...exchange, userMessageId: "actual", characterMessageId: "actual-reply", userText: "I open the menu while you sit beside me.", characterText: "She slides into the booth and orders her meal." }, []) };
  assert.equal(achievementReviewBatch(thread).length, 1);
});

test("booths and dining rooms belong to their venue, not additional destinations", () => {
  assert.equal(destinationKey("booth at Moonlight Bistro"), destinationKey("Moonlight Bistro"));
  assert.equal(destinationKey("Moonlight Bistro's private dining room"), destinationKey("Moonlight Bistro"));
  assert.equal(destinationKey("table at Moonlight Bistro"), destinationKey("Moonlight Bistro"));
});

test("destination repair is idempotent, preserves other signals, and never changes dialogue", () => {
  const context = { userText: "I take the menu and settle into our booth.", characterText: "She takes a seat beside you and orders dinner.", complete: true, scene: { presence: "together", location: "Moonlight Bistro" } };
  const original = { id: "fixture", character: { id: "hana" }, messages: [{ text: "Keep this dialogue untouched." }], achievementShadow: { revision: 1, turns: [{ userMessageId: "old", characterMessageId: "old-reply", characterId: "hana", recordedAt: new Date().toISOString(), context,
    signals: [{ id: "new-horizons", reason: "unsupported-quotation", event: "arrival", evidence: [] }, { id: "heartfelt", reason: "missing-meaningful-user-feelings" }] }] } };
  const snapshot = JSON.stringify(original);
  const repaired = reconsiderDestinationShadow(original);
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(repaired.achievementShadow.turns[0].signals.find(item => item.id === "new-horizons").reason, "provisional-evidence-chain");
  assert.equal(repaired.achievementShadow.turns[0].signals.find(item => item.id === "heartfelt").reason, "missing-meaningful-user-feelings");
  assert.deepEqual(reconsiderDestinationShadow({ ...original, ...repaired }), repaired);
});
