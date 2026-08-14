import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { imageAssetPath, validateImageAssetManifest, verifyInstalledImageAssets } from "./image-assets.mjs";

const jobs = new Map();

export async function readImageAssetManifest(rootDirectory) {
  const filename = path.join(rootDirectory, "workflows", "animessenger-anima-assets.json");
  const manifest = JSON.parse(await fsp.readFile(filename, "utf8"));
  const problems = validateImageAssetManifest(manifest);
  if (problems.length) throw new Error(`The bundled image manifest is invalid: ${problems.join(" ")}`);
  return manifest;
}

export async function validateModelsDirectory(directory) {
  const resolved = path.resolve(String(directory || "").trim());
  if (!directory || path.basename(resolved).toLowerCase() !== "models") {
    throw new Error("Choose the ComfyUI folder named models.");
  }
  const stats = await fsp.stat(resolved).catch(() => null);
  if (!stats?.isDirectory()) throw new Error("That ComfyUI models folder could not be found.");
  return resolved;
}

export async function ensureStandardComfyOutputDirectory(modelsDirectory) {
  const models = await validateModelsDirectory(modelsDirectory);
  const outputDirectory = path.join(path.dirname(models), "output");
  await fsp.mkdir(outputDirectory, { recursive: true });
  const stats = await fsp.stat(outputDirectory).catch(() => null);
  if (!stats?.isDirectory()) throw new Error("AniMessenger could not prepare ComfyUI's output folder.");
  return outputDirectory;
}

export function comfyOutputDirectoryFromSystemStats(payload) {
  const argv = Array.isArray(payload?.system?.argv) ? payload.system.argv.map((value) => String(value)) : [];
  const argument = (name) => {
    const direct = argv.findIndex((value) => value === name);
    if (direct >= 0 && argv[direct + 1]) return argv[direct + 1];
    const inline = argv.find((value) => value.startsWith(`${name}=`));
    return inline ? inline.slice(name.length + 1) : "";
  };
  const output = argument("--output-directory");
  if (output && path.isAbsolute(output)) return path.resolve(output);
  const base = argument("--base-directory");
  return base && path.isAbsolute(base) ? path.resolve(base, "output") : "";
}

export async function prepareComfyOutputDirectory({ modelsDirectory, comfyUrl = "" } = {}) {
  const models = await validateModelsDirectory(modelsDirectory);
  let outputDirectory = "";
  try {
    const target = new URL(comfyUrl);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) throw new Error("ComfyUI is not local.");
    const response = await fetch(new URL("/system_stats", target), { signal: AbortSignal.timeout(3000) });
    if (response.ok) outputDirectory = comfyOutputDirectoryFromSystemStats(await response.json());
  } catch {
    // Older and custom ComfyUI launches may not expose a usable base directory.
  }
  if (!outputDirectory) {
    const root = path.dirname(models);
    const markers = [path.join(root, "main.py"), path.join(root, "ComfyUI", "main.py")];
    const looksLikeComfyRoot = (await Promise.all(markers.map((marker) => fsp.stat(marker).catch(() => null)))).some((stats) => stats?.isFile());
    if (!looksLikeComfyRoot) {
      throw new Error("Start ComfyUI so AniMessenger can locate its output folder, or open the custom output-folder option below.");
    }
    outputDirectory = path.join(root, "output");
  }
  await fsp.mkdir(outputDirectory, { recursive: true });
  const stats = await fsp.stat(outputDirectory).catch(() => null);
  if (!stats?.isDirectory()) throw new Error("AniMessenger could not prepare ComfyUI's output folder.");
  return outputDirectory;
}

async function usableModelsDirectory(directory) {
  try {
    return await validateModelsDirectory(directory);
  } catch {
    return "";
  }
}

