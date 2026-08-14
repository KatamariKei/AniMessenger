import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const appHomeDir = process.env.ANIMESSENGER_HOME
  ? path.resolve(process.env.ANIMESSENGER_HOME)
  : rootDir;
export const dataDir = path.join(appHomeDir, "data");
export const configPath = path.join(appHomeDir, "animessenger.config.json");

export const defaultConfig = {
  userName: "",
  ollamaUrl: "http://127.0.0.1:11434",
  chatModel: "",
  profileModel: "",
  visionModel: "",
  ollamaThinking: false,
  animadexUrl: "https://animadex.net",
  comfyUrl: "http://127.0.0.1:8188",
  comfyOutputDir: "",
  comfyModelsDir: "",
  comfyDiffusionModel: "",
  comfyWorkflowFile: "workflows/anima-recommended-api.json",
  comfyMappingFile: "workflows/anima-recommended-api.mapping.json",
  globalPositivePrompt: "masterpiece, best quality, amazing quality, very aesthetic, amazing detail, sensitive, absurdres, newest, highres, year 2025, score_9, score_8, SOLO",
  globalNegativePrompt: "worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts, sepia, low quality, worst quality, blurry, bad anatomy, extra limbs, deformed, watermark, text, signature, artifacts, hands, copyrights name, jpeg_artifacts, scan_artifacts, bad hands, missing fingers, extra digit, fewer digits, artistic error, ye-pop, deviantart, logo, patreon logo, 3D",
  researchEnabled: true,
  proactiveEnabled: true,
  proactivePace: "normal",
  proactiveDeliveryStart: "08:00",
  proactiveDeliveryEnd: "23:00",
  accentTheme: "signal",
};

function resemblesAniMessengerConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return ["ollamaUrl", "chatModel", "comfyUrl", "animadexUrl", "globalPositivePrompt"]
    .filter((key) => Object.hasOwn(value, key)).length >= 2;
}

export async function discoverLegacyConfig(directory = appHomeDir, destination = configPath) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !/\.config\.json$/i.test(entry.name)) continue;
    const candidatePath = path.join(directory, entry.name);
    if (path.resolve(candidatePath) === path.resolve(destination)) continue;
    try {
      const value = JSON.parse(await fs.readFile(candidatePath, "utf8"));
      if (resemblesAniMessengerConfig(value)) return { path: candidatePath, value };
    } catch {
      // Ignore unrelated or malformed legacy configuration files.
    }
  }
  return null;
}

export async function readConfig() {
  try {
    const saved = JSON.parse(await fs.readFile(configPath, "utf8"));
    return { ...defaultConfig, ...saved, accentTheme: "signal" };
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
    const legacy = await discoverLegacyConfig();
    if (legacy) return writeConfig(legacy.value);
    return { ...defaultConfig };
  }
}

export async function writeConfig(input) {
  const next = { ...defaultConfig };
  for (const key of Object.keys(defaultConfig)) {
    if (typeof input?.[key] === typeof defaultConfig[key]) next[key] = input[key];
  }
  next.accentTheme = "signal";
  await fs.mkdir(appHomeDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}
