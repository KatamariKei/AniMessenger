import { readChatResponse } from "./chat-stream";

export type DiscoveryUnlock = { id: string; discoveryId: string; title: string; bondReward: number };

export type AnimaCharacter = {
  id: string;
  name: string;
  /** Local UI label. The canonical catalogue name remains in `name`. */
  displayName?: string;
  series: string;
  trigger: string;
  imageIdentity?: { trigger: string; sourceUrl: string; postCount: number };
  tags: string[];
  thumbUrl?: string;
  imageUrl?: string;
  sourceUrl?: string;
  count?: number;
  sourceProvider?: "danbooru" | "anilist" | "wikidata" | "animadex";
  sourceRefs?: Array<{ title: string; url: string }>;
  catalogNotes?: string[];
  catalogDescription?: string;
  sprite?: string;
  avatarUrl?: string;
};

export type CharacterProfile = {
  imageIdentity?: { trigger: string; sourceUrl: string; postCount: number };
  profileVersion?: number;
  id: string;
  name: string;
  series: string;
  seriesAliases?: string[];
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
    grounding?: { status: "supported" | "limited"; supportedGroups: string[]; sourceCount: number };
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
    characterTensions?: string[];
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
  /** Persistent visible surroundings, separate from the short location label. */
  environment?: string;
  activity: string;
  posture?: "standing" | "seated" | "lying" | "kneeling" | "crouching" | "unknown";
  outfit: string;
  expression: string;
  lighting: string;
  presence?: "apart" | "together" | "uncertain";
  /** Monotonically increases whenever an authoritative scene change commits. */
  revision?: number;
  locationOwner?: "shared" | "character" | "user" | "unknown";
  sharedLocation?: string;
  characterLocation?: string;
  userLocation?: string;
  locationEvidence?: { source: string; kind: string; text: string };
};

export type FirstContactScenario = {
  version: number;
  status: "preview" | "started";
  title: string;
  premise: string;
  contactMode: "remote" | "in_person" | "world_link";
  connection: string;
  scene: SceneState;
  openingLine: string;
  generatedAt: string;
  startedAt?: string | null;
  openingImage?: { status: "pending" | "complete" | "error"; promptId: string; requestedAt?: string | null };
  rejectedOpenings?: Array<{
    title: string;
    premise: string;
    contactMode: "remote" | "in_person" | "world_link";
    location: string;
    connection: string;
  }>;
};

export type Message = {
  id: string;
  from: "user" | "character" | "system";
  /** Character speaker for guest cameos. Missing means the thread's host character. */
  speakerId?: string;
  /** An occasional second-speaker contribution in a guest chat. */
  cameoInterjection?: boolean;
  text?: string;
  /** Story-mode prose passage that absorbs the user turn and character response. */
  narration?: string;
  time: string;
  image?: string;
  generated?: boolean;
  imageContext?: string;
  imageOrigin?: "captured_moment" | "opening_scene";
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
    sceneEnvironment?: string;
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
  eventAt?: string;
  userEdited?: boolean;
  archived?: boolean;
  previousVersions?: { text: string; kind: CharacterMemory["kind"]; sourceMessageIds: string[]; eventAt?: string; updatedAt?: string }[];
};

export type MemoryHealth = {
  total: number; active: number; archived: number; capacityTarget: number; readOnly: true; truncated: boolean;
  counts: { similar: number; possible_resolution: number; low_priority: number };
  flags: { type: "similar" | "possible_resolution" | "low_priority"; memoryIds: string[]; texts: string[]; reason: string; evidence?: { messageId: string; quote: string } }[];
  metrics: { startedAt: string | null; reviews: number; added: number; updated: number; resolved: number; removed: number; recentCreated: number };
};

export type ForgottenCharacterMemory = Pick<CharacterMemory, "kind" | "sourceMessageIds"> & {
  fingerprint: string;
  tokenHashes: string[];
  forgottenAt: string;
};

