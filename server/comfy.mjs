import fs from "node:fs/promises";
import path from "node:path";
import { buildImagePrompt, CHARACTER_PHOTO_NEGATIVE, mergePromptTags, visualExceptionNegative } from "./identity.mjs";
import { effectiveVisual } from "./visual-overrides.mjs";

export async function checkComfy(config) {
  try {
    const response = await fetch(config.comfyUrl + "/system_stats", { signal: AbortSignal.timeout(2500) });
    return response.ok;
  } catch {
    return false;
  }
}

function unetModelsFromObjectInfo(objectInfo) {
  const choices = objectInfo?.UNETLoader?.input?.required?.unet_name?.[0];
  return Array.isArray(choices)
    ? [...new Set(choices.map((value) => String(value || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
    : [];
}

export function isAnimaDiffusionModel(modelName) {
  return /anima(?!t)/i.test(String(modelName || ""));
}

export function selectedDiffusionModel(config, mapping) {
  return String(config?.comfyDiffusionModel || mapping?.defaults?.model_name || "").trim();
}

export async function listComfyDiffusionModels(config) {
  let workflowDefault = "";
  try {
    const mapping = await readJson(config.comfyMappingFile, "workflow mapping");
    workflowDefault = String(mapping?.defaults?.model_name || "").trim();
  } catch {
    // Keep model discovery useful while a custom mapping is being corrected.
  }

  try {
    const response = await fetch(config.comfyUrl + "/object_info/UNETLoader", { signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error("ComfyUI did not provide its diffusion-model list.");
    return {
      online: true,
      models: unetModelsFromObjectInfo(await response.json()).filter(isAnimaDiffusionModel),
      workflowDefault,
    };
  } catch {
    return { online: false, models: [], workflowDefault };
  }
}

async function readJson(filePath, label) {
  if (!filePath) throw new Error("Choose an ANIMA " + label + " file in AniMessenger Settings.");
  try {
    return JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"));
  } catch (error) {
    throw new Error("The configured " + label + " could not be read: " + (error instanceof Error ? error.message : String(error)));
  }
}

const requiredMappingFields = [
  "positive_prompt", "negative_prompt", "seed", "width", "height", "steps", "cfg", "sampler", "scheduler", "diffusion_model", "filename_prefix",
];

function diagnosticIssue(code, severity, title, detail) {
  return { code, severity, title, detail };
}

export function validateWorkflowMapping(workflow, mapping) {
  const issues = [];
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    return [diagnosticIssue("workflow_format", "error", "Workflow format is not supported", "Export the workflow from ComfyUI using Save (API Format).")];
  }
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return [diagnosticIssue("mapping_format", "error", "Workflow mapping is not valid JSON", "Choose a mapping file made for this API workflow.")];
  }
  for (const name of requiredMappingFields) {
    const field = mapping.fields?.[name];
    const nodeId = String(field?.node_id ?? field?.nodeId ?? "");
    const input = field?.input;
    if (!nodeId || !input) {
      issues.push(diagnosticIssue("mapping_field_" + name, "error", "Missing workflow mapping: " + name, "Add a node_id and input for " + name + " in the mapping file."));
      continue;
    }
    if (!workflow[nodeId]?.inputs || !(input in workflow[nodeId].inputs)) {
      issues.push(diagnosticIssue("mapping_target_" + name, "error", "Mapped node is unavailable: " + name, "Node " + nodeId + " does not contain the input " + input + " in the configured API workflow."));
    }
  }
  return issues;
}

export function validateComfyObjectInfo(workflow, objectInfo) {
  const issues = [];
  const missingClasses = new Set();
  for (const node of Object.values(workflow || {})) {
    const classType = String(node?.class_type || "");
    if (!classType || objectInfo?.[classType]) continue;
    if (missingClasses.has(classType)) continue;
    missingClasses.add(classType);
    issues.push(diagnosticIssue("missing_node_" + classType, "error", "Missing ComfyUI node: " + classType, "Install the custom node package that provides this node, restart ComfyUI, and recheck."));
  }

  for (const [nodeId, node] of Object.entries(workflow || {})) {
    const definition = objectInfo?.[node?.class_type];
    const declaredInputs = { ...(definition?.input?.required || {}), ...(definition?.input?.optional || {}) };
    for (const [inputName, value] of Object.entries(node?.inputs || {})) {
      if (Array.isArray(value) || typeof value !== "string") continue;
      const choices = declaredInputs?.[inputName]?.[0];
      if (!Array.isArray(choices) || choices.includes(value)) continue;
      issues.push(diagnosticIssue(
        "missing_choice_" + nodeId + "_" + inputName,
        "error",
        "ComfyUI cannot find: " + value,
        "Node " + nodeId + " (" + node.class_type + ") requires this value for " + inputName + ". Install it or update the workflow.",
      ));
    }
  }
  return issues;
}

function workflowLoraNames(workflow) {
  const names = new Set();
  for (const node of Object.values(workflow || {})) {
    if (node?.inputs?.lora_name) names.add(String(node.inputs.lora_name));
    const stored = node?.inputs?.loras?.__value__;
    if (Array.isArray(stored)) {
      for (const item of stored) if (item?.active !== false && item?.name) names.add(String(item.name));
    }
    const text = String(node?.inputs?.text || "");
    for (const match of text.matchAll(/<lora:([^:>]+)(?::[^>]*)?>/gi)) names.add(match[1]);
  }
  return [...names];
}

function normalizedModelName(value) {
  return path.basename(String(value || "")).replace(/\.safetensors$/i, "").toLowerCase();
}

export async function outputFolderIssues(outputDir) {
  if (!outputDir) {
    return [diagnosticIssue("output_not_configured", "warning", "Choose ComfyUI's finished-images folder", "In Image Setup, enter ComfyUI's output folder—usually the folder named output beside its models folder. This is not the models folder. Images can still load while ComfyUI is running, but saved galleries may be unavailable when it is closed.")];
  }
  try {
    const stat = await fs.stat(path.resolve(outputDir));
    if (!stat.isDirectory()) return [diagnosticIssue("output_not_directory", "error", "The finished-images path is not a folder", "Choose ComfyUI's folder named output in Image Setup or AniMessenger Settings. It is separate from the models folder.")];
    return [];
  } catch {
    return [diagnosticIssue("output_missing", "error", "The ComfyUI finished-images folder does not exist", "Correct the output-folder path in Image Setup or Settings. Existing gallery records will remain intact.")];
  }
}

async function readDiagnosticJson(filePath, label, issues) {
  try {
    return await readJson(filePath, label);
  } catch (error) {
    issues.push(diagnosticIssue(label.replace(/\s+/g, "_") + "_unreadable", "error", "The configured " + label + " could not be read", error instanceof Error ? error.message : String(error)));
    return null;
  }
}

export async function diagnoseComfy(config) {
  const issues = await outputFolderIssues(config.comfyOutputDir);
  const workflow = await readDiagnosticJson(config.comfyWorkflowFile, "workflow", issues);
  const mapping = await readDiagnosticJson(config.comfyMappingFile, "workflow mapping", issues);
  let uiWorkflow = null;
  if (workflow && mapping) {
    issues.push(...validateWorkflowMapping(workflow, mapping));
    if (!issues.some((issue) => issue.severity === "error")) {
      setInput(workflow, mapping.fields?.diffusion_model, selectedDiffusionModel(config, mapping), "diffusion model");
    }
    if (mapping.ui_workflow_file) {
      const uiFile = resolveCompanionFile(path.resolve(config.comfyMappingFile), mapping.ui_workflow_file);
      uiWorkflow = await readDiagnosticJson(uiFile, "UI workflow", issues);
      if (uiWorkflow) {
        try { syncUiWorkflow(structuredClone(uiWorkflow), mapping, { positive_prompt: "test", negative_prompt: "test", seed: 1 }); }
        catch (error) { issues.push(diagnosticIssue("ui_mapping_invalid", "error", "The embedded UI workflow mapping is invalid", error instanceof Error ? error.message : String(error))); }
      }
    }
  }

  let online = false;
  if (await checkComfy(config)) {
    online = true;
    try {
      const response = await fetch(config.comfyUrl + "/object_info", { signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error("ComfyUI did not provide its node registry.");
      if (workflow) issues.push(...validateComfyObjectInfo(workflow, await response.json()));
    } catch (error) {
      issues.push(diagnosticIssue("object_info_unavailable", "warning", "ComfyUI node details are unavailable", error instanceof Error ? error.message : String(error)));
    }

    const neededLoras = workflowLoraNames(workflow);
    if (neededLoras.length) {
      try {
        const response = await fetch(config.comfyUrl + "/models/loras", { signal: AbortSignal.timeout(7000) });
        if (response.ok) {
          const available = new Set((await response.json()).map(normalizedModelName));
          for (const lora of neededLoras) {
            if (!available.has(normalizedModelName(lora))) issues.push(diagnosticIssue("missing_lora_" + lora, "error", "Missing LoRA: " + lora, "Install this LoRA in ComfyUI, restart ComfyUI, and recheck."));
          }
        }
      } catch {
        issues.push(diagnosticIssue("lora_list_unavailable", "warning", "Installed LoRAs could not be checked", "The workflow can still be queued, but LoRA compatibility is unknown."));
      }
    }
  } else {
    issues.unshift(diagnosticIssue("comfy_offline", "warning", "ComfyUI is offline", "Start ComfyUI, then recheck. Local workflow and output-folder checks are still shown below."));
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  return {
    online,
    ready: online && errors.length === 0,
    status: !online ? "offline" : errors.length ? "error" : issues.length ? "warning" : "ready",
    summary: !online ? "ComfyUI is offline" : errors.length ? errors.length + " compatibility problem" + (errors.length === 1 ? "" : "s") : issues.length ? "Ready with " + issues.length + " recommendation" + (issues.length === 1 ? "" : "s") : "Ready for ANIMA images",
    issues,
  };
}

function setInput(workflow, field, value, label) {
  if (!field || value === undefined || value === null || value === "") return;
  const nodeId = String(field.node_id ?? field.nodeId ?? "");
  const input = field.input;
  if (!nodeId || !input || !workflow[nodeId]?.inputs) throw new Error("The workflow mapping for " + label + " is invalid.");
  workflow[nodeId].inputs[input] = value;
}

function safeOutputFolder(value) {
  const clean = String(value || "Unknown Character")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/[. ]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (clean || "Unknown Character").slice(0, 80);
}

export function characterImageOutputPrefix(thread, now = new Date()) {
  const characterName = thread?.character?.name || thread?.profile?.name || "Unknown Character";
  const date = now.toISOString().slice(0, 10);
  return ["AniMessenger", safeOutputFolder(characterName), date, "ANIMA"].join("/");
}

function resolveCompanionFile(mappingFile, companionFile) {
  if (!companionFile) return "";
  return path.isAbsolute(companionFile)
    ? companionFile
    : path.resolve(path.dirname(mappingFile), companionFile);
}

export function syncUiWorkflow(uiWorkflow, mapping, values) {
  if (!uiWorkflow) return null;

  for (const [name, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    const field = mapping.fields?.[name];
    if (!field || !Number.isInteger(field.ui_widget_index)) continue;

    const nodeId = String(field.ui_node_id ?? field.node_id ?? "");
    const node = uiWorkflow.nodes?.find((candidate) => String(candidate.id) === nodeId);
    if (!node || !Array.isArray(node.widgets_values)) {
      throw new Error("The UI workflow mapping for " + name + " is invalid.");
    }
    node.widgets_values[field.ui_widget_index] = value;
  }

  return uiWorkflow;
}

export async function queueCharacterImage(config, thread, brief = "", overrides = {}) {
  const workflow = structuredClone(await readJson(config.comfyWorkflowFile, "workflow"));
  const mapping = await readJson(config.comfyMappingFile, "workflow mapping");
  const mappingIssues = validateWorkflowMapping(workflow, mapping);
  if (mappingIssues.length) throw new Error(mappingIssues[0].title + ". " + mappingIssues[0].detail + " Open Settings and run Check image setup.");
  const fields = mapping.fields || {};
  const defaults = mapping.defaults || {};
  const settings = defaults.image_settings || {};
  const diffusionModel = selectedDiffusionModel(config, mapping);
  const visual = effectiveVisual(thread.profile);
  const sceneOutfit = String(thread.scene?.outfit || "").trim();
  const usesDefaultWardrobe = !sceneOutfit
    || sceneOutfit === "default outfit"
    || sceneOutfit === visual.defaultWardrobe;
  const scenePrompt = buildImagePrompt(thread.profile, thread.character, thread.scene, brief, { userName: config.userName });
  const positive = overrides.positivePrompt || [config.globalPositivePrompt, scenePrompt].map((part) => String(part || "").trim()).filter(Boolean).join("\n\n");
  const continuityNegative = mergePromptTags("duplicate person, inconsistent hair, inconsistent eyes, wrong character, default costume when another outfit is requested", CHARACTER_PHOTO_NEGATIVE, visualExceptionNegative(thread.profile));
  const negative = overrides.negativePrompt || mergePromptTags(config.globalNegativePrompt, continuityNegative, overrides.negative);
  const seed = Math.floor(Math.random() * 2147483647);
  const width = overrides.width || settings.width;
  const height = overrides.height || settings.height;
  const filenamePrefix = characterImageOutputPrefix(thread);

  setInput(workflow, fields.positive_prompt, positive, "positive prompt");
  setInput(workflow, fields.negative_prompt, negative, "negative prompt");
  setInput(workflow, fields.seed, seed, "seed");
  setInput(workflow, fields.width, width, "width");
  setInput(workflow, fields.height, height, "height");
  setInput(workflow, fields.steps, settings.steps, "steps");
  setInput(workflow, fields.cfg, settings.cfg, "cfg");
  setInput(workflow, fields.sampler, settings.sampler, "sampler");
  setInput(workflow, fields.scheduler, settings.scheduler, "scheduler");
  setInput(workflow, fields.diffusion_model, diffusionModel, "diffusion model");
  setInput(workflow, fields.filename_prefix, filenamePrefix, "filename prefix");

  let uiWorkflow = null;
  if (mapping.ui_workflow_file) {
    const uiWorkflowFile = resolveCompanionFile(config.comfyMappingFile, mapping.ui_workflow_file);
    uiWorkflow = structuredClone(await readJson(uiWorkflowFile, "UI workflow"));
    syncUiWorkflow(uiWorkflow, mapping, {
      positive_prompt: positive,
      negative_prompt: negative,
      seed,
      width,
      height,
      steps: settings.steps,
      cfg: settings.cfg,
      sampler: settings.sampler,
      scheduler: settings.scheduler,
      diffusion_model: diffusionModel,
      filename_prefix: filenamePrefix,
    });
  }

  const requestBody = {
    prompt: workflow,
    client_id: "animessenger-" + crypto.randomUUID(),
  };
  if (uiWorkflow) {
    requestBody.extra_data = { extra_pnginfo: { workflow: uiWorkflow } };
  }

  let response;
  try {
    response = await fetch(config.comfyUrl + "/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error("ComfyUI is not responding. Start ComfyUI, then use Retry. If it is already open, verify its URL in Settings.");
  }
  if (!response.ok) {
    const raw = (await response.text()).slice(0, 4000);
    let detail = "The workflow did not pass ComfyUI validation.";
    try {
      const rejected = JSON.parse(raw);
      const nodeMessages = Object.values(rejected?.node_errors || {})
        .flatMap((node) => node?.errors || [])
        .map((error) => error?.message || error?.details)
        .filter(Boolean);
      detail = nodeMessages[0] || rejected?.error?.message || rejected?.error || detail;
    } catch {
      if (raw.trim()) detail = raw.trim().slice(0, 240);
    }
    throw new Error("ComfyUI rejected the workflow. " + detail + " Open Settings and run Check image setup.");
  }
  const payload = await response.json();
  if (!payload.prompt_id) throw new Error("ComfyUI did not return a prompt id.");
  return {
    promptId: payload.prompt_id,
    positive,
    negative,
    seed,
    scenePrompt,
    visualIdentity: [...visual.identity, ...visual.signature],
    visualExceptions: visual.exceptions,
    visualDefaultWardrobe: usesDefaultWardrobe ? visual.defaultWardrobe : "",
    sceneOutfit: sceneOutfit && sceneOutfit !== "default outfit" ? sceneOutfit : visual.defaultWardrobe,
  };
}

function firstImage(history, promptId) {
  const record = history?.[promptId] || history;
  for (const node of Object.values(record?.outputs || {})) {
    const image = node?.images?.[0];
    if (image?.filename) return image;
  }
  return null;
}

function historyError(history, promptId) {
  const record = history?.[promptId] || history;
  const messages = record?.status?.messages || [];
  for (const entry of messages) {
    if (entry?.[0] === "execution_error") return entry?.[1]?.exception_message || "ComfyUI generation failed.";
  }
  return null;
}

export async function generationStatus(config, promptId) {
  const response = await fetch(config.comfyUrl + "/history/" + encodeURIComponent(promptId), { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("ComfyUI history is unavailable.");
  const history = await response.json();
  const error = historyError(history, promptId);
  if (error) return { status: "error", error };
  const image = firstImage(history, promptId);
  if (!image) return { status: "pending" };
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder || "",
    type: image.type || "output",
  });
  return { status: "complete", imageUrl: "/api/images/view?" + params.toString() };
}

export async function fetchComfyImage(config, url) {
  let localFailure = null;
  if (config.comfyOutputDir) {
    try {
      const filePath = resolveComfyOutputFile(config.comfyOutputDir, url);
      const extension = path.extname(filePath).toLowerCase();
      const type = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : extension === ".webp" ? "image/webp" : extension === ".gif" ? "image/gif" : "image/png";
      return { body: await fs.readFile(filePath), type };
    } catch (error) {
      localFailure = error;
      // Fall through to ComfyUI for files outside the configured output folder or not yet written.
    }
  }
  const target = new URL("/view", config.comfyUrl);
  for (const key of ["filename", "subfolder", "type"]) {
    const value = url.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  let response;
  try {
    response = await fetch(target, { signal: AbortSignal.timeout(30000) });
  } catch {
    if (localFailure) throw new Error("This image was not found in the configured ComfyUI output folder, and ComfyUI is offline. Correct the output folder in Settings or start ComfyUI.");
    throw new Error("ComfyUI is offline, so this image cannot be loaded yet.");
  }
  if (!response.ok) {
    if (localFailure) throw new Error("This image was not found in the configured output folder or in ComfyUI. Run Check image setup in Settings.");
    throw new Error("The ComfyUI image could not be loaded. Run Check image setup in Settings.");
  }
  return { body: Buffer.from(await response.arrayBuffer()), type: response.headers.get("content-type") || "image/png" };
}

export function resolveComfyOutputFile(outputDir, url) {
  const base = path.resolve(String(outputDir || ""));
  if (!outputDir || url.searchParams.get("type") !== "output") throw new Error("A valid ComfyUI output folder is required.");
  const filename = String(url.searchParams.get("filename") || "");
  if (!filename || path.basename(filename) !== filename) throw new Error("Invalid ComfyUI image filename.");
  const segments = String(url.searchParams.get("subfolder") || "").split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) throw new Error("Invalid ComfyUI image subfolder.");
  const filePath = path.resolve(base, ...segments, filename);
  if (!filePath.startsWith(base + path.sep)) throw new Error("Invalid ComfyUI image path.");
  return filePath;
}
