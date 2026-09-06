const DEFAULT_CONTEXT_WINDOW = 8192;
const MIN_CONTEXT_WINDOW = 4096;
const MAX_CONTEXT_WINDOW = 131072;
const contextCache = new Map();

export function estimateTokens(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value || "");
  if (!text) return 0;
  // This deliberately errs a little high for punctuation-heavy JSON and chat.
  return Math.ceil(text.length / 3.6) + 4;
}

function normalizedModelName(value) {
  return String(value || "").trim().toLowerCase().replace(/:latest$/, "");
}

function validContextWindow(value) {
  const number = Math.trunc(Number(value) || 0);
  return number >= MIN_CONTEXT_WINDOW ? Math.min(MAX_CONTEXT_WINDOW, number) : 0;
}

export async function resolveOllamaContextWindow(config, model) {
  const name = normalizedModelName(model || config?.chatModel);
  const key = String(config?.ollamaUrl || "") + "|" + name;
  const cached = contextCache.get(key);
  if (cached && Date.now() - cached.checkedAt < 30_000) return cached.value;

  let value = 0;
  try {
    const response = await fetch(String(config?.ollamaUrl || "") + "/api/ps", {
      signal: AbortSignal.timeout(2500),
    });
    if (response.ok) {
      const payload = await response.json();
      const running = (payload.models || []).find((item) => {
        const candidate = normalizedModelName(item?.name || item?.model);
        return candidate === name;
      });
      value = validContextWindow(running?.context_length);
    }
  } catch {
    // A cold or older Ollama install falls through to the conservative budget.
  }

  value ||= validContextWindow(process.env.OLLAMA_CONTEXT_LENGTH) || DEFAULT_CONTEXT_WINDOW;
  contextCache.set(key, { checkedAt: Date.now(), value });
  return value;
}

const OPTIONAL_SYSTEM_PREFIXES = [
  "VOICE RANGE EXAMPLES",
  "SELECTIVE INITIATIVE SEEDS",
  "RELATIONSHIP AND STORY DEEPENING PATHS",
  "HISTORY:",
  "RELATIONSHIPS:",
  "KNOWLEDGE:",
  "PERMANENT VISUAL IDENTITY",
];

function lineIsOptional(line) {
  const upper = line.trim().toUpperCase();
  return OPTIONAL_SYSTEM_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

function compactLine(line, maximumCharacters) {
  if (line.length <= maximumCharacters) return line;
  return line.slice(0, Math.max(0, maximumCharacters - 18)).trimEnd() + " …[compacted]";
}

export function compactSystemContext(systemContext, tokenBudget) {
  const source = String(systemContext || "").trim();
  if (estimateTokens(source) <= tokenBudget) return source;

  const lines = source.split("\n").filter(Boolean);
  let kept = lines.filter((line) => !lineIsOptional(line));
  let result = kept.join("\n");
  if (estimateTokens(result) <= tokenBudget) return result;

  // Long research fields are compacted before any behavioral rule disappears.
  kept = kept.map((line) => compactLine(line, 900));
  result = kept.join("\n");
  if (estimateTokens(result) <= tokenBudget) return result;

  kept = kept.map((line) => compactLine(line, 520));
  result = kept.join("\n");
  if (estimateTokens(result) <= tokenBudget) return result;

  // Preserve both the identity/voice beginning and the output/rules ending.
  const head = kept.slice(0, Math.ceil(kept.length * 0.42));
  const tail = kept.slice(-Math.ceil(kept.length * 0.42));
  result = [...head, "CONTEXT NOTE: Lower-priority profile detail was compacted to fit this model.", ...tail].join("\n");
  while (estimateTokens(result) > tokenBudget && head.length + tail.length > 4) {
    if (head.length > tail.length) head.pop();
    else tail.shift();
    result = [...head, "CONTEXT NOTE: Lower-priority profile detail was compacted to fit this model.", ...tail].join("\n");
  }
  return result;
}

export function buildTokenAwareMessages({
  systemContext,
  history = [],
  controls = [],
  current,
  contextWindow = DEFAULT_CONTEXT_WINDOW,
  responseReserve = 2200,
  imageInput = false,
}) {
  const windowTokens = validContextWindow(contextWindow) || DEFAULT_CONTEXT_WINDOW;
  const imageReserve = imageInput ? 1200 : 0;
  const inputBudget = Math.max(1500, windowTokens - responseReserve - imageReserve - 192);
  const currentTokens = estimateTokens(current?.content) + (current?.images?.length ? 24 : 0);
  const controlsTokens = controls.reduce((total, message) => total + estimateTokens(message?.content) + 6, 0);
  const systemBudget = Math.max(900, inputBudget - currentTokens - controlsTokens - 420);
  const compactedSystem = compactSystemContext(systemContext, systemBudget);

  let used = estimateTokens(compactedSystem) + currentTokens + controlsTokens + 24;
  const selected = [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    const cost = estimateTokens(message?.content) + 8;
    if (used + cost > inputBudget) continue;
    selected.unshift(message);
    used += cost;
  }

  const omitted = Math.max(0, history.length - selected.length);
  const messages = [{ role: "system", content: compactedSystem }];
  if (omitted) {
    messages.push({
      role: "system",
      content: `${omitted} older context item${omitted === 1 ? " was" : "s were"} omitted to fit the active model. Treat durable shared memories and the current scene above as authoritative; do not invent the missing chronology.`,
    });
  }
  messages.push(...selected, ...controls);
  if (current?.content || current?.images?.length) messages.push(current);
  return {
    messages,
    diagnostic: {
      contextWindow: windowTokens,
      inputBudget,
      estimatedInputTokens: messages.reduce((total, message) => total + estimateTokens(message?.content) + 6, 0) + (imageInput ? imageReserve : 0),
      historyItemsIncluded: selected.length,
      historyItemsOmitted: omitted,
      systemCompacted: compactedSystem !== String(systemContext || "").trim(),
    },
  };
}