export async function detectComfyModelsDirectories({ configured = "", outputDirectory = "", projectRoot = "", manifest = null } = {}) {
  const possibilities = [];
  const add = (candidate) => {
    if (candidate && !possibilities.some((item) => item.toLowerCase() === candidate.toLowerCase())) possibilities.push(candidate);
  };
  add(configured);
  if (outputDirectory) add(path.join(path.dirname(path.resolve(outputDirectory)), "models"));
  if (projectRoot) {
    add(path.join(projectRoot, "models"));
    add(path.join(projectRoot, "ComfyUI", "models"));
    add(path.join(path.dirname(projectRoot), "ComfyUI", "models"));
  }

  if (process.platform === "win32") {
    for (let code = 67; code <= 90; code += 1) {
      const drive = `${String.fromCharCode(code)}:\\`;
      try {
        const entries = await fsp.readdir(drive, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || !/comfy/i.test(entry.name)) continue;
          add(path.join(drive, entry.name, "models"));
          add(path.join(drive, entry.name, "ComfyUI", "models"));
        }
      } catch {
        // Unmounted and protected drives are expected during detection.
      }
    }
  }

  const valid = [];
  for (const candidate of possibilities) {
    const resolved = await usableModelsDirectory(candidate);
    if (resolved && !valid.some((item) => item.toLowerCase() === resolved.toLowerCase())) valid.push(resolved);
  }
  if (manifest?.assets?.length) {
    const scored = await Promise.all(valid.map(async (directory, order) => {
      let matches = 0;
      for (const asset of manifest.assets) {
        const stats = await fsp.stat(imageAssetPath(directory, asset)).catch(() => null);
        if (stats?.isFile() && stats.size === asset.bytes) matches += 1;
      }
      return { directory, matches, order };
    }));
    return scored.sort((left, right) => right.matches - left.matches || left.order - right.order).map((item) => item.directory);
  }
  return valid;
}

async function availableBytes(directory) {
  try {
    const stats = await fsp.statfs(directory);
    return Number(stats.bavail * stats.bsize);
  } catch {
    return null;
  }
}

export async function imagePackStatus(manifest, modelsDirectory) {
  const directory = await validateModelsDirectory(modelsDirectory);
  const checked = await verifyInstalledImageAssets(manifest, directory);
  const assets = manifest.assets.map((asset, index) => {
    const result = checked[index];
    return {
      id: asset.id,
      kind: asset.kind,
      filename: asset.filename,
      bytes: asset.bytes,
      required: asset.required,
      pageUrl: asset.source.pageUrl,
      state: result.ok ? "installed" : result.reason === "missing" ? "missing" : "invalid",
      ...(result.ok ? {} : { detail: result.reason }),
    };
  });
  return {
    modelsDirectory: directory,
    totalBytes: manifest.totalBytes,
    requiredDownloadBytes: manifest.assets.reduce((total, asset, index) => total + (checked[index].ok ? 0 : asset.bytes), 0),
    availableBytes: await availableBytes(directory),
    allInstalled: assets.every((asset) => asset.state === "installed"),
    assets,
  };
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    modelsDirectory: job.modelsDirectory,
    totalBytes: job.totalBytes,
    completedBytes: job.completedBytes,
    currentAssetId: job.currentAssetId,
    currentFilename: job.currentFilename,
    installedAssetIds: [...job.installedAssetIds],
    ...(job.error ? { error: job.error } : {}),
  };
}

