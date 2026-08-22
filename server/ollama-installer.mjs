import crypto from "node:crypto";

const jobs = new Map();

export const recommendedOllamaDownloads = Object.freeze([
  {
    model: "gemma4:e2b-it-qat",
    tier: "light",
    label: "Lighter hardware",
    detail: "CPU-only systems or GPUs with up to 10 GB VRAM",
    approximateBytes: 4_300_000_000,
  },
  {
    model: "gemma4:12b",
    tier: "recommended",
    label: "Recommended",
    detail: "The best starting point for 12–23 GB VRAM",
    approximateBytes: 7_600_000_000,
  },
  {
    model: "gemma4:26b-a4b-it-qat",
    tier: "high-end",
    label: "High-end",
    detail: "More capacity for GPUs with 24 GB VRAM or more",
    approximateBytes: 16_000_000_000,
  },
]);

const allowedModels = new Set(recommendedOllamaDownloads.map((item) => item.model));

function publicJob(job) {
  return {
    id: job.id,
    model: job.model,
    status: job.status,
    message: job.message,
    totalBytes: job.totalBytes,
    completedBytes: job.completedBytes,
    ...(job.error ? { error: job.error } : {}),
  };
}

export function applyOllamaPullProgress(job, payload = {}) {
  if (typeof payload.status === "string" && payload.status.trim()) job.message = payload.status.trim();
  const payloadTotal = Number(payload.total);
  const payloadCompleted = Number(payload.completed);
  if (payload.digest && Number.isFinite(payloadTotal) && payloadTotal > 0) {
    job.layers ??= new Map();
    job.layers.set(String(payload.digest), {
      total: payloadTotal,
      completed: Number.isFinite(payloadCompleted) && payloadCompleted >= 0 ? payloadCompleted : 0,
    });
    const layers = [...job.layers.values()];
    job.totalBytes = Math.max(job.totalBytes || 0, layers.reduce((sum, layer) => sum + layer.total, 0));
    job.completedBytes = layers.reduce((sum, layer) => sum + layer.completed, 0);
  } else {
    if (Number.isFinite(payloadTotal) && payloadTotal > 0) job.totalBytes = payloadTotal;
    if (Number.isFinite(payloadCompleted) && payloadCompleted >= 0) job.completedBytes = payloadCompleted;
  }
  if (payload.error) throw new Error(String(payload.error));
  return job;
}

async function runPull(job, ollamaUrl) {
  job.status = "downloading";
  try {
    const response = await fetch(String(ollamaUrl || "").replace(/\/$/, "") + "/api/pull", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: job.model, stream: true }),
      signal: job.controller.signal,
    });
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      throw new Error(detail || `Ollama returned ${response.status} while downloading the model.`);
    }

    const decoder = new TextDecoder();
    let pending = "";
    for await (const chunk of response.body) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        applyOllamaPullProgress(job, JSON.parse(line));
      }
    }
    pending += decoder.decode();
    if (pending.trim()) applyOllamaPullProgress(job, JSON.parse(pending));
    job.status = "complete";
    job.message = "Model ready";
    if (job.totalBytes > 0) job.completedBytes = job.totalBytes;
  } catch (error) {
    job.status = error?.name === "AbortError" ? "cancelled" : "error";
    job.error = job.status === "cancelled"
      ? "Download cancelled. Ollama may keep completed layers for a later retry."
      : String(error?.message || error || "The model download failed.");
  }
}

export function startOllamaModelInstall({ ollamaUrl, model } = {}) {
  const selected = String(model || "").trim();
  if (!allowedModels.has(selected)) throw new Error("Choose one of AniMessenger's recommended Ollama models.");
  const existing = [...jobs.values()].find((job) => job.model === selected && ["queued", "downloading"].includes(job.status));
  if (existing) return publicJob(existing);
  const catalogItem = recommendedOllamaDownloads.find((item) => item.model === selected);
  const job = {
    id: crypto.randomUUID(),
    model: selected,
    status: "queued",
    message: "Waiting for Ollama",
    totalBytes: catalogItem?.approximateBytes || 0,
    completedBytes: 0,
    controller: new AbortController(),
    layers: new Map(),
    error: "",
  };
  jobs.set(job.id, job);
  void runPull(job, ollamaUrl);
  const timer = setTimeout(() => jobs.delete(job.id), 60 * 60 * 1000);
  timer.unref?.();
  return publicJob(job);
}

export function ollamaModelInstallStatus(jobId) {
  const job = jobs.get(jobId);
  if (!job) throw new Error("That model download is no longer available.");
  return publicJob(job);
}

export function cancelOllamaModelInstall(jobId) {
  const job = jobs.get(jobId);
  if (!job) throw new Error("That model download is no longer available.");
  if (["queued", "downloading"].includes(job.status)) job.controller.abort();
  return publicJob(job);
}
