export type AnimaCharacter = {
  id: string;
  name: string;
  /** Local UI label. The original AnimaDex name remains in `name`. */
  displayName?: string;
  series: string;
  trigger: string;
  tags: string[];
  thumbUrl?: string;
  imageUrl?: string;
  sourceUrl?: string;
  count?: number;
  sprite?: string;
  avatarUrl?: string;
};

export type CharacterProfile = {
  profileVersion?: number;
  id: string;
  name: string;
  series: string;
  age: number;
  status: string;
  summary: string;
  socialIdentity?: {
    gender: string;
    pronouns: string;
    selfReference: string;
    /** A verified/manual correction that must survive automatic profile rebuilds. */
    locked?: boolean;
    updatedAt?: string;
  };
  visual: {
    identity: string[];
    signature: string[];
    defaultWardrobe: string;
    wardrobePreferences: string[];
    userOverrides?: {
      identity: string[];
      signature: string[];
      hiddenSignature?: string[];
      exceptions: string[];
      defaultWardrobe?: string;
      updatedAt: string;
    };
  };
  persona: {
    traits: string[];
    mannerisms: string[];
    speechStyle: string;
    baselineVoice?: string;
    emotionalVariations?: string[];
    signatureAccents?: string[];
    avoidPatterns?: string[];
    emotionalRules: string[];
    exampleLines: string[];
  };
  canon: {
    overview: string;
    history: string[];
    relationships: string[];
    knowledge: string[];
    boundaries: string[];
  };
  sources: Array<{ title: string; url: string }>;
};

export type SceneState = {
  location: string;
  activity: string;
  outfit: string;
  expression: string;
  lighting: string;
  presence?: "apart" | "together" | "uncertain";
};

export type Message = {
  id: string;
  from: "user" | "character" | "system";
  text?: string;
  time: string;
  image?: string;
  generated?: boolean;
  imageContext?: string;
  proactive?: boolean;
  proactiveIntent?: "follow_up" | "callback" | "observation" | "activity_update" | "question" | "invitation";
  proactiveTopicKey?: string;
  reaction?: string;
  reactionResponseId?: string;
  reactionRespondedAt?: string;
  reactionResponseReaction?: string;
  reactionResponse?: boolean;
  reactionResponseTo?: string;
  generation?: {
    positive: string;
    negative: string;
    seed: number;
    globalPositive?: string;
    globalNegative?: string;
    visualIdentity?: string[];
    visualExceptions?: string[];
    visualDefaultWardrobe?: string;
    sceneOutfit?: string;
  };
  /** Interface-only delivery state; never required in saved thread data. */
  delivery?: "sending" | "failed";
  retryText?: string;
};

export type CharacterMemory = {
  id: string;
  kind: "user_fact" | "preference" | "shared_event" | "shared_creation" | "promise" | "boundary" | "open_loop";
  text: string;
  keywords: string[];
  importance: number;
  createdAt: string;
  updatedAt: string;
  sourceMessageIds: string[];
};

export type Thread = {
  id: string;
  character: AnimaCharacter;
  profile?: CharacterProfile;
  messages: Message[];
  memories?: CharacterMemory[];
  memoryBackfilledAt?: string;
  relationship: number;
  relationshipMomentum?: number;
  unreadCount?: number;
  proactive?: {
    version?: number;
    nextAt: string | null;
    lastAt: string | null;
    pending: boolean;
    globalNextAt?: string | null;
    recentTopics?: string[];
    pendingFollowUp?: { subject: string; createdAt: string | null; earliestAt: string | null } | null;
    /** Legacy v1 fields retained only while old local data migrates. */
    dailyDate?: string;
    dailyCount?: number;
  };
  photoCadence?: { turnsSincePhoto: number; nextPhotoTurn: number | null };
  scene: SceneState;
  updatedAt: string;
  summary?: boolean;
  messageCount?: number;
  memoryCount?: number;
};

