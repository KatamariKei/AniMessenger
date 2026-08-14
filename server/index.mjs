import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { checkAnimaDex, searchCharacters } from "./animadex.mjs";
import { checkComfy, diagnoseComfy, fetchComfyImage, generationStatus, listComfyDiffusionModels, queueCharacterImage } from "./comfy.mjs";
import { recoverClientTurn } from "./chat-recovery.mjs";
import { appHomeDir, dataDir, readConfig, rootDir, writeConfig } from "./config.mjs";
import { applyDisplayName } from "./display-name.mjs";
import { appendCameoMessage, cameoInterjectionEligible, cameoPromptContext, GUEST_CAMEO_VERSION, normalizeCameoState, resumeCameoSession, routeCameoSpeakers, summarizeCameoEncounter, threadForCameoSpeaker } from "./guest-cameo.mjs";
import { inferOutfitCorrection, inferSceneCue, portraitExpression, portraitWardrobe } from "./identity.mjs";
import { loadImageJobEntries, saveImageJobEntries } from "./image-job-store.mjs";
import { findRetryableImageMessage, replaceRetriedImage, retryPromptOverrides } from "./image-retry.mjs";
import { buildCharacterProfile, chatAsCharacter, checkOllama, enforceAdultCharacterProfile, extractHistoricalMemories, generateProactiveOutreach, generateReactionFollowup, listOllamaModelOptions } from "./ollama.mjs";
import { diagnoseOllamaGpu } from "./ollama-diagnostics.mjs";
import { forgetMemory, mergeMemories } from "./memory.mjs";
import { advancePhotoCadence, postponePhotoCadence, resetPhotoCadence } from "./photo-cadence.mjs";
import { isExplicitPhotoRequest } from "./photo-request.mjs";
import { canProactivelyReachOut, globalProactiveNextAt, normalizeProactiveState, proactiveCandidateScore, recordProactiveAttempt, scheduleNextProactive, shouldAttachProactiveImage, updatePendingFollowUp } from "./proactive.mjs";
import { presenceSceneCue } from "./presence.mjs";
import { appendReactionResponse, applyMessageReaction, canTriggerReactionResponse, shouldRespondToReaction } from "./reactions.mjs";
import { applyRelationshipDelta } from "./relationship.mjs";
import { researchCharacter } from "./research.mjs";
import { createThread, deleteThread, listThreads, listThreadSummaries, loadProfile, loadThread, readLocalAsset, saveProfile, saveThread, saveUpload } from "./store.mjs";
import { applyVisualOverrides, effectiveVisual, preserveVisualOverrides } from "./visual-overrides.mjs";
import { cancelImagePackInstall, detectComfyModelsDirectories, imagePackInstallStatus, imagePackStatus, prepareComfyOutputDirectory, readImageAssetManifest, startImagePackInstall } from "./image-installer.mjs";
import { normalizeWardrobePrompt } from "./wardrobe.mjs";

const port = Number(process.env.PORT || 5174);
const host = process.env.HOST || "127.0.0.1";
const serveDist = process.argv.includes("--serve-dist");
const standalone = Boolean(process.env.ANIMESSENGER_HOME && serveDist);
const managedDevelopment = process.env.ANIMESSENGER_DEV_MANAGED === "1";
const canShutdown = standalone || managedDevelopment;
const imageJobs = new Map(await loadImageJobEntries());
const imageCompletionJobs = new Map();
const imageRecoveryCheckedAt = new Map();
const reactionResponseJobs = new Set();

async function rememberImageJob(promptId, job) {
  imageJobs.set(promptId, { ...job, updatedAt: new Date().toISOString() });
  await saveImageJobEntries(imageJobs.entries());
}

function generationMetadata(job, currentConfig) {
  return {
    positive: job.positive,
    negative: job.negative,
    seed: job.seed,
    scenePrompt: job.scenePrompt || "",
    globalPositive: String(currentConfig.globalPositivePrompt || ""),
    globalNegative: String(currentConfig.globalNegativePrompt || ""),
    visualIdentity: job.visualIdentity || [],
    visualExceptions: job.visualExceptions || [],
    visualDefaultWardrobe: job.visualDefaultWardrobe || "",
    sceneOutfit: job.sceneOutfit || "",
  };
}
let proactiveCheckInFlight = false;

function sendJson(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  });
  response.end(JSON.stringify(value));
}

function sendBuffer(response, status, body, type) {
  response.writeHead(status, { "content-type": type, "cache-control": "private, max-age=3600" });
  response.end(body);
}

function isLoopbackOrigin(request) {
  const origin = request.headers.origin || request.headers.referer;
  if (!origin) return true;
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  } catch {
    return false;
  }
}

async function jsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 35 * 1024 * 1024) throw new Error("The request is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function nowMessage(from, text, extra = {}) {
  return {
    id: crypto.randomUUID(),
    from,
    ...(text ? { text } : {}),
    ...extra,
    time: new Date().toISOString(),
  };
}

function characterDisplayNameForServer(character) {
  return String(character?.displayName || character?.name || "Guest").replace(/\s+/g, " ").trim().slice(0, 100);
}

function mergeScene(existing, update) {
  const next = { ...existing };
  for (const key of ["location", "activity", "outfit", "expression", "lighting", "presence"]) {
    if (typeof update?.[key] === "string" && update[key].trim()) next[key] = update[key].trim();
  }
  return next;
}

async function ensureProfile(config, character, force = false) {
  const cached = await loadProfile(character.id);
  if (!force) {
    if (cached) {
      const adultProfile = enforceAdultCharacterProfile(cached);
      return adultProfile.age === cached.age ? adultProfile : saveProfile(adultProfile);
    }
  }
  const research = await researchCharacter(character, config.researchEnabled);
  const rebuilt = await buildCharacterProfile(config, character, research);
  return saveProfile(preserveVisualOverrides(rebuilt, cached));
}

