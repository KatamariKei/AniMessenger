export const bundledComfyWorkflow: string;
export const bundledComfyMapping: string;
export const defaultComfyUrl: string;
export function visualNovelBlock(config: {
  comfyWorkflowFile?: string;
  comfyMappingFile?: string;
  comfyModelsDir?: string;
  comfyOutputDir?: string;
  comfyDiffusionModel?: string;
  comfyUrl?: string;
}, online: boolean, inViewer?: boolean): string;