export type AppConfig = {
  userName?: string;
  ollamaUrl: string;
  chatModel: string;
  profileModel: string;
  visionModel: string;
  ollamaThinking: boolean;
  animadexUrl: string;
  comfyUrl: string;
  comfyOutputDir: string;
  comfyModelsDir: string;
  comfyWorkflowFile: string;
  comfyMappingFile: string;
  globalPositivePrompt: string;
  globalNegativePrompt: string;
  researchEnabled: boolean;
  proactiveEnabled: boolean;
  proactivePace: "off" | "relaxed" | "normal" | "lively";
  proactiveDeliveryStart: string;
  proactiveDeliveryEnd: string;
  accentTheme: "signal";
};

export type OllamaModelOption = {
  name: string;
  family: string;
  parameterSize: string;
  quantization: string;
  capabilities: string[];
};

export type OllamaModelCatalog = {
  models: string[];
  options: OllamaModelOption[];
  recommendedChat: string;
  recommendedVision: string;
};

export type ComfyDiagnosticIssue = {
  code: string;
  severity: "error" | "warning" | "info";
  title: string;
  detail: string;
};

export type ComfyDiagnostics = {
  online: boolean;
  ready: boolean;
  status: "ready" | "warning" | "error" | "offline";
  summary: string;
  issues: ComfyDiagnosticIssue[];
};

export type ImagePackAssetStatus = {
  id: string;
  kind: "diffusion_model" | "text_encoder" | "vae" | "lora";
  filename: string;
  bytes: number;
  required: boolean;
  pageUrl: string;
  state: "installed" | "missing" | "invalid";
  detail?: string;
};

export type ImagePackStatus = {
  modelsDirectory: string;
  totalBytes: number;
  requiredDownloadBytes: number;
  availableBytes: number | null;
  allInstalled: boolean;
  assets: ImagePackAssetStatus[];
};

export type ImageInstallJob = {
  id: string;
  status: "queued" | "downloading" | "complete" | "cancelled" | "error";
  modelsDirectory: string;
  totalBytes: number;
  completedBytes: number;
  currentAssetId: string;
  currentFilename: string;
  installedAssetIds: string[];
  error?: string;
};

