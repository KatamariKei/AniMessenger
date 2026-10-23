import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ACHIEVEMENT_AWARDS_ENABLED, createAchievementLedger, pendingAchievementUnlocks, publicAchievementAccount, publicBondMilestones, publicCharacterJourney, verifiedAchievementProgress } from "../server/achievement-ledger.mjs";

const record = id => ({ userMessageId: id, characterMessageId: `${id}-reply`, evidence: [{ source: "user", quote: "An evidenced user contribution." }, { source: "character", quote: "An evidenced character response." }] });

test("legacy total bonds display all ordinary milestones without dates or new events", () => {
  const legacy = { id: "erica", relationship: 100, bondScore: 114, progressionPeak: 114, relationshipMilestones: [] };
  const before = structuredClone(legacy);
  const milestones = publicBondMilestones(legacy);
  assert.equal(milestones.length, 10);
  assert.equal(milestones[0].label, "New acquaintance");
  assert.equal(milestones.at(-1).label, "Total bond");
  assert.ok(milestones.every(item => item.earnedAt === null && item.color));
  assert.ok(!milestones.some(item => item.label === "Soulbound"));
  assert.deepEqual(legacy, before);
  assert.deepEqual(publicBondMilestones(legacy), milestones);
});

test("backfilled milestones preserve real dates and highest reached tiers after trust loss", () => {
  const event = { id: "chat:bond:80", label: "Trusted confidant", earnedAt: "2026-10-01T12:00:00.000Z" };
  const milestones = publicBondMilestones({ id: "chat", bondScore: 45, progressionPeak: 80, relationshipMilestones: [event] });
  assert.equal(milestones.length, 8);
  assert.deepEqual(milestones.at(-1), { ...event, color: "#ff6657" });
  assert.equal(milestones.filter(item => item.label === event.label).length, 1);
  assert.equal(publicBondMilestones({ id: "new", relationship: 8 }).length, 1);
});

test("ordinary backfill cannot invent a secret unlock, but an earned secret remains visible", () => {
  assert.equal(publicBondMilestones({ id: "chat", relationship: 100, progressionPeak: 200 }).length, 10);
  const secret = { id: "chat:bond:200", kind: "soulbound", label: "Soulbound", earnedAt: "2026-10-02T12:00:00.000Z" };
  const milestones = publicBondMilestones({ id: "chat", bondScore: 198, progressionPeak: 200, relationshipMilestones: [secret] });
  assert.equal(milestones.length, 11);
  assert.deepEqual(milestones.at(-1), { id: secret.id, label: "Soulbound", earnedAt: secret.earnedAt, color: "#72dcd0" });
});
const thread = (characterId = "catalogue-erica", chatId = "original") => ({ id: chatId, character: { id: characterId }, achievementShadow: { verifiedTracking: {
  laughter: Array.from({ length: 5 }, (_, index) => record(`laugh-${index}`)),
  destinations: Array.from({ length: 10 }, (_, index) => ({ key: `venue-${index}`, ...record(`visit-${index}`) })),
  feelings: record("feelings"),
  activities: ["watching", "cooking", "games"].map((key, i) => ({ key, ...record(`activity-${i}`) })),
  disagreements: [{ topic: "interrupting", opened: record("disagree"), repaired: record("repair") }],
  traditions: [{ topic: "coffee", agreed: record("agreement"), occurrences: [{ occasion: "first morning", ...record("first") }, { occasion: "second morning", ...record("second") }] }],
} } });

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-achievement-ledger-"));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { file: path.join(directory, "awards.json"), ledger: createAchievementLedger(path.join(directory, "awards.json")) };
}

test("awards are active by default while an explicit preview cannot write awards", async t => {
  assert.equal(ACHIEVEMENT_AWARDS_ENABLED, true);
  const { file, ledger } = await fixture(t);
  const result = await ledger.awardVerified(thread(), { enabled: false });
  assert.deepEqual(result.newAwards, []);
  await assert.rejects(fs.access(file));
});

test("only verified evidence can meet targets; shadow proposals alone cannot", () => {
  const progress = verifiedAchievementProgress(thread());
  assert.deepEqual(progress, { "shared-laughter": 5, "new-horizons": 10, heartfelt: 1, "time-well-spent": 3, "getting-to-know-you": 0 });
  assert.ok(Object.values(verifiedAchievementProgress({ achievementShadow: { tracking: thread().achievementShadow.verifiedTracking } })).every(value => value === 0));
  const repeated = thread();
  repeated.achievementShadow.verifiedTracking.laughter = Array(5).fill(record("same"));
  repeated.achievementShadow.verifiedTracking.destinations = Array.from({ length: 10 }, (_, i) => ({ key: `venue-${i}`, ...record("same") }));
  assert.equal(verifiedAchievementProgress(repeated)["shared-laughter"], 1);
  assert.equal(verifiedAchievementProgress(repeated)["new-horizons"], 1);
});

test("activation backfills only verified targets and the lifetime account survives chat removal", async t => {
  const { file, ledger } = await fixture(t);
  const confirmed = thread();
  confirmed.character.name = "Fixture character";
  const provisional = { id: "pending", character: { id: "pending-character", name: "Pending" },
    achievementShadow: { tracking: confirmed.achievementShadow.verifiedTracking } };
  const before = structuredClone(confirmed);
  await ledger.reconcileVerified([confirmed, thread("catalogue-erica", "recreated"), provisional]);
  assert.deepEqual(confirmed, before);
  const restarted = createAchievementLedger(file);
  const account = publicAchievementAccount(await restarted.reconcileVerified([]));
  assert.equal(account.points, 40);
  assert.equal(account.earnedCount, 4);
  assert.ok(account.achievements.every(item => item.characterName === "Fixture character"));
  assert.doesNotMatch(JSON.stringify(account), /quote|MessageId|catalogue-erica|verifiedTracking/);
});