async function queueAvatarJob(config, thread) {
  const portraitThread = {
    ...thread,
    scene: {
      location: "simple neutral charcoal-gray studio background, dark gray but not black",
      activity: "posing naturally for a profile picture",
      outfit: portraitWardrobe(effectiveVisual(thread.profile).defaultWardrobe) + ", upper garment and neckline details only",
      expression: portraitExpression(thread.profile.persona),
      lighting: "soft flattering portrait lighting",
    },
  };
  const job = await queueCharacterImage(
    config,
    portraitThread,
    "square profile picture, close-up character portrait, close-up face, face focus, naturally framed around the shoulders and upper chest, clothed torso continues naturally beyond the bottom edge of the image, shoulders partially visible, face fills about two-thirds of the frame, head near the top with a small margin, centered face, looking toward viewer, face fully visible, clean social messaging avatar composition, plain neutral charcoal-gray background, dark gray background, subtle tonal depth, no white backdrop",
    {
      width: 1024,
      height: 1024,
      negative: "full body, three-quarter body, waist-up shot, medium shot, upper-body composition, distant subject, small face, excessive background, visible hands, cropped head, face out of frame, extreme angle, multiple panels, statue, sculpture, marble bust, pedestal, mannequin, severed torso, abrupt chest cutoff, exaggerated expression, screaming, crying, distorted face, white background, bright background, pure black background",
    },
  );
  await rememberImageJob(job.promptId, {
    kind: "avatar",
    characterId: thread.id,
    appended: false,
  });
  return job;
}

async function completeImageJob(config, promptId, status) {
  const existing = imageCompletionJobs.get(promptId);
  if (existing) return existing;
  const completion = completeImageJobUnlocked(config, promptId, status);
  imageCompletionJobs.set(promptId, completion);
  try {
    return await completion;
  } finally {
    if (imageCompletionJobs.get(promptId) === completion) imageCompletionJobs.delete(promptId);
  }
}

async function completeImageJobUnlocked(config, promptId, status) {
  const job = imageJobs.get(promptId);
  if (!job) return null;
  const thread = await loadThread(job.characterId);
  if (!thread) return null;
  // Multiple browser tabs, an active watcher, and background recovery can all
  // observe the same completed Comfy job. Reconnect every observer to the
  // owning thread instead of returning a bare completion that looks like a new
  // gallery image to the client.
  if (job.appended) return thread;
  if (status.status === "error" && job.kind === "proactive") {
    const message = nowMessage("character", job.caption || "", {
      proactive: true,
      proactiveIntent: job.proactiveIntent,
      proactiveTopicKey: job.proactiveTopicKey,
    });
    const saved = await saveThread({
      ...thread,
      unreadCount: job.markUnread ? 1 : 0,
      proactive: { ...normalizeProactiveState(thread.proactive), pending: false },
      messages: [...thread.messages, message],
    });
    await rememberImageJob(promptId, { ...job, appended: true });
    return saved;
  }
  if (status.status !== "complete") return null;
  if (job.kind === "avatar") {
    const saved = await saveThread({
      ...thread,
      character: { ...thread.character, avatarUrl: status.imageUrl },
    });
    await rememberImageJob(promptId, { ...job, appended: true });
    return saved;
  }
  if (job.kind === "retry") {
    const saved = await saveThread(replaceRetriedImage(thread, job.messageId, status.imageUrl, job.generation));
    await rememberImageJob(promptId, { ...job, appended: true });
    return saved;
  }
  const message = nowMessage("character", job.caption || "", {
    image: status.imageUrl,
    generated: true,
    ...(job.speakerId ? { speakerId: job.speakerId } : {}),
    ...(job.kind === "proactive" ? { proactive: true } : {}),
    ...(job.kind === "proactive" && job.proactiveIntent ? { proactiveIntent: job.proactiveIntent } : {}),
    ...(job.kind === "proactive" && job.proactiveTopicKey ? { proactiveTopicKey: job.proactiveTopicKey } : {}),
    ...(job.imageContext ? { imageContext: job.imageContext } : {}),
    generation: job.generation,
  });
  const saved = await saveThread({
    ...thread,
    ...(job.kind === "proactive" ? {
      unreadCount: job.markUnread ? 1 : 0,
      proactive: { ...normalizeProactiveState(thread.proactive), pending: false },
    } : {}),
    messages: [...thread.messages, message],
  });
  await rememberImageJob(promptId, { ...job, appended: true });
  return saved;
}

let imageRecoveryInFlight = false;
async function recoverCompletedImageJobs() {
  if (imageRecoveryInFlight) return;
  const now = Date.now();
  const pending = [...imageJobs.entries()].filter(([promptId, job]) => {
    if (job.appended) return false;
    const age = now - new Date(job.updatedAt || 0).getTime();
    const retryAfter = age < 30 * 60 * 1000 ? 10_000 : 5 * 60 * 1000;
    return now - (imageRecoveryCheckedAt.get(promptId) || 0) >= retryAfter;
  });
  if (!pending.length) return;
  imageRecoveryInFlight = true;
  try {
    const config = await readConfig();
    for (const [promptId, job] of pending) {
      imageRecoveryCheckedAt.set(promptId, Date.now());
      try {
        const status = await generationStatus(config, promptId);
        if (status.status === "complete" || (status.status === "error" && job.kind === "proactive")) {
          await completeImageJob(config, promptId, status);
          imageRecoveryCheckedAt.delete(promptId);
        }
      } catch {
        // ComfyUI may be offline or still starting. The durable job remains for the next pass.
      }
    }
  } finally {
    imageRecoveryInFlight = false;
  }
}