async function request<T>(url: string, options?: RequestInit, timeoutMs = 30000): Promise<T> {
  try {
    const response = await fetch(url, { ...options, signal: options?.signal ?? AbortSignal.timeout(timeoutMs) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (payload.error) throw new Error(payload.error);
      if ([502, 503, 504].includes(response.status)) {
        throw new Error("AniMessenger's local service is starting or unavailable. Your local data is safe; wait a moment, then retry.");
      }
      throw new Error(`AniMessenger could not complete that request (${response.status}).`);
    }
    return payload as T;
  } catch (reason) {
    if (reason instanceof Error && reason.name === "TimeoutError") {
      throw new Error("The local service took too long to respond. Check that Ollama or ComfyUI is still working, then retry.");
    }
    if (reason instanceof TypeError || (reason instanceof Error && /failed to fetch|networkerror|load failed/i.test(reason.message))) {
      throw new Error("AniMessenger's local service is not responding. Your local data is safe; restart AniMessenger, then retry.");
    }
    throw reason;
  }
}

export const api = {
  health: () => request<{ ok: boolean; ollama: boolean; comfy: boolean; animadex: boolean }>("/api/health"),
  config: () => request<AppConfig>("/api/config"),
  saveConfig: (config: AppConfig) => request<AppConfig>("/api/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  }),
  models: () => request<OllamaModelCatalog>("/api/ollama/models"),
  comfyDiagnostics: (config: AppConfig) => request<ComfyDiagnostics>("/api/comfy/diagnostics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  }),
  detectImageModelsFolders: (modelsDirectory = "", outputDirectory = "") => request<{ candidates: string[] }>("/api/image-assets/detect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ modelsDirectory, outputDirectory }),
  }),
  imagePackStatus: (modelsDirectory: string) => request<ImagePackStatus>("/api/image-assets/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ modelsDirectory }),
  }, 120000),
  installImagePack: (options: { modelsDirectory: string; acceptedTerms: boolean; apiToken?: string; repair?: boolean }) => request<ImageInstallJob>("/api/image-assets/install", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options),
  }, 120000),
  imageInstallStatus: (jobId: string) => request<ImageInstallJob>(`/api/image-assets/install/${encodeURIComponent(jobId)}`),
  cancelImageInstall: (jobId: string) => request<ImageInstallJob>(`/api/image-assets/install/${encodeURIComponent(jobId)}`, { method: "POST" }),
  threads: () => request<{ threads: Thread[] }>("/api/threads"),
  thread: (characterId: string) => request<{ thread: Thread }>(`/api/threads/${encodeURIComponent(characterId)}`),
  proactiveCheck: (activeCharacterId?: string) => request<{ thread?: Thread; imageJob?: { promptId: string } }>("/api/proactive/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ activeCharacterId }),
  }),
  markRead: (characterId: string) => request<{ thread: Thread }>(`/api/threads/${encodeURIComponent(characterId)}/read`, {
    method: "POST",
  }),
  reactToMessage: (characterId: string, messageId: string, reaction: string | null) => request<{ thread: Thread; reactionReply?: Message }>(`/api/threads/${encodeURIComponent(characterId)}/messages/${encodeURIComponent(messageId)}/reaction`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reaction }),
  }),
  retryImage: (characterId: string, messageId: string) => request<{ promptId: string }>(`/api/threads/${encodeURIComponent(characterId)}/messages/${encodeURIComponent(messageId)}/retry-image`, {
    method: "POST",
  }),
  forgetMemory: (characterId: string, memoryId: string) => request<{ thread: Thread }>(`/api/threads/${encodeURIComponent(characterId)}/memories/${encodeURIComponent(memoryId)}`, {
    method: "DELETE",
  }),
  backfillMemories: (characterId: string) => request<{ thread: Thread; added: number }>(`/api/threads/${encodeURIComponent(characterId)}/memories/backfill`, {
    method: "POST",
  }),
  search: (query: string) => request<{ results: AnimaCharacter[]; total: number }>(`/api/characters/search?q=${encodeURIComponent(query)}`),
  startThread: (character: AnimaCharacter) => request<{ thread: Thread }>("/api/threads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ character }),
  }),
  deleteThread: (characterId: string) => request<{ deleted: boolean; id: string }>(`/api/threads/${encodeURIComponent(characterId)}`, {
    method: "DELETE",
  }),
  buildProfile: (character: AnimaCharacter, force = false) => request<{ profile: CharacterProfile; thread: Thread; avatarJob?: { promptId: string } }>("/api/characters/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ character, force }),
  }, 240000),
  saveVisualOverrides: (characterId: string, overrides: { identity: string[]; signature: string[]; hiddenSignature?: string[]; exceptions: string[]; defaultWardrobe?: string } | null, currentOutfit?: string, displayName?: string) => request<{ profile: CharacterProfile; thread?: Thread }>("/api/characters/visual-overrides", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ characterId, reset: overrides === null, overrides, currentOutfit, displayName }),
  }),
  chat: (characterId: string, text: string, image?: string, clientMessageId?: string) => request<{ thread: Thread; reply: Message; imageJob?: { promptId: string }; imageWarning?: string }>("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ characterId, text, image, clientMessageId }),
  }, 180000),
  upload: (dataUrl: string) => request<{ url: string }>("/api/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  }),
  generate: (characterId: string, brief: string) => request<{ promptId: string }>("/api/images/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ characterId, brief }),
  }),
  generateAvatar: (characterId: string) => request<{ promptId: string }>("/api/characters/avatar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ characterId }),
  }),
  imageStatus: (promptId: string) => request<{ status: "pending" | "complete" | "error"; imageUrl?: string; error?: string; thread?: Thread }>(`/api/images/status/${encodeURIComponent(promptId)}`),
};
