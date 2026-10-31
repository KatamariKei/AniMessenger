import { chatKeepAlive } from "./model-runtime.mjs";

const modelKey = value => String(value || "").trim().toLowerCase().replace(/:latest$/, "");

// Opportunistic preparation only: never manufacture a chat turn, override the
// user's allocation, refresh an already loaded model or keep warming on a timer.
export function createChatWarmup({ fetcher = fetch, busy = () => false, now = Date.now, onMetrics = () => {}, onLoaded = () => {} } = {}) {
  const attemptedAt = new Map();
  let inFlight = null;
  return (config) => {
    const model = String(config.chatModel || "").trim();
    if (!model) return Promise.resolve({ status: "no_model" });
    const key = `${config.ollamaUrl}|${modelKey(model)}`;
    if (inFlight) return inFlight.key === key ? inFlight.promise : Promise.resolve({ status: "busy" });
    if (busy()) return Promise.resolve({ status: "busy" });
    if (attemptedAt.has(key) && now() - attemptedAt.get(key) < 30_000) return Promise.resolve({ status: "cooldown" });
    attemptedAt.set(key, now());
    while (attemptedAt.size > 32) attemptedAt.delete(attemptedAt.keys().next().value);
    const run = async () => {
      try {
        const ps = await fetcher(config.ollamaUrl + "/api/ps", { signal: AbortSignal.timeout(1000) });
        if (!ps.ok) return { status: "unavailable" };
        const payload = await ps.json();
        if (!Array.isArray(payload.models)) return { status: "unavailable" };
        if (busy()) return { status: "busy" };
        if (payload.models.some(item => [item.name, item.model].some(name => modelKey(name) === modelKey(model)))) return { status: "already_loaded" };
        // A speculative request must not displace another resident model.
        if (payload.models.length) return { status: "other_model" };
        if (config.comfyUrl) {
          try {
            const queue = await fetcher(config.comfyUrl + "/queue", { signal: AbortSignal.timeout(750) });
            if (!queue.ok) return { status: "image_unknown" };
            const jobs = await queue.json();
            if (!Array.isArray(jobs.queue_running) || !Array.isArray(jobs.queue_pending)) return { status: "image_unknown" };
            if (jobs.queue_running.length || jobs.queue_pending.length) return { status: "image_busy" };
          } catch (error) {
            // Refused connections mean the optional image service is off.
            // A timeout/unknown response may instead mean it is busy.
            if (error.code !== "ECONNREFUSED" && error.cause?.code !== "ECONNREFUSED") return { status: "image_unknown" };
          }
        }
        if (busy()) return { status: "busy" };
        const started = now();
        let success = false;
        try {
          const response = await fetcher(config.ollamaUrl + "/api/chat", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ model, stream: false, ...chatKeepAlive(config, model) }),
            signal: AbortSignal.timeout(60000),
          });
          if (!response.ok) return { status: "unavailable" };
          const result = await response.json();
          if (result.error || result.done !== true) return { status: "unavailable" };
          try { await onLoaded(config, model); } catch { /* Optional allocation observation. */ }
          success = true;
          return { status: "loaded" };
        } finally {
          try { onMetrics({ wallMs: now() - started, success }); } catch { /* Optional diagnostics. */ }
        }
      } catch { return { status: "unavailable" }; }
    };
    const promise = run().finally(() => { if (inFlight?.promise === promise) inFlight = null; });
    inFlight = { key, promise };
    return promise;
  };
}
