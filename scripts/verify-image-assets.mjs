import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { validateImageAssetManifest, verifyInstalledImageAssets } from "../server/image-assets.mjs";

const root = process.cwd();
const manifestPath = path.join(root, "workflows", "animessenger-anima-assets.json");
const modelsFlag = process.argv.indexOf("--models-dir");
const modelsDirectory = modelsFlag >= 0 ? process.argv[modelsFlag + 1] : "";

if (modelsFlag >= 0 && !modelsDirectory) {
  console.error("--models-dir needs the path to the ComfyUI models folder.");
  process.exit(1);
}

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const problems = validateImageAssetManifest(manifest);
if (problems.length) {
  console.error("Image asset manifest is invalid:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`Image asset manifest passed: ${manifest.assets.length} assets are structurally valid.`);
if (modelsDirectory) {
  console.log(`Checking installed assets under ${path.resolve(modelsDirectory)}...`);
  const results = await verifyInstalledImageAssets(manifest, modelsDirectory);
  for (const result of results) console.log(`${result.ok ? "OK" : "MISSING/INVALID"} ${result.id}: ${result.ok ? result.filename : result.reason}`);
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}
