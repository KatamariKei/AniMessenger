export const bundledComfyWorkflow = "workflows/anima-recommended-api.json";
export const bundledComfyMapping = "workflows/anima-recommended-api.mapping.json";
export const defaultComfyUrl = "http://127.0.0.1:8188";

export function visualNovelBlock(config, online, inViewer = false) {
  const workflow = config.comfyWorkflowFile?.trim();
  const mapping = config.comfyMappingFile?.trim();
  // A fresh install ships with workflow paths, even if image setup was skipped.
  const hasSavedImageSetup = config.comfyModelsDir?.trim()
    || config.comfyOutputDir?.trim()
    || config.comfyDiffusionModel?.trim()
    || (config.comfyUrl?.trim() && config.comfyUrl.trim().replace(/\/+$/, "") !== defaultComfyUrl)
    || workflow !== bundledComfyWorkflow
    || mapping !== bundledComfyMapping;
  if (!workflow || !mapping || (!online && !hasSavedImageSetup)) {
    return "Set up ComfyUI for Visual Novel. Open your profile, then choose Setup → Run guided setup and follow Image setup.";
  }
  return online ? "" : inViewer ? "Start ComfyUI to resume artwork updates." : "Start ComfyUI to open Visual Novel.";
}