export type CharacterJourney = {
  mode: "preview" | "active";
  accountPoints: number;
  characterPoints: number;
  achievements: { id: string; title: string; criteria: string; points: number; target: number; progress: number; earned: boolean; earnedAt: string | null }[];
  milestones: { id: string; label: string; earnedAt: string | null; color: string }[];
  discoveries?: { status: "unprepared" | "queued" | "preparing" | "ready" | "limited" | "failed"; discoveryEnabled: boolean; canResearchMore?: boolean;
    history?: { status: "unchecked" | "queued" | "checking" | "complete" | "failed" | "interrupted"; checkedBatches: number; totalBatches: number; confirmed: number; completedAt?: string };
    leadAvailability?: { prepared: number; newAvailable: number; locked: number; nextTrust: number | null };
    leads?: { id: string; clue: string; active: boolean }[];
    revealed?: { id: string; title: string; truth: string; earlier: boolean; bondReward: number; artwork?: { status: "queued" | "preparing" | "generating" | "complete" | "error"; imageUrl?: string } }[] };
};

export type Thread = {
  id: string;
  storageInstanceId?: string;
  storageRevision?: number;
  character: AnimaCharacter;
  profile?: CharacterProfile;
  demeanor?: string;
  firstContact?: FirstContactScenario;
  messages: Message[];
  memories?: CharacterMemory[];
  forgottenMemories?: ForgottenCharacterMemory[];
  memoryBackfilledAt?: string;
  memoryCheckpoint?: {
    lastReviewedMessageId?: string;
    lastReviewedAt?: string;
    lastAttemptAt?: string;
    lastError?: string;
  };
  memoryRevision?: number;
  relationship: number;
  relationshipTier?: string;
  soulboundEarned?: boolean;
  progressionRevision?: number;
  relationshipMilestones?: { id: string; kind: "relationship_tier" | "soulbound"; label: string; sourceMessageId: string; earnedAt: string }[];
  relationshipMomentum?: number;
  unreadCount?: number;
  pinned?: boolean;
  conversationMode?: "chat" | "story";
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
  cameo?: {
    version: number;
    hostCharacterId: string;
    activeGuest: null | { characterId: string; profileId: string; name: string; joinedAtMessageId: string; joinedAt: string };
    encounters: Array<{ id: string; characterId: string; profileId: string; name: string; joinedAtMessageId: string; leftAtMessageId: string; summary: string }>;
  };
};

