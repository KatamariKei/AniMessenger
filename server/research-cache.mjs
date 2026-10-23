import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./config.mjs";
import { wikiPageMatches } from "./research.mjs";

const cacheDir = path.join(dataDir, "research-cache");
const CACHE_VERSION = 3;
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function discoveryResearchNeedsRefresh(research, character) {
  const evidence = research?.evidence;
  if (!evidence?.passages?.length) return true;
  const wiki = evidence.passages.filter(item => item.provider === "franchise_wiki" && item.text && !String(item.title).includes("/"));
  if (wiki.length) return character ? !wiki.some(item => wikiPageMatches(String(character.name || "").replace(/\s*\([^)]*\)\s*$/, "").trim(), character.series,
    { title: item.title, wikitext: { "*": item.text } })) : false;
  return (evidence.diagnostics || []).some(item => item.provider === "franchise_wiki"
    && ["failed", "no_match"].includes(item.status));
}

function safeId(value) {
  const id = String(value || "").replace(/[^a-zA-Z0-9()_.-]/g, "-").slice(0, 140);
  if (!id) throw new Error("A valid character id is required for research caching.");
  return id;
}

export function researchCacheFingerprint(character = {}) {
  const identity = {
    id: String(character.id || ""),
    name: String(character.name || ""),
    series: String(character.series || ""),
    trigger: String(character.trigger || ""),
    tags: Array.isArray(character.tags) ? character.tags : [],
    catalogNotes: Array.isArray(character.catalogNotes) ? character.catalogNotes : [],
    sourceUrl: String(character.sourceUrl || ""),
    sourceRefs: Array.isArray(character.sourceRefs) ? character.sourceRefs : [],
    seriesAliases: Array.isArray(character.seriesAliases) ? character.seriesAliases : [],
  };
  return crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

export function reusableResearchCacheEntry(entry, character, now = Date.now()) {
  if (!entry || entry.version !== CACHE_VERSION) return false;
  if (entry.fingerprint !== researchCacheFingerprint(character)) return false;
  const savedAt = Date.parse(entry.savedAt || "");
  if (!Number.isFinite(savedAt) || now - savedAt > CACHE_MAX_AGE_MS) return false;
  return Array.isArray(entry.research?.evidence?.passages) && entry.research.evidence.passages.length > 0;
}

export async function loadResearchCache(character) {
  try {
    const entry = JSON.parse(await fs.readFile(path.join(cacheDir, safeId(character.id) + ".json"), "utf8"));
    if (!reusableResearchCacheEntry(entry, character)) return null;
    return {
      ...entry.research,
      evidence: {
        ...entry.research.evidence,
        cacheHit: true,
        cachedAt: entry.savedAt,
        durationMs: 0,
      },
    };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return null;
  }
}

export async function saveResearchCache(character, research) {
  if (!Array.isArray(research?.evidence?.passages) || !research.evidence.passages.length) return research;
  const entry = {
    version: CACHE_VERSION,
    savedAt: new Date().toISOString(),
    fingerprint: researchCacheFingerprint(character),
    research,
  };
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(path.join(cacheDir, safeId(character.id) + ".json"), JSON.stringify(entry, null, 2) + "\n", "utf8");
  return research;
}
