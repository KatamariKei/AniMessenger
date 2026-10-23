import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { dataDir } from "./config.mjs";
import { achievementDefinitions, normalizeAchievementShadow } from "./achievements.mjs";
import tiers from "../shared/relationship-tiers.json" with { type: "json" };
import { normalizeRelationshipProgress } from "./relationship.mjs";
import { journeyDestinationKeys, sharedActivityKey } from "./achievement-events.mjs";

export const ACHIEVEMENT_AWARDS_ENABLED = true;
const queues = new Map();
const retiredDefinitions = [{ id: "worked-through-it", title: "Worked through it" }, { id: "our-tradition", title: "Our tradition" }];
const awardDefinition = id => achievementDefinitions.find(item => item.id === id) || retiredDefinitions.find(item => item.id === id);
const proof = record => Boolean(record && typeof record.userMessageId === "string" && record.userMessageId
  && typeof record.characterMessageId === "string" && record.characterMessageId
  && Array.isArray(record.evidence) && record.evidence.some(item => item.source === "user" && item.quote?.length >= 8));

export function verifiedAchievementProgress(thread, discoveryIds = []) {
  const state = normalizeAchievementShadow(thread).achievementShadow.verifiedTracking;
  const unique = records => new Set(records.filter(proof).map(item => item.userMessageId)).size;
  return {
    "shared-laughter": Math.min(5, unique(state.laughter)),
    "new-horizons": Math.min(10, unique(state.destinations), journeyDestinationKeys(state.destinations.filter(proof)).size),
    "heartfelt": proof(state.feelings) ? 1 : 0,
    "time-well-spent": Math.min(3, new Set(state.activities.filter(proof).map(item => sharedActivityKey(item.key)).filter(Boolean)).size),
    "getting-to-know-you": Math.min(3, new Set(discoveryIds.filter(id => typeof id === "string" && id)).size),
  };
}

function awardId(characterId, achievementId) {
  // Exclude chat IDs and definition versions: recreating a chat or rewording criteria
  // must not create another lifetime award for the same catalogue character.
  return createHash("sha256").update(`${characterId}\0${achievementId}`).digest("hex");
}