async function downloadAsset(job, asset, apiToken, repair) {
  const target = imageAssetPath(job.modelsDirectory, asset);
  const part = `${target}.animessenger.part`;
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.rm(part, { force: true });
  const response = await fetch(asset.source.downloadUrl, {
    redirect: "follow",
    signal: job.controller.signal,
    headers: {
      "user-agent": "AniMessenger image setup",
      ...(apiToken ? { authorization: `Bearer ${apiToken}` } : {}),
    },
  });
  if (!response.ok || !response.body) {
    if (response.status === 401 || response.status === 403) throw new Error(`Civitai rejected ${asset.filename}. Check the temporary access token and your account permissions.`);
    throw new Error(`The provider returned ${response.status} while downloading ${asset.filename}.`);
  }

  const handle = await fsp.open(part, "w");
  let received = 0;
  try {
    for await (const chunk of response.body) {
      await handle.write(chunk);
      received += chunk.byteLength;
      job.completedBytes += chunk.byteLength;
    }
  } finally {
    await handle.close();
  }
  if (received !== asset.bytes) throw new Error(`${asset.filename} was incomplete. Expected ${asset.bytes} bytes but received ${received}.`);

  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(part);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  if (hash.digest("hex") !== asset.sha256) throw new Error(`${asset.filename} failed its SHA-256 safety check.`);

  const existing = await fsp.stat(target).catch(() => null);
  if (existing) {
    if (!repair) throw new Error(`${asset.filename} already exists but is invalid. Choose repair to preserve and replace it.`);
    await fsp.rename(target, `${target}.invalid-${Date.now()}`);
  }
  await fsp.rename(part, target);
}

async function runInstall(job, manifest, selectedAssets, apiToken, repair) {
  job.status = "downloading";
  try {
    for (const asset of selectedAssets) {
      job.currentAssetId = asset.id;
      job.currentFilename = asset.filename;
      await downloadAsset(job, asset, apiToken, repair);
      job.installedAssetIds.push(asset.id);
    }
    job.currentAssetId = "";
    job.currentFilename = "";
    job.status = "complete";
  } catch (error) {
    job.status = error?.name === "AbortError" ? "cancelled" : "error";
    job.error = job.status === "cancelled" ? "Download cancelled." : error.message;
    if (job.currentAssetId) {
      const asset = manifest.assets.find((item) => item.id === job.currentAssetId);
      if (asset) await fsp.rm(`${imageAssetPath(job.modelsDirectory, asset)}.animessenger.part`, { force: true }).catch(() => undefined);
    }
  }
}

export async function startImagePackInstall(manifest, { modelsDirectory, acceptedTerms, apiToken = "", repair = false } = {}) {
  if (acceptedTerms !== true) throw new Error("Review and accept the model providers' terms before downloading.");
  if (manifest.authentication?.required && !String(apiToken || "").trim()) throw new Error("A Civitai access token is required for the recommended image pack.");
  const directory = await validateModelsDirectory(modelsDirectory);
  const status = await imagePackStatus(manifest, directory);
  const blocked = status.assets.filter((asset) => asset.state === "invalid");
  if (blocked.length && !repair) throw new Error("One or more model files are invalid. Enable repair to preserve and replace them.");
  const selectedAssets = manifest.assets.filter((asset) => status.assets.find((item) => item.id === asset.id)?.state !== "installed");
  if (!selectedAssets.length) throw new Error("The recommended image pack is already installed.");
  const required = selectedAssets.reduce((total, asset) => total + asset.bytes, 0);
  if (status.availableBytes !== null && status.availableBytes < Math.ceil(required * 1.05)) {
    throw new Error("There is not enough free space for the missing image files and download verification.");
  }
  const job = {
    id: crypto.randomUUID(),
    status: "queued",
    modelsDirectory: directory,
    totalBytes: required,
    completedBytes: 0,
    currentAssetId: "",
    currentFilename: "",
    installedAssetIds: [],
    controller: new AbortController(),
    error: "",
  };
  jobs.set(job.id, job);
  void runInstall(job, manifest, selectedAssets, String(apiToken || "").trim(), Boolean(repair));
  const timer = setTimeout(() => jobs.delete(job.id), 60 * 60 * 1000);
  timer.unref?.();
  return publicJob(job);
}

export function imagePackInstallStatus(jobId) {
  const job = jobs.get(jobId);
  if (!job) throw new Error("That image download is no longer available.");
  return publicJob(job);
}

export function cancelImagePackInstall(jobId) {
  const job = jobs.get(jobId);
  if (!job) throw new Error("That image download is no longer available.");
  if (job.status === "queued" || job.status === "downloading") job.controller.abort();
  return publicJob(job);
}