test("concurrent retries award once and a restarted ledger retains points", async t => {
  const { file, ledger } = await fixture(t);
  const results = await Promise.all(Array.from({ length: 5 }, () => ledger.awardVerified(thread(), { enabled: true })));
  assert.equal(results.reduce((sum, result) => sum + result.newAwards.length, 0), 4);
  const restarted = await createAchievementLedger(file).read();
  assert.equal(restarted.awards.length, 4);
  assert.equal(restarted.awards.reduce((sum, item) => sum + item.points, 0), 40);
});

test("new completions notify once, acknowledgements survive restart, and backfill stays quiet", async t => {
  const { file, ledger } = await fixture(t);
  const backfill = await ledger.reconcileVerified([thread("backfilled")]);
  assert.deepEqual(pendingAchievementUnlocks(backfill, "backfilled"), []);
  const live = await ledger.awardVerified(thread("live"));
  const pending = pendingAchievementUnlocks(live.ledger, "live");
  assert.equal(pending.length, 4);
  assert.equal(pending.reduce((sum, item) => sum + item.points, 0), 40);
  assert.deepEqual(pendingAchievementUnlocks(live.ledger, "unrelated"), []);
  assert.doesNotMatch(JSON.stringify(pending), /quote|MessageId|verifiedTracking/);
  await ledger.acknowledge("unrelated", pending.map(item => item.id));
  assert.equal(pendingAchievementUnlocks(await ledger.read(), "live").length, 4);
  await Promise.all(pending.map(item => ledger.acknowledge("live", [item.id])));
  const restarted = createAchievementLedger(file);
  assert.deepEqual(pendingAchievementUnlocks(await restarted.read(), "live"), []);
  await restarted.awardVerified(thread("live", "recreated"));
  assert.deepEqual(pendingAchievementUnlocks(await restarted.read(), "live"), []);
  assert.equal(publicAchievementAccount(await restarted.read()).points, 80);
});

test("chat recreation does not re-award but a different character earns independently", async t => {
  const { ledger } = await fixture(t);
  await ledger.awardVerified(thread(), { enabled: true });
  const recreated = await ledger.awardVerified(thread("catalogue-erica", "new-chat"), { enabled: true });
  assert.equal(recreated.newAwards.length, 0);
  const other = await ledger.awardVerified(thread("catalogue-catherine"), { enabled: true });
  assert.equal(other.newAwards.length, 4);
  assert.equal(other.ledger.awards.length, 8);
});

test("a corrupt ledger is not silently reset or overwritten", async t => {
  const { file, ledger } = await fixture(t);
  await fs.writeFile(file, "broken fixture");
  await assert.rejects(ledger.awardVerified(thread(), { enabled: true }), /not changed/);
  assert.equal(await fs.readFile(file, "utf8"), "broken fixture");
});

test("three confirmed discoveries award once, including mixed confirmation origins supplied by the server", async t => {
  const { ledger } = await fixture(t);
  const sample = { id: "chat", character: { id: "character", name: "Fixture" } };
  assert.equal(verifiedAchievementProgress(sample, ["one", "one", "two"])["getting-to-know-you"], 2);
  assert.equal((await ledger.awardVerified(sample, { discoveryIds: ["one", "two"] })).newAwards.length, 0);
  const earned = await ledger.awardVerified(sample, { discoveryIds: ["one", "two", "three"] });
  assert.equal(earned.newAwards[0].achievementId, "getting-to-know-you");
  assert.equal(earned.newAwards[0].points, 10);
  assert.equal((await ledger.awardVerified(sample, { discoveryIds: ["one", "two", "three"] })).newAwards.length, 0);
});

test("public Journey shows honest preview state and excludes all source evidence", async t => {
  const { ledger } = await fixture(t);
  const empty = publicCharacterJourney(thread(), await ledger.read());
  assert.equal(empty.mode, "active");
  assert.ok(empty.achievements.filter(item => item.id !== "getting-to-know-you").every(item => item.progress === item.target && !item.earned));
  const earned = await ledger.awardVerified(thread(), { enabled: true });
  const journey = publicCharacterJourney(thread(), earned.ledger);
  assert.equal(journey.accountPoints, 40);
  assert.equal(journey.characterPoints, 40);
  assert.ok(journey.achievements.filter(item => item.id !== "getting-to-know-you").every(item => item.earned));
  assert.doesNotMatch(JSON.stringify(journey), /userMessageId|characterMessageId|quote|verifiedTracking|bondScore|catalogue-erica/);
});

test("Journey destination progress excludes bare rooms, route fragments and unambiguous generic aliases", () => {
  const sample = thread();
  sample.achievementShadow.verifiedTracking.destinations = ["beach rental", "rental", "living room", "bedroom", "sand to the shoreline", "botanical garden", "the botanical garden"].map((key, index) => ({ key, ...record(`place-${index}`) }));
  assert.equal(verifiedAchievementProgress(sample)["new-horizons"], 2);
  assert.equal(sample.achievementShadow.verifiedTracking.destinations.length, 7);
});