export function createAchievementLedger(file = path.join(dataDir, "achievement-awards.json")) {
  const filePath = path.resolve(file);
  async function read() {
    let ledger;
    try { ledger = JSON.parse(await fs.readFile(filePath, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return { version: 1, awards: [] }; throw new Error("The local achievement ledger could not be read. Existing awards were not changed."); }
    if (ledger.version !== 1 || !Array.isArray(ledger.awards) || ledger.awards.some(item => !item?.id || !item.characterId
      || !awardDefinition(item.achievementId)
      || item.id !== awardId(item.characterId, item.achievementId)
      || item.points !== 10 || !Number.isInteger(item.definitionVersion) || !Number.isFinite(Date.parse(item.earnedAt)))) throw new Error("The local achievement ledger needs recovery. Existing awards were not changed.");
    if (new Set(ledger.awards.map(item => item.id)).size !== ledger.awards.length) throw new Error("The local achievement ledger contains duplicate awards. Existing awards were not changed.");
    return ledger;
  }
  async function awardVerified(thread, { enabled = ACHIEVEMENT_AWARDS_ENABLED, now = new Date(), notify = true, discoveryIds = [] } = {}) {
    const prior = queues.get(filePath) || Promise.resolve();
    const work = prior.catch(() => {}).then(async () => {
      const ledger = await read();
      if (!enabled || !thread.character?.id) return { ledger, newAwards: [] };
      const progress = verifiedAchievementProgress(thread, discoveryIds);
      const newAwards = achievementDefinitions.filter(definition => progress[definition.id] >= definition.target
        && !ledger.awards.some(item => item.id === awardId(thread.character.id, definition.id)))
        .map(definition => ({ id: awardId(thread.character.id, definition.id), characterId: thread.character.id,
          characterName: String(thread.character.name || "Character"),
          notify,
          achievementId: definition.id, definitionVersion: definition.version, points: definition.points, earnedAt: now.toISOString() }));
      if (!newAwards.length) return { ledger, newAwards };
      const next = { version: 1, awards: [...ledger.awards, ...newAwards] };
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.${randomUUID()}.tmp`;
      try { await fs.writeFile(temporary, JSON.stringify(next, null, 2) + "\n", { flag: "wx" }); await fs.rename(temporary, filePath); }
      finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
      return { ledger: next, newAwards };
    });
    queues.set(filePath, work);
    try { return await work; } finally { if (queues.get(filePath) === work) queues.delete(filePath); }
  }
  async function reconcileVerified(threads, discoveryIdsForThread = async () => []) {
    for (const thread of threads) await awardVerified(thread, { notify: false, discoveryIds: await discoveryIdsForThread(thread) });
    return read();
  }
  async function acknowledge(characterId, ids) {
    const prior = queues.get(filePath) || Promise.resolve();
    const work = prior.catch(() => {}).then(async () => {
      const ledger = await read();
      const matching = ledger.awards.filter(item => item.characterId === characterId && ids.includes(item.id) && !item.acknowledged);
      if (!matching.length) return ledger;
      const next = { ...ledger, awards: ledger.awards.map(item => matching.includes(item) ? { ...item, acknowledged: true } : item) };
      const temporary = `${filePath}.${randomUUID()}.tmp`;
      try { await fs.writeFile(temporary, JSON.stringify(next, null, 2) + "\n", { flag: "wx" }); await fs.rename(temporary, filePath); }
      finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
      return next;
    });
    queues.set(filePath, work);
    try { return await work; } finally { if (queues.get(filePath) === work) queues.delete(filePath); }
  }
  return { read, awardVerified, reconcileVerified, acknowledge };
}

export function pendingAchievementUnlocks(ledger, characterId) {
  return ledger.awards.filter(item => item.characterId === characterId && item.notify === true && !item.acknowledged)
    .map(item => ({ id: item.id, title: awardDefinition(item.achievementId).title, points: item.points }));
}

export function publicAchievementAccount(ledger) {
  return {
    points: ledger.awards.reduce((sum, item) => sum + item.points, 0),
    earnedCount: ledger.awards.length,
    achievements: ledger.awards.map(item => ({
      title: awardDefinition(item.achievementId).title,
      characterName: item.characterName || "Character", points: item.points, earnedAt: item.earnedAt,
    })).sort((a, b) => b.earnedAt.localeCompare(a.earnedAt)),
  };
}

export function publicBondMilestones(thread) {
  const progress = normalizeRelationshipProgress(thread);
  const recorded = progress.relationshipMilestones;
  // Reconstruct reached tiers for legacy chats in the public view only. These
  // are not new earned events: no invented chronology, rewards, or popups.
  const milestones = tiers.flatMap(tier => {
    const event = recorded.find(item => item.id === `${thread.id}:bond:${tier.threshold}`
      || item.label?.toLowerCase() === tier.label.toLowerCase());
    if (tier.threshold > progress.progressionPeak && !event) return [];
    return [{ id: event?.id || `${thread.id}:bond:${tier.threshold}`, label: tier.label,
      earnedAt: event?.earnedAt || null, color: tier.color }];
  });
  const secret = recorded.find(item => item.kind === "soulbound");
  if (progress.soulboundEarned) milestones.push({ id: secret?.id || `${thread.id}:bond:200`,
    label: "Soulbound", earnedAt: secret?.earnedAt || null, color: "#72dcd0" });
  return milestones;
}

export function publicCharacterJourney(thread, ledger, enabled = ACHIEVEMENT_AWARDS_ENABLED, discoveryIds = []) {
  const awards = ledger.awards.filter(item => item.characterId === thread.character?.id);
  const progress = verifiedAchievementProgress(thread, discoveryIds);
  return {
    mode: enabled ? "active" : "preview",
    accountPoints: ledger.awards.reduce((sum, item) => sum + item.points, 0),
    characterPoints: awards.reduce((sum, item) => sum + item.points, 0),
    achievements: achievementDefinitions.map(definition => {
      const earned = awards.find(item => item.achievementId === definition.id);
      return { ...definition, earned: Boolean(earned), earnedAt: earned?.earnedAt || null,
        progress: earned ? definition.target : progress[definition.id] };
    }),
    milestones: publicBondMilestones(thread),
  };
}