export type AppConfig = {
  userName?: string;
  userPronouns?: string;
  userAbout?: string;
  userAppearance?: string;
  userAvatarUrl?: string;
  userPortraitPrompt?: string;
  userProfileShared?: boolean;
  ollamaUrl: string;
  chatModel: string;
  profileModel: string;
  visionModel: string;
  ollamaThinking: boolean;
  chatKeepAliveMinutes: number;
  animadexUrl: string;
  comfyUrl: string;
  comfyOutputDir: string;
  comfyModelsDir: string;
  comfyDiffusionModel: string;
  comfyWorkflowFile: string;
  comfyMappingFile: string;
  globalPositivePrompt: string;
  globalNegativePrompt: string;
  researchEnabled: boolean;
  proactiveEnabled: boolean;
  proactivePace: "off" | "relaxed" | "normal" | "lively";
  proactiveDeliveryStart: string;
  proactiveDeliveryEnd: string;
  soundEnabled: boolean;
  soundVolume: number;
  bondSound: "celebration";
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

export type OllamaGpuDiagnostics = {
  status: "ready" | "partial" | "cpu";
  model: string;
  gpuPercent: number;
  cpuPercent: number;
  size: number;
  sizeVram: number;
  contextLength: number;
  otherModels: string[];
  warnings: string[];
  optimized: boolean;
  summary: string;
  detail: string;
};

export type OllamaDownloadOption = {
  model: string;
  tier: "light" | "recommended" | "high-end";
  label: string;
  detail: string;
  approximateBytes: number;
};

export type OllamaInstallJob = {
  id: string;
  model: string;
  status: "queued" | "downloading" | "complete" | "cancelled" | "error";
  message: string;
  totalBytes: number;
  completedBytes: number;
  error?: string;
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

export type ComfyModelCatalog = {
  online: boolean;
  models: string[];
  workflowDefault: string;
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
  requiresCivitaiToken: boolean;
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

async function request<T>(url: string, options?: RequestInit, timeoutMs = 30000, onDraft?: (text: string) => void): Promise<T> {
  try {
    const response = await fetch(url, { ...options, signal: options?.signal ?? AbortSignal.timeout(timeoutMs) });
    const payload = response.headers.get("content-type")?.includes("application/x-ndjson")
      ? await readChatResponse<T>(response, onDraft)
      : await response.json().catch(() => ({}));
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
  warmChat: (characterId: string) => request<{ status: string }>("/api/chat/warm", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ characterId }),
  }, 65000),
  achievementUnlocks: (id: string) => request<{ unlocks: { id: string; title: string; points: number }[] }>(`/api/threads/${encodeURIComponent(id)}/achievements/unlocks`),
  acknowledgeAchievement: (id: string, awardId: string) => request(`/api/threads/${encodeURIComponent(id)}/achievements/unlocks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [awardId] }) }),
  tallyAchievements: () => request<{ points: number; earnedCount: number; achievements: { title: string; characterName: string; points: number; earnedAt: string }[] }>("/api/achievements/tally", { method: "POST" }),
  health: () => request<{ ok: boolean; ollama: boolean; comfy: boolean; animadex: boolean }>("/api/health"),
  immersiveAvailability: () => request<{ comfy: boolean; message: string }>("/api/immersive/availability"),
  visualNovelModels: () => request<{ status: ImagePackStatus | null; modelsDirectory: string }>("/api/immersive/models", undefined, 120000),
  runtime: () => request<{ standalone: boolean; mode: "installed" | "development" | "unmanaged"; canShutdown: boolean }>("/api/runtime"),
  shutdown: () => request<{ ok: boolean }>("/api/runtime/shutdown", { method: "POST" }),
  config: () => request<AppConfig>("/api/config"),
  saveConfig: (config: AppConfig) => request<AppConfig>("/api/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  }),
  models: () => request<OllamaModelCatalog>("/api/ollama/models"),
  recommendedOllamaDownloads: () => request<{ models: OllamaDownloadOption[] }>("/api/ollama/recommended-downloads"),
  installOllamaModel: (options: { ollamaUrl: string; model: string }) => request<OllamaInstallJob>("/api/ollama/install", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options),
  }),
  ollamaInstallStatus: (jobId: string) => request<OllamaInstallJob>(`/api/ollama/install/${encodeURIComponent(jobId)}`),
  cancelOllamaInstall: (jobId: string) => request<OllamaInstallJob>(`/api/ollama/install/${encodeURIComponent(jobId)}`, { method: "POST" }),
  ollamaGpuCheck: (options: { ollamaUrl: string; model: string; optimize?: boolean }) => request<OllamaGpuDiagnostics>("/api/ollama/gpu-check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options),
  }, 300000),
  comfyModels: () => request<ComfyModelCatalog>("/api/comfy/models"),
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
  prepareComfyOutputDirectory: (modelsDirectory: string) => request<{ outputDirectory: string }>("/api/image-assets/output-directory", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ modelsDirectory }),
  }),
  imagePackStatus: (modelsDirectory: string, scope?: "visual-novel") => request<ImagePackStatus>("/api/image-assets/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ modelsDirectory, scope }),
  }, 120000),
  installImagePack: (options: { modelsDirectory: string; acceptedTerms: boolean; apiToken?: string; repair?: boolean; scope?: "visual-novel" }) => request<ImageInstallJob>("/api/image-assets/install", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options),
  }, 120000),
  imageInstallStatus: (jobId: string) => request<ImageInstallJob>(`/api/image-assets/install/${encodeURIComponent(jobId)}`),
  cancelImageInstall: (jobId: string) => request<ImageInstallJob>(`/api/image-assets/install/${encodeURIComponent(jobId)}`, { method: "POST" }),
  threads: () => request<{ threads: Thread[] }>("/api/threads"),
  thread: (characterId: string) => request<{ thread: Thread }>(`/api/threads/${encodeURIComponent(characterId)}`),
  journey: (characterId: string) => request<CharacterJourney>(`/api/threads/${encodeURIComponent(characterId)}/journey`),
  userPortrait: (prompt: string) => request<{ promptId: string }>("/api/user/portrait", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) }),
  userPortraitStatus: (promptId: string) => request<{ status: "pending" | "complete" | "error"; imageUrl?: string; error?: string }>(`/api/user/portrait/${encodeURIComponent(promptId)}`),
  userPortraitAppearance: (imageUrl: string) => request<{ description: string }>("/api/user/portrait/appearance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ imageUrl }) }),
  discoveryArtwork: (characterId: string, discoveryId: string, regenerate = false) => request(`/api/threads/${encodeURIComponent(characterId)}/discoveries/${encodeURIComponent(discoveryId)}/artwork`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ regenerate }) }),
  prepareDiscoveries: (characterId: string, enrich = false, automatic = false) => request<NonNullable<CharacterJourney["discoveries"]>>(`/api/threads/${encodeURIComponent(characterId)}/discoveries/prepare`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enrich, automatic }),
  }),
  checkDiscoveryHistory: (characterId: string) => request<NonNullable<NonNullable<CharacterJourney["discoveries"]>["history"]>>(`/api/threads/${encodeURIComponent(characterId)}/discoveries/history`, { method: "POST" }),
  discoveryUnlocks: (characterId: string) => request<{ unlocks: DiscoveryUnlock[] }>(`/api/threads/${encodeURIComponent(characterId)}/discoveries/unlocks`),
  acknowledgeDiscoveryUnlock: (characterId: string, id: string) => request<{ unlocks: DiscoveryUnlock[] }>(`/api/threads/${encodeURIComponent(characterId)}/discoveries/unlocks`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [id] }),
  }),
  discoveryLeads: (characterId: string, leadId?: string) => request<Pick<NonNullable<CharacterJourney["discoveries"]>, "leads" | "revealed" | "leadAvailability">>(`/api/threads/${encodeURIComponent(characterId)}/discoveries/leads`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leadId }),
  }),
  proactiveCheck: (activeCharacterId?: string) => request<{ thread?: Thread; imageJob?: { promptId: string } }>("/api/proactive/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ activeCharacterId }),
  }),
  markRead: (characterId: string) => request<{ thread: Thread }>(`/api/threads/${encodeURIComponent(characterId)}/read`, {
    method: "POST",
  }),
  pinThread: (characterId: string, pinned: boolean) => request<{ thread: Thread }>(`/api/threads/${encodeURIComponent(characterId)}/pin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pinned }),
  }),
  setConversationMode: (characterId: string, mode: "chat" | "story") => request<{ thread: Thread }>(`/api/threads/${encodeURIComponent(characterId)}/conversation-mode`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode }),
  }),
  setDemeanor: (characterId: string, demeanor: string, expectedStorageInstanceId?: string) => request<{ thread: Thread }>(`/api/threads/${encodeURIComponent(characterId)}/demeanor`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ demeanor, expectedStorageInstanceId }),
  }),
  inviteGuest: (characterId: string, guestCharacterId: string) => request<{ thread: Thread; guest: AnimaCharacter }>(`/api/threads/${encodeURIComponent(characterId)}/guest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ guestCharacterId }),
  }),
  removeGuest: (characterId: string) => request<{ thread: Thread; relatedThread?: Thread }>(`/api/threads/${encodeURIComponent(characterId)}/guest`, {
    method: "DELETE",
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
  addMemory: (characterId: string, memory: Pick<CharacterMemory, "text" | "kind" | "importance"> & { eventAt?: string | null }) => request<{ thread: Thread; alreadySaved: boolean }>(`/api/threads/${encodeURIComponent(characterId)}/memories`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(memory),
  }),
  editMemory: (characterId: string, memoryId: string, memory: Pick<CharacterMemory, "text" | "kind" | "importance"> & { eventAt?: string | null }) => request<{ thread: Thread }>(`/api/threads/${encodeURIComponent(characterId)}/memories/${encodeURIComponent(memoryId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(memory),
  }),
  memoryScanStatus: (characterId: string) => request<{ job: MemoryScanJob | null }>(`/api/threads/${encodeURIComponent(characterId)}/memories/backfill`),
  memoryHealth: (characterId: string) => request<{ health: MemoryHealth }>(`/api/threads/${encodeURIComponent(characterId)}/memories/health`),
  backfillMemories: (characterId: string) => request<{ job: MemoryScanJob }>(`/api/threads/${encodeURIComponent(characterId)}/memories/backfill`, {
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
  profileProgress: (id: string) => request<{ stage: string; completed: number; total: number; startedAt: number; stageStartedAt?: number; stageDurations?: Record<string, number>; modelCalls?: Array<{ label: string; totalMs: number; loadMs: number; promptTokens: number; promptMs: number; outputTokens: number; generationMs: number }>; elapsedMs?: number; failedStage?: string; error?: string } | null>(`/api/characters/profile-progress?id=${encodeURIComponent(id)}`),
  buildProfile: (character: AnimaCharacter, force = false) => request<{ profile: CharacterProfile; thread: Thread; avatarJob?: { promptId: string } }>("/api/characters/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ character, force }),
  }, 900000),
  startFirstContact: (characterId: string) => request<{ thread: Thread }>(`/api/threads/${encodeURIComponent(characterId)}/first-contact/start`, {
    method: "POST",
  }, 180000),
  rerollFirstContact: (characterId: string) => request<{ thread: Thread }>(`/api/threads/${encodeURIComponent(characterId)}/first-contact/reroll`, {
    method: "POST",
  }, 180000),
  generateFirstContactImage: (characterId: string) => request<{ thread: Thread; imageJob?: { promptId: string }; imageWarning?: string }>(`/api/threads/${encodeURIComponent(characterId)}/first-contact/image`, {
    method: "POST",
  }, 60000),
  saveVisualOverrides: (characterId: string, overrides: { identity: string[]; signature: string[]; hiddenSignature?: string[]; exceptions: string[]; defaultWardrobe?: string } | null, currentOutfit?: string, displayName?: string, draftCharacterId = characterId) => request<{ profile: CharacterProfile; thread?: Thread }>("/api/characters/visual-overrides", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ characterId, draftCharacterId, reset: overrides === null, overrides, currentOutfit, displayName }),
  }),
  chat: (characterId: string, text: string, image?: string, clientMessageId?: string, focusSpeakerId?: string, onDraft?: (text: string) => void) => request<{ thread: Thread; reply?: Message; replies?: Message[]; relatedThreads?: Thread[]; imageJob?: { promptId: string }; imageJobs?: Array<{ promptId: string }>; imageWarning?: string; replyWarning?: string; cancelled?: boolean }>("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ characterId, text, image, clientMessageId, focusSpeakerId, ...(onDraft ? { stream: true } : {}) }),
  }, 180000, onDraft),
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
  captureMoment: (characterId: string) => request<{ imageJobs: Array<{ promptId: string }> }>("/api/images/capture-moment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ characterId }),
  }),
  generateAvatar: (characterId: string) => request<{ promptId: string }>("/api/characters/avatar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ characterId }),
  }),
  imageStatus: (promptId: string) => request<{ status: "pending" | "complete" | "error"; imageUrl?: string; error?: string; thread?: Thread }>(`/api/images/status/${encodeURIComponent(promptId)}`),
};

export type MemoryScanJob = {
  id: string; characterId: string; status: "queued" | "running" | "complete" | "error";
  completed: number; total: number; failed: number; added: number;
  startedAt: string; finishedAt?: string; error?: string;
};