async function checkProactiveOutreach(config, activeCharacterId) {
  if (!config.proactiveEnabled || config.proactivePace === "off" || proactiveCheckInFlight) return {};
  proactiveCheckInFlight = true;
  const now = new Date();
  try {
    let threads = await listThreads();
    const prepared = [];
    for (const original of threads) {
      const normalized = normalizeProactiveState(original.proactive, now);
      const proactive = normalized.nextAt || !original.profile
        ? normalized
        : scheduleNextProactive(normalized, original.relationship, config.proactivePace, now);
      const next = original.unreadCount === undefined || JSON.stringify(proactive) !== JSON.stringify(original.proactive)
        ? await saveThread({ ...original, unreadCount: Math.max(0, Number(original.unreadCount) || 0), proactive })
        : original;
      prepared.push(next);
    }
    threads = prepared;
    const proactiveContext = {
      globalUnreadCount: threads.reduce((sum, thread) => sum + (Number(thread.unreadCount) > 0 ? 1 : 0), 0),
      globalNextAt: globalProactiveNextAt(threads),
      pace: config.proactivePace,
      deliveryStart: config.proactiveDeliveryStart,
      deliveryEnd: config.proactiveDeliveryEnd,
    };
    const due = threads
      .filter((thread) => !normalizeCameoState(thread.cameo, thread.character?.id)?.activeGuest)
      .filter((thread) => canProactivelyReachOut(thread, proactiveContext, now))
      .sort((a, b) => proactiveCandidateScore(b, now) - proactiveCandidateScore(a, now));
    const dueCandidate = due[0];
    if (!dueCandidate) return {};
    const candidate = {
      ...dueCandidate,
      scene: mergeScene(dueCandidate.scene, presenceSceneCue(dueCandidate, "")),
    };

    // One opportunity per check. Other overdue threads get a fresh future time,
    // which prevents a burst of offline catch-up messages after the app reopens.
    for (const waiting of due.slice(1)) {
      await saveThread({
        ...waiting,
        proactive: scheduleNextProactive(waiting.proactive, waiting.relationship, config.proactivePace, now),
      });
    }

    try {
      const outreach = await generateProactiveOutreach(config, candidate, now);
      const withImage = shouldAttachProactiveImage(candidate.relationship, outreach.visualCandidate);
      const proactive = recordProactiveAttempt(
        candidate.proactive,
        candidate.relationship,
        config.proactivePace,
        now,
        withImage,
        Math.random,
        { topicKey: outreach.topicKey, resolvesFollowUp: outreach.resolvesFollowUp },
      );
      const markUnread = candidate.id !== activeCharacterId;
      const nextScene = candidate.scene?.presence === "together"
        ? candidate.scene
        : mergeScene(candidate.scene, outreach.scenePatch);
      if (withImage && config.comfyWorkflowFile && config.comfyMappingFile) {
        try {
          const job = await queueCharacterImage(config, { ...candidate, scene: nextScene }, outreach.photoBrief || "a candid visual update");
          const saved = await saveThread({
            ...candidate,
            scene: nextScene,
            proactive,
            photoCadence: resetPhotoCadence(candidate.relationship),
          });
          await rememberImageJob(job.promptId, {
            kind: "proactive",
            characterId: candidate.id,
            appended: false,
            caption: outreach.text,
            imageContext: outreach.photoBrief,
            proactiveIntent: outreach.intent,
            proactiveTopicKey: outreach.topicKey,
            markUnread,
            generation: generationMetadata(job, config),
          });
          return { thread: saved, imageJob: { promptId: job.promptId } };
        } catch {
          // Preserve the outreach as text when ComfyUI is unavailable.
        }
      }

      const message = nowMessage("character", outreach.text, {
        proactive: true,
        proactiveIntent: outreach.intent,
        proactiveTopicKey: outreach.topicKey,
      });
      const saved = await saveThread({
        ...candidate,
        scene: nextScene,
        unreadCount: markUnread ? 1 : 0,
        proactive: { ...proactive, pending: false },
        messages: [...candidate.messages, message],
      });
      return { thread: saved };
    } catch {
      const saved = await saveThread({
        ...candidate,
        proactive: scheduleNextProactive(candidate.proactive, candidate.relationship, config.proactivePace, now),
      });
      return { thread: saved };
    }
  } finally {
    proactiveCheckInFlight = false;
  }
}

