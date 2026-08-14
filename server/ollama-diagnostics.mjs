function bytePercent(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

export function classifyOllamaAllocation(model = {}) {
  const size = Number(model.size || 0);
  const sizeVram = Number(model.size_vram || 0);
  const gpuPercent = bytePercent(sizeVram, size);
  const status = gpuPercent >= 95 ? "ready" : gpuPercent > 0 ? "partial" : "cpu";
  return {
    status,
    gpuPercent,
    cpuPercent: 100 - gpuPercent,
    size,
    sizeVram,
    contextLength: Number(model.context_length || 0),
  };
}

function modelName(model) {
  return String(model?.model || model?.name || "").trim();
}

function sameModel(left, right) {
  const normalize = (value) => String(value || "").trim().toLowerCase().replace(/:latest$/, "");
  return normalize(left) === normalize(right);
}

async function ollamaJson(url, pathname, options = {}, timeout = 120000) {
  const response = await fetch(new URL(pathname, url), { ...options, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240);
    throw new Error(`Ollama returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return response.json();
}

export function gpuCheckGenerateBody(model, { optimize = false } = {}) {
  return {
    model,
    prompt: "Reply with OK.",
    stream: false,
    keep_alive: "5m",
    options: { ...(optimize ? { num_ctx: 4096 } : {}), num_predict: 1, temperature: 0 },
  };
}

async function warmModel(config, model, { optimize = false } = {}) {
  await ollamaJson(config.ollamaUrl, "/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(gpuCheckGenerateBody(model, { optimize })),
  }, 240000);
}

async function runningModels(config) {
  const payload = await ollamaJson(config.ollamaUrl, "/api/ps", {}, 10000);
  return Array.isArray(payload.models) ? payload.models : [];
}

function environmentWarnings() {
  const warnings = [];
  if (/^cpu/i.test(String(process.env.OLLAMA_LLM_LIBRARY || ""))) warnings.push("OLLAMA_LLM_LIBRARY is forcing a CPU library.");
  if (String(process.env.CUDA_VISIBLE_DEVICES || "").trim() === "-1") warnings.push("CUDA_VISIBLE_DEVICES is hiding the NVIDIA GPU.");
  return warnings;
}

function publicResult(model, allocation, otherModels = [], optimized = false) {
  const warnings = environmentWarnings();
  const name = modelName(model);
  if (allocation.status === "ready") {
    return {
      ...allocation,
      model: name,
      otherModels,
      warnings,
      optimized,
      summary: `${name} is fully accelerated by the GPU.`,
      detail: `${allocation.gpuPercent}% GPU allocation${allocation.contextLength ? ` · ${Math.round(allocation.contextLength / 1024)}K context` : ""}${optimized ? " · diagnostic fallback" : ""}.`,
    };
  }
  if (allocation.status === "partial") {
    return {
      ...allocation,
      model: name,
      otherModels,
      warnings,
      optimized,
      summary: `${name} is partly using system memory.`,
      detail: `${allocation.gpuPercent}% GPU / ${allocation.cpuPercent}% CPU. Close ComfyUI or choose a smaller model/context, then optimize and retest.`,
    };
  }
  return {
    ...allocation,
    model: name,
    otherModels,
    warnings,
    optimized,
    summary: `${name} is running on the CPU.`,
    detail: warnings[0] || "Quit and restart Ollama, confirm the GPU driver is current, then optimize and retest.",
  };
}

export async function diagnoseOllamaGpu(config, { model = "", optimize = false } = {}) {
  const selectedModel = String(model || config.chatModel || "").trim();
  if (!selectedModel) throw new Error("Choose an Ollama chat model before checking GPU acceleration.");

  try {
    let before = await runningModels(config);
    if (optimize) {
      for (const running of before) {
        const runningName = modelName(running);
        if (!runningName) continue;
        await ollamaJson(config.ollamaUrl, "/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: runningName, prompt: "", keep_alive: 0 }),
        }, 30000);
      }
      before = [];
    }

    await warmModel(config, selectedModel, { optimize });
    const after = await runningModels(config);
    const loaded = after.find((item) => sameModel(modelName(item), selectedModel));
    if (!loaded) throw new Error("Ollama loaded the model but did not report its processor allocation. Update Ollama, then retry.");
    const others = after.map(modelName).filter((name) => name && !sameModel(name, selectedModel));
    return publicResult(loaded, classifyOllamaAllocation(loaded), others, optimize);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/fetch failed|ECONNREFUSED/i.test(message)) throw new Error("Ollama is not reachable. Start Ollama, then run the performance check again.");
    if (/model[^]*(?:not found|does not exist)|pull model/i.test(message)) throw new Error(`The selected model “${selectedModel}” is not installed in Ollama.`);
    throw error;
  }
}
