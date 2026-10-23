import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./config.mjs";
import { researchCacheFingerprint } from "./research-cache.mjs";
import { isDiscoveryClue, safeClueUpdates } from "./discovery-clues.mjs";

export function revelationIdentity(character) { return researchCacheFingerprint(character); }
const bounded = (value, maximum) => typeof value === "string" && value.trim() && value.length <= maximum ? value.trim() : "";

export const revelationDraftSchema = { type: "object", additionalProperties: false, properties: {
  revelations: { type: "array", maxItems: 9, items: { type: "object", additionalProperties: false, properties: {
    title: { type: "string", maxLength: 80 }, truth: { type: "string", maxLength: 500 },
    awareness: { type: "string", enum: ["character_knows", "character_unaware"] },
    scope: { type: "string", enum: ["selected_continuity", "uncertain"] },
    clue: { type: "string", maxLength: 200 },
    paths: { type: "array", minItems: 2, maxItems: 3, items: { type: "string", maxLength: 180 } },
    directQuestion: { type: "string", maxLength: 180 },
    revealCondition: { type: "string", maxLength: 240 },
    minimumTrust: { type: "integer", minimum: 0, maximum: 100 },
    sources: { type: "array", minItems: 1, maxItems: 3, items: { type: "object", additionalProperties: false,
      properties: { sourceId: { type: "string" }, quote: { type: "string", minLength: 12, maxLength: 360 } }, required: ["sourceId", "quote"] } },
  }, required: ["title", "truth", "awareness", "scope", "clue", "paths", "directQuestion", "revealCondition", "minimumTrust", "sources"] } },
}, required: ["revelations"] };

export function validateRevelationDraft(character, draft, passages, diagnostics = {}) {
  diagnostics.rejections = {};
  const reject = reason => { diagnostics.rejections[reason] = (diagnostics.rejections[reason] || 0) + 1; };
  const seen = new Set();
  const definitions = [];
  for (const item of (Array.isArray(draft?.revelations) ? draft.revelations : []).slice(0, 9)) {
    const title = bounded(item.title, 80), truth = bounded(item.truth, 500), clue = bounded(item.clue, 200);
    const paths = Array.isArray(item.paths) ? [...new Set(item.paths.map(value => bounded(value, 180)).filter(Boolean))] : [];
    if (clue && !isDiscoveryClue(clue)) { reject("clue-style"); continue; }
    if (!title || !truth || !clue || paths.length < 2 || !bounded(item.directQuestion, 180)
      || !bounded(item.revealCondition, 240) || item.scope !== "selected_continuity"
      || item.awareness !== "character_knows" || !Number.isInteger(item.minimumTrust) || item.minimumTrust < 0 || item.minimumTrust > 100) { reject(item.awareness === "character_unaware" ? "character-unaware" : item.scope !== "selected_continuity" ? "continuity" : "invalid-structure"); continue; }
    // Unaware truths need a separate recovery/self-knowledge contract before rollout.
    const sources = Array.isArray(item.sources) ? item.sources.slice(0, 3) : [];
    if (!sources.length || sources.some(source => {
      const passage = passages.find(value => value.id === source.sourceId);
      return !passage || typeof source.quote !== "string" || source.quote.trim().length < 12
        || source.quote.length > 360 || !String(passage.text || "").includes(source.quote);
    })) { reject("unsupported-quotation"); continue; }
    const normalized = truth.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (seen.has(normalized) || clue.toLowerCase().includes(truth.toLowerCase())) { reject(seen.has(normalized) ? "duplicate" : "spoiling-clue"); continue; }
    seen.add(normalized);
    const id = createHash("sha256").update(`${revelationIdentity(character)}\0${normalized}`).digest("hex").slice(0, 24);
    definitions.push({ id, version: 1, title, truth, clue, paths, directQuestion: item.directQuestion,
      revealCondition: item.revealCondition, minimumTrust: item.minimumTrust, awareness: item.awareness,
      continuity: { characterId: character.id, series: character.series, fingerprint: revelationIdentity(character) },
      sources: sources.map(source => { const passage = passages.find(value => value.id === source.sourceId); return { ...source, url: passage.url || null }; }),
    });
  }
  return definitions;
}

export function revelationReviewSchema(definitions) {
  return { type: "object", additionalProperties: false, properties: { approvedIds: { type: "array", maxItems: 3,
    items: { type: "string", enum: definitions.map(item => item.id) } } }, required: ["approvedIds"] };
}

