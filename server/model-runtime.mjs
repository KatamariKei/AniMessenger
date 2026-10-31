import { createSingleFlight } from "./single-flight.mjs";

const normalizedModel = value => String(value || "").trim().toLowerCase().replace(/:latest$/, "");

async function inspectLoadedContext(config, model) {
  const response = await fetch(String(config.ollamaUrl || "") + "/api/ps", { signal: AbortSignal.timeout(1000) });
  if (!response.ok) return 0;
  const payload = await response.json();
  const running = (payload.models || []).find(item => normalizedModel(item.name || item.model) === normalizedModel(model));
  return Number(running?.context_length) || 0;
}

export function createModelContextPolicy(inspect = inspectLoadedContext) {
  const contexts = new Map();
  const refresh = createSingleFlight();
  const keyFor = (config, model) => config?.chatModel && normalizedModel(model) === normalizedModel(config.chatModel)
    ? String(config.ollamaUrl || "") + "|" + normalizedModel(model) : "";
  return {
    defaultContext(config, model) { return contexts.get(keyFor(config, model))?.value || 0; },
    requestContext(config, model, required = 0) {
      const known = contexts.get(keyFor(config, model))?.value || 0;
      // Inherit the user's Ollama setting when it already satisfies the task.
      // Smaller/unknown allocations retain the existing task-specific minimum.
      return required && known < required ? required : undefined;
    },
    async observeDefault(config, model) {
      const key = keyFor(config, model);
      if (!key) return;
      const previous = contexts.get(key);
      if (previous && Date.now() - previous.checkedAt < 30_000) return;
      return refresh(key, async () => {
        let value = previous?.value || 0;
        try {
          const observed = await inspect(config, model);
          if (Number.isFinite(observed) && observed >= 4096 && observed <= 131072) value = observed;
        } catch { /* Optional metadata must never fail a completed reply. */ }
        contexts.set(key, { value, checkedAt: Date.now() });
        while (contexts.size > 64) contexts.delete(contexts.keys().next().value);
      });
    },
  };
}

export const modelContextPolicy = createModelContextPolicy();

export function chatKeepAlive(config, model) {
  if (!config?.chatModel || normalizedModel(model) !== normalizedModel(config.chatModel)) return {};
  const configured = Number(config.chatKeepAliveMinutes ?? 15);
  const minutes = Number.isFinite(configured) ? Math.max(0, Math.min(60, Math.trunc(configured))) : 15;
  // Zero means use Ollama's own policy, not keep_alive: 0 (immediate unload).
  return minutes ? { keep_alive: `${minutes}m` } : {};
}
