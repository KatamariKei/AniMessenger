import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const appHomeDir = process.env.ANIMESSENGER_HOME
  ? path.resolve(process.env.ANIMESSENGER_HOME)
  : rootDir;
export const dataDir = path.join(appHomeDir, "data");
export const configPath = path.join(appHomeDir, "charasms.config.json");

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
  globalPositivePrompt: "masterpiece, best quality, highres, detailed face, detailed eyes, coherent anatomy, clean linework, polished anime illustration",
  globalNegativePrompt: "lowres, blurry, jpeg artifacts, bad anatomy, bad hands, malformed hands, extra fingers, missing fingers, extra limbs, duplicate, multiple views, text, watermark, logo",
  researchEnabled: true,
  proactiveEnabled: true,
  proactivePace: "normal",
  proactiveDeliveryStart: "08:00",
  proactiveDeliveryEnd: "23:00",
  accentTheme: "signal",
};

export async function readConfig() {
  try {
    const saved = JSON.parse(await fs.readFile(configPath, "utf8"));
    return { ...defaultConfig, ...saved, accentTheme: "signal" };
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
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
