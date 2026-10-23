import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./config.mjs";

const file = path.join(dataDir, "scene-evaluation.json");
let metrics;
let writes = Promise.resolve();
async function load() {
  if (!metrics) {
    let saved;
    try { saved = JSON.parse(await fs.readFile(file, "utf8")); } catch { /* New installation or unavailable diagnostics. */ }
    metrics ||= { version: 1, turns: 0, accepted: 0, rejected: 0, reasons: {}, recent: [], ...saved };
  }
  return metrics;
}

// Local, bounded diagnostics deliberately contain no dialogue, names, or scene values.
export function recordFinalSceneEvaluation(decisions = []) {
  writes = writes.catch(() => {}).then(async () => {
    const state = await load();
    state.turns += 1;
    const safe = decisions.map(({ field, status, reason }) => ({ field, status, reason }));
    for (const decision of safe) {
      state[decision.status] += 1;
      state.reasons[decision.reason] = (state.reasons[decision.reason] || 0) + 1;
    }
    state.recent.push({ at: new Date().toISOString(), decisions: safe });
    state.recent = state.recent.slice(-50);
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(file + ".tmp", JSON.stringify(state), "utf8");
    await fs.rename(file + ".tmp", file);
  });
  return writes.catch(() => {});
}

export async function finalSceneMetrics() {
  await writes.catch(() => {});
  return structuredClone(await load());
}
