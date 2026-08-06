import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const assetKinds = new Set(["diffusion_model", "text_encoder", "vae", "lora"]);
const targetDirectories = new Set(["diffusion_models", "text_encoders", "vae", "loras"]);

export function validateImageAssetManifest(manifest) {
  const problems = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return ["Manifest must be a JSON object."];
  if (manifest.schemaVersion !== 1) problems.push("schemaVersion must be 1.");
  if (typeof manifest.id !== "string" || !manifest.id.trim()) problems.push("id is required.");
  if (typeof manifest.workflow !== "string" || !manifest.workflow.endsWith(".json")) problems.push("workflow must name a JSON file.");
  if (typeof manifest.mapping !== "string" || !manifest.mapping.endsWith(".json")) problems.push("mapping must name a JSON file.");
  if (manifest.authentication?.required !== true || manifest.authentication?.provider !== "Civitai") problems.push("authentication must require a Civitai token.");
  try {
    if (new URL(manifest.authentication?.accountUrl).protocol !== "https:") problems.push("authentication.accountUrl must use HTTPS.");
  } catch {
    problems.push("authentication.accountUrl must be a valid URL.");
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    problems.push("assets must contain at least one asset.");
    return problems;
  }
  if (!Number.isSafeInteger(manifest.totalBytes) || manifest.totalBytes <= 0) problems.push("totalBytes must be a positive integer.");

  const ids = new Set();
  const targets = new Set();
  for (const [index, asset] of manifest.assets.entries()) {
    const label = `assets[${index}]`;
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
      problems.push(`${label} must be an object.`);
      continue;
    }
    if (typeof asset.id !== "string" || !asset.id.trim()) problems.push(`${label}.id is required.`);
    else if (ids.has(asset.id)) problems.push(`${label}.id duplicates ${asset.id}.`);
    else ids.add(asset.id);
    if (!assetKinds.has(asset.kind)) problems.push(`${label}.kind is not supported.`);
    if (asset.required !== true && asset.required !== false) problems.push(`${label}.required must be a boolean.`);
    if (typeof asset.filename !== "string" || path.basename(asset.filename) !== asset.filename || !asset.filename.endsWith(".safetensors")) {
      problems.push(`${label}.filename must be a plain .safetensors filename.`);
    }
    if (!targetDirectories.has(asset.targetSubdirectory)) problems.push(`${label}.targetSubdirectory is not supported.`);
    if (!Number.isSafeInteger(asset.bytes) || asset.bytes <= 0) problems.push(`${label}.bytes must be a positive integer.`);
    if (typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(asset.sha256)) problems.push(`${label}.sha256 must be a lowercase SHA-256 digest.`);
    const target = `${asset.targetSubdirectory}/${asset.filename}`.toLowerCase();
    if (targets.has(target)) problems.push(`${label} duplicates target ${target}.`);
    else targets.add(target);
    for (const field of ["pageUrl", "downloadUrl"]) {
      try {
        if (new URL(asset.source?.[field]).protocol !== "https:") problems.push(`${label}.source.${field} must use HTTPS.`);
      } catch {
        problems.push(`${label}.source.${field} must be a valid URL.`);
      }
    }
  }
  const calculatedBytes = manifest.assets.reduce((total, asset) => total + (Number.isSafeInteger(asset?.bytes) ? asset.bytes : 0), 0);
  if (manifest.totalBytes !== calculatedBytes) problems.push(`totalBytes must equal the asset total (${calculatedBytes}).`);
  return problems;
}

export function imageAssetPath(modelsDirectory, asset) {
  if (!targetDirectories.has(asset?.targetSubdirectory)) throw new Error("Unsupported ComfyUI model directory.");
  if (typeof asset.filename !== "string" || path.basename(asset.filename) !== asset.filename) throw new Error("Unsafe asset filename.");
  return path.join(path.resolve(modelsDirectory), asset.targetSubdirectory, asset.filename);
}

export async function sha256File(filename) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filename);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

export async function verifyInstalledImageAssets(manifest, modelsDirectory) {
  const results = [];
  for (const asset of manifest.assets) {
    const filename = imageAssetPath(modelsDirectory, asset);
    try {
      const stats = await fs.promises.stat(filename);
      if (!stats.isFile()) throw new Error("not a file");
      if (stats.size !== asset.bytes) {
        results.push({ id: asset.id, ok: false, filename, reason: `size mismatch: expected ${asset.bytes}, found ${stats.size}` });
        continue;
      }
      const actualHash = await sha256File(filename);
      results.push(actualHash === asset.sha256
        ? { id: asset.id, ok: true, filename }
        : { id: asset.id, ok: false, filename, reason: `SHA-256 mismatch: expected ${asset.sha256}, found ${actualHash}` });
    } catch (error) {
      results.push({ id: asset.id, ok: false, filename, reason: error?.code === "ENOENT" ? "missing" : error.message });
    }
  }
  return results;
}