async function handleApi(request, response, url) {
  const config = await readConfig();

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/runtime") {
    sendJson(response, 200, {
      standalone,
      mode: standalone ? "installed" : managedDevelopment ? "development" : "unmanaged",
      canShutdown: canShutdown && isLoopbackOrigin(request),
    });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/runtime/shutdown") {
    if (!canShutdown || !isLoopbackOrigin(request)) {
      sendJson(response, 403, { error: "Shutdown is only available on the computer hosting AniMessenger." });
      return true;
    }
    sendJson(response, 200, { ok: true });
    setTimeout(() => {
      void fs.rm(path.join(appHomeDir, "runtime", "server.pid"), { force: true }).catch(() => undefined);
      if (managedDevelopment) {
        try { process.kill(process.ppid, "SIGTERM"); } catch {}
      }
      server.close(() => process.exit(0));
      server.closeAllConnections?.();
      setTimeout(() => process.exit(0), 750).unref();
    }, 150).unref();
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/health") {
    const [ollama, comfy, animadex] = await Promise.all([checkOllama(config), checkComfy(config), checkAnimaDex(config)]);
    sendJson(response, 200, { ok: true, ollama, comfy, animadex });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/comfy/diagnostics") {
    const candidate = { ...config, ...(await jsonBody(request)) };
    sendJson(response, 200, await diagnoseComfy(candidate));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/comfy/models") {
    sendJson(response, 200, await listComfyDiffusionModels(config));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/image-assets/detect") {
    const body = await jsonBody(request);
    const manifest = await readImageAssetManifest(rootDir);
    const candidates = await detectComfyModelsDirectories({
      configured: body.modelsDirectory || config.comfyModelsDir,
      outputDirectory: body.outputDirectory || config.comfyOutputDir,
      projectRoot: rootDir,
      manifest,
    });
    sendJson(response, 200, { candidates });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/image-assets/output-directory") {
    if (!isLoopbackOrigin(request)) {
      sendJson(response, 403, { error: "For safety, prepare ComfyUI folders from AniMessenger on the host computer, not through the phone/LAN view." });
      return true;
    }
    const body = await jsonBody(request);
    sendJson(response, 200, {
      outputDirectory: await prepareComfyOutputDirectory({
        modelsDirectory: body.modelsDirectory || config.comfyModelsDir,
        comfyUrl: config.comfyUrl,
      }),
    });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/image-assets/status") {
    const body = await jsonBody(request);
    const manifest = await readImageAssetManifest(rootDir);
    sendJson(response, 200, await imagePackStatus(manifest, body.modelsDirectory || config.comfyModelsDir));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/image-assets/install") {
    if (!isLoopbackOrigin(request)) {
      sendJson(response, 403, { error: "For safety, install model files from AniMessenger on the host computer, not through the phone/LAN view." });
      return true;
    }
    const body = await jsonBody(request);
    const manifest = await readImageAssetManifest(rootDir);
    sendJson(response, 202, await startImagePackInstall(manifest, body));
    return true;
  }
  const imageInstallMatch = /^\/api\/image-assets\/install\/([^/]+)$/.exec(url.pathname);
  if (request.method === "GET" && imageInstallMatch) {
    sendJson(response, 200, imagePackInstallStatus(decodeURIComponent(imageInstallMatch[1])));
    return true;
  }
  if (request.method === "POST" && imageInstallMatch) {
    sendJson(response, 200, cancelImagePackInstall(decodeURIComponent(imageInstallMatch[1])));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/config") {
    sendJson(response, 200, config);
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/config") {
    sendJson(response, 200, await writeConfig(await jsonBody(request)));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/ollama/models") {
    sendJson(response, 200, await listOllamaModelOptions(config));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/ollama/gpu-check") {
    if (!isLoopbackOrigin(request)) {
      sendJson(response, 403, { error: "Run the GPU performance check on the computer hosting AniMessenger." });
      return true;
    }
    const body = await jsonBody(request);
    sendJson(response, 200, await diagnoseOllamaGpu({ ...config, ollamaUrl: body.ollamaUrl || config.ollamaUrl }, {
      model: body.model || config.chatModel,
      optimize: Boolean(body.optimize),
    }));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/characters/search") {
    sendJson(response, 200, await searchCharacters(config, url.searchParams.get("q") || "", Number(url.searchParams.get("page") || 1)));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/threads") {
    sendJson(response, 200, { threads: await listThreadSummaries() });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/proactive/check") {
    const body = await jsonBody(request);
    sendJson(response, 200, await checkProactiveOutreach(config, String(body.activeCharacterId || "")));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/threads") {
    const body = await jsonBody(request);
    if (!body.character?.id) throw new Error("Choose a character first.");
    sendJson(response, 200, { thread: await createThread(body.character) });
    return true;
  }
  const getThreadMatch = /^\/api\/threads\/([^/]+)$/.exec(url.pathname);
  if (request.method === "GET" && getThreadMatch) {
    const id = decodeURIComponent(getThreadMatch[1]);
    const thread = await loadThread(id);
    if (!thread) throw new Error("That conversation no longer exists.");
    sendJson(response, 200, { thread });
    return true;
  }
  const deleteThreadMatch = /^\/api\/threads\/([^/]+)$/.exec(url.pathname);
  if (request.method === "DELETE" && deleteThreadMatch) {
    const id = decodeURIComponent(deleteThreadMatch[1]);
    if (!await deleteThread(id)) throw new Error("That conversation no longer exists.");
    sendJson(response, 200, { deleted: true, id });
    return true;
  }
  const readThreadMatch = /^\/api\/threads\/([^/]+)\/read$/.exec(url.pathname);
  if (request.method === "POST" && readThreadMatch) {
    const id = decodeURIComponent(readThreadMatch[1]);
    const thread = await loadThread(id);
    if (!thread) throw new Error("That conversation no longer exists.");
    sendJson(response, 200, { thread: await saveThread({ ...thread, unreadCount: 0 }) });
    return true;
  }
  const guestMatch = /^\/api\/threads\/([^/]+)\/guest$/.exec(url.pathname);
  if (request.method === "POST" && guestMatch) {
    const id = decodeURIComponent(guestMatch[1]);
    const body = await jsonBody(request);
    const thread = await loadThread(id);
    if (!thread?.profile) throw new Error("Open a ready character conversation before inviting a guest.");
    const guestId = String(body.guestCharacterId || "").trim();
    if (!guestId || guestId === thread.character.id) throw new Error("Choose another researched character as the guest.");
    const [guestThread, guestProfile] = await Promise.all([loadThread(guestId), loadProfile(guestId)]);
    if (!guestThread?.character || !guestProfile) throw new Error("That guest needs a completed local profile first.");
    const currentCameo = normalizeCameoState(thread.cameo, thread.character.id);
    if (currentCameo?.activeGuest) throw new Error("End the current guest encounter before inviting someone else.");
    const joined = nowMessage("system", characterDisplayNameForServer(guestThread.character) + " joined this chat.");
    const activeGuest = {
      characterId: guestThread.character.id,
      profileId: guestProfile.id || guestThread.character.id,
      name: characterDisplayNameForServer(guestThread.character),
      joinedAtMessageId: joined.id,
      joinedAt: joined.time,
    };
    const encounter = {
      id: joined.id,
      characterId: activeGuest.characterId,
      profileId: activeGuest.profileId,
      name: activeGuest.name,
      joinedAtMessageId: joined.id,
      leftAtMessageId: "",
      summary: "",
    };
    const saved = await saveThread({
      ...thread,
      messages: [...thread.messages, joined],
      cameo: {
        version: GUEST_CAMEO_VERSION,
        hostCharacterId: thread.character.id,
        activeGuest,
        encounters: [...(currentCameo?.encounters || []), encounter],
      },
    });
    sendJson(response, 200, { thread: saved, guest: guestThread.character });
    return true;
  }
  if (request.method === "DELETE" && guestMatch) {
    const id = decodeURIComponent(guestMatch[1]);
    const thread = await loadThread(id);
    if (!thread) throw new Error("That conversation no longer exists.");
    const cameo = normalizeCameoState(thread.cameo, thread.character.id);
    if (!cameo?.activeGuest) {
      sendJson(response, 200, { thread });
      return true;
    }
    const left = nowMessage("system", cameo.activeGuest.name + " left this chat.");
    const summary = summarizeCameoEncounter(thread, cameo.activeGuest);
    const encounters = cameo.encounters.map((encounter) => encounter.joinedAtMessageId === cameo.activeGuest.joinedAtMessageId
      ? { ...encounter, leftAtMessageId: left.id, summary }
      : encounter);
    const saved = await saveThread({
      ...thread,
      messages: [...thread.messages, left],
      memories: mergeMemories(thread.memories, [{ kind: "shared_event", text: summary, importance: 3 }], left.id),
      cameo: { ...cameo, activeGuest: null, encounters },
    });
    let relatedThread;
    try {
      const guestThread = await loadThread(cameo.activeGuest.characterId);
      if (guestThread) {
        relatedThread = await saveThread({
          ...guestThread,
          memories: mergeMemories(guestThread.memories, [{ kind: "shared_event", text: summary, importance: 3 }], left.id),
        });
      }
    } catch (error) {
      console.warn("Guest encounter carryover skipped:", error instanceof Error ? error.message : error);
    }
    sendJson(response, 200, { thread: saved, ...(relatedThread ? { relatedThread } : {}) });
    return true;
  }
  const reactionMatch = /^\/api\/threads\/([^/]+)\/messages\/([^/]+)\/reaction$/.exec(url.pathname);
  if (request.method === "POST" && reactionMatch) {
    const id = decodeURIComponent(reactionMatch[1]);
    const messageId = decodeURIComponent(reactionMatch[2]);
    const thread = await loadThread(id);
    if (!thread) throw new Error("That conversation no longer exists.");
    const body = await jsonBody(request);
    const targetMessage = thread.messages.find((message) => message.id === messageId);
    const jobKey = id + ":" + messageId;
    const canRespond = canTriggerReactionResponse(targetMessage, body.reaction)
      && !reactionResponseJobs.has(jobKey)
      && shouldRespondToReaction(body.reaction);
    const reactedThread = await saveThread(applyMessageReaction(thread, messageId, body.reaction));
    if (!canRespond) {
      sendJson(response, 200, { thread: reactedThread });
      return true;
    }
    reactionResponseJobs.add(jobKey);
    try {
      const reply = await generateReactionFollowup(config, reactedThread, targetMessage, body.reaction);
      const latestThread = await loadThread(id);
      const latestTarget = latestThread?.messages.find((message) => message.id === messageId);
      if (!latestThread || latestTarget?.reactionResponseId || latestTarget?.reaction !== body.reaction) {
        sendJson(response, 200, { thread: latestThread || reactedThread });
        return true;
      }
      const reactionReply = nowMessage("character", reply);
      const respondedThread = await saveThread(appendReactionResponse(latestThread, messageId, body.reaction, reactionReply));
      sendJson(response, 200, { thread: respondedThread, reactionReply });
    } catch (error) {
      console.warn("Reaction follow-up skipped:", error instanceof Error ? error.message : error);
      sendJson(response, 200, { thread: await loadThread(id) || reactedThread });
    } finally {
      reactionResponseJobs.delete(jobKey);
    }
    return true;
  }
  const retryImageMatch = /^\/api\/threads\/([^/]+)\/messages\/([^/]+)\/retry-image$/.exec(url.pathname);
  if (request.method === "POST" && retryImageMatch) {
    const id = decodeURIComponent(retryImageMatch[1]);
    const messageId = decodeURIComponent(retryImageMatch[2]);
    const thread = await loadThread(id);
    if (!thread?.profile) throw new Error("That character profile is not ready yet.");
    const message = findRetryableImageMessage(thread, messageId);
    let imageThread = thread;
    if (message.speakerId && message.speakerId !== thread.character.id) {
      const [speakerThread, speakerProfile] = await Promise.all([
        loadThread(message.speakerId),
        loadProfile(message.speakerId),
      ]);
      if (!speakerThread?.character || !speakerProfile) throw new Error("That guest character profile is no longer available.");
      imageThread = { ...thread, character: speakerThread.character, profile: speakerProfile };
    }
    const job = await queueCharacterImage(
      config,
      imageThread,
      message.imageContext || "a candid message photo",
      retryPromptOverrides(message, imageThread.character, config, imageThread.profile, imageThread.scene?.outfit),
    );
    await rememberImageJob(job.promptId, {
      kind: "retry",
      characterId: thread.id,
      messageId,
      appended: false,
      generation: generationMetadata(job, config),
    });
    sendJson(response, 200, { promptId: job.promptId });
    return true;
  }
  const forgetMemoryMatch = /^\/api\/threads\/([^/]+)\/memories\/([^/]+)$/.exec(url.pathname);
  if (request.method === "DELETE" && forgetMemoryMatch) {
    const id = decodeURIComponent(forgetMemoryMatch[1]);
    const memoryId = decodeURIComponent(forgetMemoryMatch[2]);
    const thread = await loadThread(id);
    if (!thread) throw new Error("That conversation no longer exists.");
    sendJson(response, 200, { thread: await saveThread({ ...thread, memories: forgetMemory(thread.memories, memoryId) }) });
    return true;
  }
  const backfillMemoryMatch = /^\/api\/threads\/([^/]+)\/memories\/backfill$/.exec(url.pathname);
  if (request.method === "POST" && backfillMemoryMatch) {
    const id = decodeURIComponent(backfillMemoryMatch[1]);
    const thread = await loadThread(id);
    if (!thread?.profile) throw new Error("That character profile is not ready yet.");
    if (thread.memoryBackfilledAt) {
      sendJson(response, 200, { thread, added: 0 });
      return true;
    }
    const before = Array.isArray(thread.memories) ? thread.memories.length : 0;
    const candidates = await extractHistoricalMemories(config, thread);
    const memories = mergeMemories(thread.memories, candidates, undefined);
    const saved = await saveThread({ ...thread, memories, memoryBackfilledAt: new Date().toISOString() });
    sendJson(response, 200, { thread: saved, added: Math.max(0, memories.length - before) });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/characters/profile") {
    const body = await jsonBody(request);
    if (!body.character?.id) throw new Error("Choose a character first.");
    const profile = await ensureProfile(config, body.character, Boolean(body.force));
    const current = await createThread(body.character);
    const hasOpening = current.messages.some((message) => message.from === "character");
    const messages = hasOpening ? current.messages : [
      ...current.messages,
      nowMessage("character", profile.openingLine || "You're here."),
    ];
    const scene = current.scene.outfit === "default outfit"
      ? { ...current.scene, outfit: effectiveVisual(profile).defaultWardrobe }
      : current.scene;
    const thread = await saveThread({ ...current, profile, scene, messages });
    let avatarJob;
    if (!thread.character.avatarUrl && config.comfyWorkflowFile && config.comfyMappingFile) {
      try {
        avatarJob = await queueAvatarJob(config, thread);
      } catch {
        avatarJob = undefined;
      }
    }
    sendJson(response, 200, { profile, thread, ...(avatarJob ? { avatarJob: { promptId: avatarJob.promptId } } : {}) });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/characters/visual-overrides") {
    const body = await jsonBody(request);
    if (!body.characterId) throw new Error("Choose a character first.");
    const thread = await loadThread(body.characterId);
    const cached = await loadProfile(body.characterId);
    const source = cached || thread?.profile;
    if (!source) throw new Error("Build the character profile before editing its visual identity.");
    const profile = await saveProfile(applyVisualOverrides(source, body.reset ? null : body.overrides));
    const requestedCurrentOutfit = typeof body.currentOutfit === "string"
      ? normalizeWardrobePrompt(body.currentOutfit).slice(0, 500)
      : "";
    const savedThread = thread ? await saveThread({
      ...thread,
      character: Object.hasOwn(body, "displayName")
        ? applyDisplayName(thread.character, body.displayName)
        : thread.character,
      profile,
      scene: requestedCurrentOutfit
        ? { ...thread.scene, outfit: requestedCurrentOutfit }
        : thread.scene,
    }) : null;
    sendJson(response, 200, { profile, ...(savedThread ? { thread: savedThread } : {}) });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/characters/avatar") {
    const body = await jsonBody(request);
    const thread = await loadThread(body.characterId);
    if (!thread?.profile) throw new Error("Build the character profile before generating its portrait.");
    const job = await queueAvatarJob(config, thread);
    sendJson(response, 200, { promptId: job.promptId });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/uploads") {
    const body = await jsonBody(request);
    sendJson(response, 200, { url: await saveUpload(body.dataUrl) });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/chat") {
    const body = await jsonBody(request);
    let thread = await loadThread(body.characterId);
    if (!thread) throw new Error("That conversation does not exist yet.");
    if (!thread.profile) {
      const profile = await ensureProfile(config, thread.character);
      thread = { ...thread, profile };
    }
    thread = { ...thread, profile: enforceAdultCharacterProfile(thread.profile) };
    const clientMessageId = String(body.clientMessageId || "").trim();
    const recoveredTurn = recoverClientTurn(thread.messages, clientMessageId);
    const existingIndex = recoveredTurn.index;
    if (existingIndex >= 0) {
      const existingReply = recoveredTurn.reply;
      if (existingReply) {
        sendJson(response, 200, { thread, reply: existingReply });
        return true;
      }
    }
    const priorThread = existingIndex >= 0 ? { ...thread, messages: thread.messages.slice(0, existingIndex) } : thread;
    const cadence = existingIndex >= 0
      ? { state: thread.photoCadence, opportunity: false }
      : advancePhotoCadence(thread.photoCadence, thread.relationship);
    const photoOpportunity = cadence.opportunity && !body.image;
    const userMessage = existingIndex >= 0
      ? thread.messages[existingIndex]
      : nowMessage("user", String(body.text || ""), { ...(body.image ? { image: body.image } : {}), ...(clientMessageId ? { id: clientMessageId } : {}) });
    const working = existingIndex >= 0
      ? { ...thread, unreadCount: 0 }
      : { ...thread, unreadCount: 0, photoCadence: cadence.state, messages: [...thread.messages, userMessage] };
    if (existingIndex < 0) await saveThread(working);
    let imageBase64;
    if (body.image) imageBase64 = (await readLocalAsset(body.image)).toString("base64");
    const cameo = normalizeCameoState(working.cameo, working.character.id);
    if (cameo?.activeGuest) {
      const [guestThread, guestProfile] = await Promise.all([
        loadThread(cameo.activeGuest.characterId),
        loadProfile(cameo.activeGuest.profileId || cameo.activeGuest.characterId),
      ]);
      if (!guestThread?.character || !guestProfile) throw new Error("The guest's local profile is unavailable. End the guest encounter and invite them again.");
      let session = resumeCameoSession({ hostThread: working, guestCharacter: guestThread.character, guestProfile, guestThread });
      const speakerIds = routeCameoSpeakers({
        text: body.image ? "both of you" : String(body.text || ""),
        host: working.character,
        guest: guestThread.character,
        lastSpeakerId: session.lastSpeakerId,
        focusSpeakerId: body.focusSpeakerId,
      });
      const initialSpeakerCount = speakerIds.length;
      const allowInterjection = initialSpeakerCount === 1 && cameoInterjectionEligible({
        text: String(body.text || ""),
        host: working.character,
        guest: guestThread.character,
        messages: session.messages,
        image: Boolean(body.image),
      });
      const replies = [];
      const photoCandidates = [];
      const speakerErrors = [];
      let hostRelationship = working.relationship;
      let hostRelationshipMomentum = working.relationshipMomentum;
      let hostMemories = working.memories;
      let nextGuestThread = guestThread;
      let guestParticipated = false;
      for (let speakerIndex = 0; speakerIndex < speakerIds.length; speakerIndex += 1) {
        const speakerId = speakerIds[speakerIndex];
        const isInterjection = initialSpeakerCount === 1 && speakerIndex > 0;
        try {
          const speakerThread = threadForCameoSpeaker(session, speakerId);
          const contextThread = body.image
            ? { ...speakerThread, messages: speakerThread.messages.filter((message) => message.id !== userMessage.id) }
            : speakerThread;
          const result = await chatAsCharacter(config, contextThread, String(body.text || ""), imageBase64 || null, {
            currentTurnAlreadyInHistory: !body.image,
            extraSystemContext: cameoPromptContext(session, speakerId, {
              groupTurn: initialSpeakerCount > 1 || isInterjection,
              allowInterjection: allowInterjection && speakerIndex === 0,
              interjection: isInterjection,
            }),
            photoOpportunity: false,
          });
          const reply = nowMessage("character", result.reply, {
            speakerId,
            ...(isInterjection ? { cameoInterjection: true } : {}),
          });
          replies.push(reply);
          photoCandidates.push({ speakerId, result });
          session = appendCameoMessage(session, reply);
          if (speakerId === working.character.id) {
            const progression = applyRelationshipDelta(hostRelationship, result.relationshipDelta, hostRelationshipMomentum);
            hostRelationship = progression.relationship;
            hostRelationshipMomentum = progression.relationshipMomentum;
            hostMemories = mergeMemories(hostMemories, result.memoryCandidates, reply.id);
          } else {
            guestParticipated = true;
            const progression = applyRelationshipDelta(nextGuestThread.relationship, result.relationshipDelta, nextGuestThread.relationshipMomentum);
            nextGuestThread = {
              ...nextGuestThread,
              relationship: progression.relationship,
              relationshipMomentum: progression.relationshipMomentum,
              memories: mergeMemories(nextGuestThread.memories, result.memoryCandidates, reply.id),
            };
            session.guest.relationship = progression.relationship;
          }
          if (allowInterjection && speakerIndex === 0 && result.otherShouldRespond) {
            const otherSpeakerId = speakerId === working.character.id
              ? guestThread.character.id
              : working.character.id;
            if (!speakerIds.includes(otherSpeakerId)) speakerIds.push(otherSpeakerId);
          }
        } catch (error) {
          speakerErrors.push({ speakerId, message: error instanceof Error ? error.message : "The character could not reply." });
        }
      }
      if (!replies.length) throw new Error(speakerErrors[0]?.message || "Neither character could reply this time.");
      const latestThread = await loadThread(working.id);
      const latestCameo = normalizeCameoState(latestThread?.cameo, working.character.id);
      if (!latestCameo?.activeGuest || latestCameo.activeGuest.characterId !== cameo.activeGuest.characterId) {
        sendJson(response, 200, { thread: latestThread || working, replies: [], cancelled: true });
        return true;
      }
      thread = await saveThread({
        ...latestThread,
        messages: [...latestThread.messages, ...replies],
        relationship: hostRelationship,
        relationshipMomentum: hostRelationshipMomentum,
        memories: hostMemories,
      });
      let relatedThread;
      if (guestParticipated) relatedThread = await saveThread(nextGuestThread);
      const explicitlyRequestedPhoto = !body.image && isExplicitPhotoRequest(String(body.text || ""), thread.messages);
      const queuedImageJobs = [];
      let imageWarning;
      if (explicitlyRequestedPhoto && (!config.comfyWorkflowFile || !config.comfyMappingFile)) {
        imageWarning = "Image generation is not configured yet. Open Settings and complete Image setup.";
      }
      if (explicitlyRequestedPhoto && config.comfyWorkflowFile && config.comfyMappingFile) {
        for (const candidate of photoCandidates) {
          try {
            const imageThread = threadForCameoSpeaker(session, candidate.speakerId);
            const imageContext = candidate.result.photoBrief || "a candid message photo showing what this character is doing right now";
            const imageJob = await queueCharacterImage(config, imageThread, imageContext);
            await rememberImageJob(imageJob.promptId, {
              characterId: thread.id,
              speakerId: candidate.speakerId,
              appended: false,
              caption: candidate.result.photoMessage || null,
              imageContext,
              generation: generationMetadata(imageJob, config),
            });
            queuedImageJobs.push({ promptId: imageJob.promptId });
          } catch (error) {
            imageWarning = error instanceof Error ? error.message : "One of the pictures could not be started.";
          }
        }
      }
      sendJson(response, 200, {
        thread,
        reply: replies.at(-1),
        replies,
        ...(relatedThread ? { relatedThreads: [relatedThread] } : {}),
        ...(speakerErrors.length ? {
          replyWarning: speakerErrors.map((item) => (item.speakerId === working.character.id
            ? characterDisplayNameForServer(working.character)
            : cameo.activeGuest.name) + " could not reply this time.").join(" "),
        } : {}),
        ...(queuedImageJobs.length ? { imageJobs: queuedImageJobs } : {}),
        ...(imageWarning ? { imageWarning } : {}),
      });
      return true;
    }
    // `working` already contains the new user turn for persistence. Give Ollama the
    // prior thread and append the current turn exactly once inside chatAsCharacter.
    const presenceCue = presenceSceneCue(priorThread, String(body.text || ""));
    const contextThread = { ...priorThread, scene: mergeScene(priorThread.scene, presenceCue) };
    const result = await chatAsCharacter(config, contextThread, String(body.text || ""), imageBase64, { photoOpportunity });
    const reply = nowMessage("character", result.reply);
    const progression = applyRelationshipDelta(working.relationship, result.relationshipDelta, working.relationshipMomentum);
    const outfitCorrection = inferOutfitCorrection(String(body.text || ""), working.scene.outfit);
    const sceneCue = inferSceneCue(body.text);
    const correctedSceneCue = outfitCorrection
      ? { ...sceneCue, ...presenceCue, outfit: outfitCorrection.outfit }
      : { ...sceneCue, ...presenceCue };
    const followUpState = updatePendingFollowUp(
      working.proactive,
      result.followUp,
      result.resolvesPendingFollowUp,
    );
    thread = await saveThread({
      ...working,
      messages: [...working.messages, reply],
      relationship: progression.relationship,
      relationshipMomentum: progression.relationshipMomentum,
      memories: mergeMemories(working.memories, result.memoryCandidates, userMessage.id),
      proactive: followUpState.pending
        ? followUpState
        : scheduleNextProactive(followUpState, progression.relationship, config.proactivePace),
      scene: mergeScene(mergeScene(working.scene, result.scene), correctedSceneCue),
    });
    let imageJob;
    let imageWarning;
    const explicitlyRequestedPhoto = !body.image && isExplicitPhotoRequest(String(body.text || ""), thread.messages);
    // The system prompt forbids proactive photos outside cadence opportunities, so
    // shouldSendPhoto can also carry semantic requests that a phrase matcher misses.
    const shouldQueuePhoto = !body.image && (explicitlyRequestedPhoto || result.shouldSendPhoto);
    if (shouldQueuePhoto && (!config.comfyWorkflowFile || !config.comfyMappingFile)) {
      imageWarning = "Image generation is not configured yet. Open Settings and complete Image setup.";
    }
    if (shouldQueuePhoto && config.comfyWorkflowFile && config.comfyMappingFile) {
      try {
        const correctedPhotoBrief = outfitCorrection
          ? [
              result.photoBrief || "a candid message photo",
              "STRICT OUTFIT CONTINUITY: wearing " + outfitCorrection.outfit,
              outfitCorrection.exclusive ? "no additional visible clothing layers" : "do not include " + outfitCorrection.excluded.join(" or "),
            ].join("; ")
          : result.photoBrief || "a candid message photo";
        imageJob = await queueCharacterImage(config, thread, correctedPhotoBrief, outfitCorrection?.excluded?.length
          ? { negative: outfitCorrection.excluded.join(", ") }
          : {});
        await rememberImageJob(imageJob.promptId, {
          characterId: thread.id,
          appended: false,
          caption: result.photoMessage || null,
          imageContext: correctedPhotoBrief,
          generation: generationMetadata(imageJob, config),
        });
        thread = await saveThread({ ...thread, photoCadence: resetPhotoCadence(thread.relationship) });
      } catch (error) {
        imageJob = undefined;
        imageWarning = error instanceof Error ? error.message : "The image could not be started.";
      }
    }
    if (!imageJob && photoOpportunity) {
      thread = await saveThread({ ...thread, photoCadence: postponePhotoCadence(cadence.state) });
    }
    sendJson(response, 200, { thread, reply, ...(imageJob ? { imageJob } : {}), ...(imageWarning ? { imageWarning } : {}) });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/images/generate") {
    const body = await jsonBody(request);
    const thread = await loadThread(body.characterId);
    if (!thread?.profile) throw new Error("Build the character profile before asking for a picture.");
    const job = await queueCharacterImage(config, thread, String(body.brief || ""));
    await rememberImageJob(job.promptId, {
      characterId: thread.id,
      appended: false,
      caption: null,
      imageContext: String(body.brief || "a picture the character chose to share"),
      generation: generationMetadata(job, config),
    });
    sendJson(response, 200, job);
    return true;
  }
  const statusMatch = /^\/api\/images\/status\/([^/]+)$/.exec(url.pathname);
  if (request.method === "GET" && statusMatch) {
    const promptId = decodeURIComponent(statusMatch[1]);
    const status = await generationStatus(config, promptId);
    const thread = await completeImageJob(config, promptId, status);
    sendJson(response, 200, { ...status, ...(thread ? { thread } : {}) });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/images/view") {
    const image = await fetchComfyImage(config, url);
    sendBuffer(response, 200, image.body, image.type);
    return true;
  }
  const fileMatch = /^\/api\/files\/uploads\/([a-zA-Z0-9._-]+)$/.exec(url.pathname);
  if (request.method === "GET" && fileMatch) {
    const body = await readLocalAsset("/api/files/uploads/" + fileMatch[1]);
    const extension = path.extname(fileMatch[1]).toLowerCase();
    const type = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : extension === ".webp" ? "image/webp" : extension === ".gif" ? "image/gif" : "image/png";
    sendBuffer(response, 200, body, type);
    return true;
  }
  return false;
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

async function serveFrontend(response, url) {
  if (!serveDist) return false;
  const dist = path.join(rootDir, "dist");
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  let filePath = path.resolve(dist, requested);
  if (!filePath.startsWith(dist + path.sep) && filePath !== dist) return false;
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
    sendBuffer(response, 200, await fs.readFile(filePath), mimeTypes[path.extname(filePath)] || "application/octet-stream");
    return true;
  } catch {
    sendBuffer(response, 200, await fs.readFile(path.join(dist, "index.html")), "text/html; charset=utf-8");
    return true;
  }
}

await fs.mkdir(dataDir, { recursive: true });
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://" + (request.headers.host || host));
  try {
    if (url.pathname.startsWith("/api/") && await handleApi(request, response, url)) return;
    if (await serveFrontend(response, url)) return;
    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 500, { error: message });
  }
});

server.listen(port, host, () => {
  console.log("AniMessenger local service listening on http://" + host + ":" + port);
  void recoverCompletedImageJobs();
});

setInterval(() => void recoverCompletedImageJobs(), 10_000).unref();