export function publicRevelationPreparation(state) {
  const status = ["queued", "preparing", "ready", "limited", "failed"].includes(state?.status) ? state.status : "unprepared";
  return { status, discoveryEnabled: false, canResearchMore: (state?.definitions?.length || 0) < 3 };
}

export function appendRevelationDefinitions(existing = [], incoming = []) {
  const result = [...existing];
  const normalize = value => String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  for (const definition of incoming) {
    if (result.length >= 3) break;
    if (!definition?.id || !definition.truth || result.some(item => item.id === definition.id || normalize(item.truth) === normalize(definition.truth))) continue;
    result.push(definition);
  }
  return result;
}

export function createRevelationStore(directory = path.join(dataDir, "revelations")) {
  const root = path.resolve(directory);
  const queues = new Map();
  const file = character => path.join(root, revelationIdentity(character) + ".json");
  async function load(character) {
    try {
      const state = JSON.parse(await fs.readFile(file(character), "utf8"));
      if (state.version !== 1 || state.fingerprint !== revelationIdentity(character) || !Array.isArray(state.definitions)) throw new Error("Invalid revelation state");
      return state;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw new Error("The local discoveries could not be read. Existing definitions were not changed.");
    }
  }
  async function save(character, patch, { enrich = false, historyThreadId, clueUpdates } = {}) {
    const key = revelationIdentity(character);
    const prior = queues.get(key) || Promise.resolve();
    const work = prior.catch(() => {}).then(async () => {
      const current = await load(character);
      // Once prepared, definitions and IDs are immutable until an explicit reset exists.
      if (current?.status === "ready" && !enrich && !historyThreadId && !clueUpdates) return current;
      const next = { version: 1, fingerprint: key, definitions: [], ...current, ...patch, updatedAt: new Date().toISOString() };
      if (historyThreadId) {
        const priorHistory = current?.historyReviews?.[historyThreadId] || {};
        const discoveries = [...(priorHistory.discoveries || [])];
        for (const item of patch.historyReview?.discoveries || []) {
          if (current?.definitions.some(definition => definition.id === item.discoveryId) && !discoveries.some(old => old.discoveryId === item.discoveryId)) discoveries.push(item);
        }
        next.definitions = current?.definitions || [];
        next.historyReviews = { ...current?.historyReviews, [historyThreadId]: { ...priorHistory, ...patch.historyReview, discoveries } };
        next.historyReviews[historyThreadId].artwork = { ...priorHistory.artwork };
        for (const [id, artwork] of Object.entries(patch.historyReview?.artwork || {})) {
          if (discoveries.some(item => item.discoveryId === id)) next.historyReviews[historyThreadId].artwork[id] = { ...priorHistory.artwork?.[id], ...artwork };
        }
        next.historyReviews[historyThreadId].encounteredLeadIds = [...new Set([...(priorHistory.encounteredLeadIds || []), ...(patch.historyReview?.encounteredLeadIds || [])])]
          .filter(id => current?.definitions.some(definition => definition.id === id));
        next.historyReviews[historyThreadId].acknowledgedUnlockIds = [...new Set([...(priorHistory.acknowledgedUnlockIds || []), ...(patch.historyReview?.acknowledgedUnlockIds || [])])];
        if (discoveries.some(item => item.discoveryId === next.historyReviews[historyThreadId].activeLeadId)) next.historyReviews[historyThreadId].activeLeadId = null;
        delete next.historyReview;
      }
      if (enrich) {
        next.definitions = appendRevelationDefinitions(current?.definitions || [], patch.definitions || []);
        if (["failed", "limited"].includes(next.status) && next.definitions.length) next.status = "ready";
      }
      if (clueUpdates) {
        // Presentation-only repair: never accept truth, ID, trust, source or
        // history fields from the model, and always use the latest saved state.
        const updates = new Map(safeClueUpdates(current?.definitions || [], clueUpdates).map(item => [item.id, item.clue]));
        next.definitions = (current?.definitions || []).map(item => updates.has(item.id)
          ? { ...item, previousClue: item.previousClue || item.clue, clue: updates.get(item.id), clueStyleVersion: 2 } : item);
      }
      await fs.mkdir(root, { recursive: true });
      const temporary = path.join(root, `${key}.${randomUUID()}.tmp`);
      try { await fs.writeFile(temporary, JSON.stringify(next, null, 2) + "\n", { flag: "wx" }); await fs.rename(temporary, file(character)); }
      finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
      return next;
    });
    queues.set(key, work);
    try { return await work; } finally { if (queues.get(key) === work) queues.delete(key); }
  }
  return { load, save };
}
