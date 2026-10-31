import { applyFinalScene, placeHasSourceAnchor } from "./final-scene.mjs";
import { normalizeSceneState } from "./scene-state.mjs";
import { optionalSceneFields, pendingSceneFields, sceneStateFields, withSceneVerification } from "./scene-verification.mjs";
import { classifyPlaceCandidate } from "./scene-events-v2.mjs";
import { cleanLocationLabel } from "./environment.mjs";

const textOf = message => String(message.narration || message.text || "").trim();
const normalized = value => String(value || "").normalize("NFKC").replace(/’/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
const conflict = () => Object.assign(new Error("The conversation changed while its scene was being checked. Please try the picture again."), { statusCode: 409 });
const unresolved = (fields = []) => Object.assign(new Error(`The picture could not be started because the current ${fields.length ? fields.join(", ") : "scene"} could not be verified. Please try again.`), { sceneFields: fields });
const genericPlace = /^(?:(?:the|a|an|this|same|current|her|his|their|our|my)\s+)*(?:room|place|space|area|interior|indoors|here|there)$/i;
const placeWords = value => normalized(value).replace(/\b[\p{L}\p{N}]+['’]s\b/gu, "").split(/[^\p{L}\p{N}]+/u)
  .filter(word => word && !["the", "a", "an", "her", "his", "their", "our", "my", "in", "at", "inside"].includes(word));

// An unsupported model rename is not a physical move. Before retaining a
// checkpoint, conservatively detect named destinations/current places in the
// actual latest sources, including open-vocabulary proper place names.
export function hasDifferentCurrentPlace(scene, input) {
  const established = new Set(placeWords(scene.location));
  for (const text of Object.values(input.latestExchange)) {
    if (/\b(?:stepp?\w*|walk\w*|pass\w*|mov\w*|went|go(?:es)?|came|cross\w*)\s+(?:inside|into|through|across|past)\s+(?:(?:the|a|an|her|his|their|our)\s+)?(?:door(?:way)?|threshold|entrance)\b/i.test(text)) return true;
    for (const match of text.matchAll(/\b(?:(?:in|inside|within|into|at|through)\s+|(?:enter(?:ed|s)?|reach(?:ed|es)?)\s+)([^.!?;\n,]{1,180})/gi)) {
      const label = cleanLocationLabel(match[1].split(/\s+(?:is|are|was|were|seems?|seemed|feels?|felt|with|while|where|as|has|had)\b/i)[0]);
      if (!label || genericPlace.test(label) || !classifyPlaceCandidate(label, match[0]).valid) continue;
      const words = placeWords(label);
      if (words.length && !words.every(word => established.has(word))) return true;
    }
  }
  return false;
}

export function sceneEvidenceCatalog(exchange) {
  return ["user", "character"].flatMap(source => [...String(exchange[source] || "").matchAll(/[^.!?;\n]+(?:[.!?;]+|$)/g)].slice(-96)
    .map((match, index) => ({ id: `${source}-${index + 1}`, source, quote: match[0].trim() })).filter(item => item.quote.length >= 4));
}

async function reviewOrOmit(config, input, review) {
  try { return await review(config, input); }
  catch (error) {
    if (input.uncertainFields.every(field => optionalSceneFields.includes(field))) return { scene: {}, sceneEvidence: {} };
    throw error;
  }
}

export function sceneReviewInput(thread) {
  const messages = (thread.messages || []).filter(message => ["user", "character"].includes(message.from)
    && (!message.speakerId || message.speakerId === thread.character?.id) && textOf(message));
  const user = messages.findLast(message => message.from === "user");
  const character = messages.findLast(message => message.from === "character");
  const latestExchange = { user: textOf(user || {}), character: messages.at(-1)?.from === "character" ? textOf(character || {}) : "" };
  const locationProof = thread.scene?.locationEvidence;
  const verifiedLocationCheckpoint = locationProof?.kind === "final_scene" && ["user", "character"].includes(locationProof.source)
    && locationProof.text?.length >= 4 && placeHasSourceAnchor(thread.scene.location, locationProof.text)
    && messages.some(message => message.from === locationProof.source && normalized(textOf(message)).includes(normalized(locationProof.text)))
    ? { location: thread.scene.location, source: locationProof.source, quote: locationProof.text } : null;
  return {
    characterName: thread.profile?.name || thread.character?.name || "the character",
    currentScene: Object.fromEntries(sceneStateFields.map(field => [field, thread.scene?.[field] || null])),
    uncertainFields: pendingSceneFields(thread.scene),
    verifiedLocationCheckpoint,
    // Full latest visible sources are required for exact-quotation validation.
    latestExchange,
    evidenceCatalog: sceneEvidenceCatalog(latestExchange),
    recentContext: messages.slice(-8).filter(message => message !== user && message !== character)
      .map(message => ({ from: message.from, text: textOf(message).slice(0, 1800) })),
  };
}

// Cameo artwork uses a temporary speaker snapshot; never write its personal
// pose or clothing into either participant's separate private conversation.
export async function resolveImageSceneSnapshot(config, thread, review) {
  if (!pendingSceneFields(thread.scene).length) return { thread, reconciled: false };
  const input = sceneReviewInput(thread);
  if (!input.latestExchange.character || input.latestExchange.user.length + input.latestExchange.character.length > 20000) throw unresolved();
  const scene = validateSceneReview(thread.scene, input, await reviewOrOmit(config, input, review));
  return { thread: { ...thread, scene }, reconciled: true };
}

export function validateSceneReview(scene, input, review) {
  if (input.latestExchange.user.length + input.latestExchange.character.length > 20000) throw unresolved();
  review = { scene: review?.scene || {}, sceneEvidence: review?.sceneEvidence || {}, locationDisposition: review?.locationDisposition };
  const scope = new Set(pendingSceneFields(scene));
  // A room repair may also replace its dependent staging. Unrequested output
  // must not force unrelated, already-verified clothing or scenery to be proved
  // again, nor silently change those fields.
  const locationKey = value => String(value || "").trim().toLowerCase();
  if (scope.has("location") && review.scene.location && locationKey(review.scene.location) !== locationKey(scene.location)) {
    for (const field of ["environment", "activity", "posture", "lighting"]) scope.add(field);
  }
  const proposed = Object.fromEntries(sceneStateFields.map(field => [field, scope.has(field) && typeof review.scene[field] === "string" ? review.scene[field] : null]));
  const catalog = new Map((input.evidenceCatalog || sceneEvidenceCatalog(input.latestExchange)).map(item => [item.id, item]));
  const evidence = Object.fromEntries(sceneStateFields.map(field => {
    const supplied = review.sceneEvidence[field];
    if (!supplied?.evidenceId) return [field, supplied];
    const source = catalog.get(supplied.evidenceId);
    return [field, source ? { quote: source.quote, source: source.source, actor: supplied.actor, phase: supplied.phase } : null];
  }));
  const options = {
    modelScene: proposed, sceneEvidence: evidence,
    userText: input.latestExchange.user, characterText: input.latestExchange.character,
    characterName: input.characterName, verifyUnchanged: true, respectSharedDeclaration: scope.has("location"),
  };
  let result = applyFinalScene(scene, options);
  const checkpoint = input.verifiedLocationCheckpoint;
  const establishedNewLocation = result.decisions.some(decision => decision.field === "location" && decision.status === "accepted")
    && normalized(result.scene.location) !== normalized(scene.location);
  // "Unchanged" refers to a source-backed saved room, not a proposed new name.
  // It needs no repetition of that room's name in every visible reply. Explicit
  // current shared-location declarations still win over model continuity.
  const proposedLocation = review.scene.location;
  const explicitRetention = review.locationDisposition === "unchanged" && (!proposedLocation || normalized(proposedLocation) === normalized(scene.location));
  const unsupportedRename = !proposedLocation || genericPlace.test(proposedLocation)
    || !placeHasSourceAnchor(proposedLocation, input.latestExchange.user + "\n" + input.latestExchange.character);
  if (scope.has("location") && !establishedNewLocation && (explicitRetention || unsupportedRename)
    && checkpoint && normalized(checkpoint.location) === normalized(scene.location)
    && normalized(checkpoint.quote) === normalized(scene.locationEvidence?.text)
    && !hasDifferentCurrentPlace(scene, input)) {
    const originallyPending = new Set(pendingSceneFields(scene));
    const retainedProposal = Object.fromEntries(sceneStateFields.map(field => [field, field !== "location" && originallyPending.has(field) ? proposed[field] : null]));
    result = applyFinalScene(scene, { ...options, modelScene: retainedProposal, respectSharedDeclaration: false });
    result.decisions.push({ field: "location", status: "accepted", reason: "retained_verified_location" });
    scope.clear();
    for (const field of originallyPending) if (field !== "location") scope.add(field);
  }
  // Essential visual anchors remain mandatory. Descriptive fields may be
  // omitted, never replaced with their stale pre-update values.
  const essentialFailures = result.decisions.filter(decision => decision.status === "rejected" && !optionalSceneFields.includes(decision.field));
  if (essentialFailures.length) throw unresolved(essentialFailures.map(decision => decision.field));
  const next = normalizeSceneState(withSceneVerification(scene, result.scene, result.decisions));
  for (const field of optionalSceneFields) {
    if (!scope.has(field) || result.decisions.some(decision => decision.field === field && decision.status === "accepted")) continue;
    next[field] = { environment: "", activity: "unspecified", expression: "unspecified", lighting: "ambient light" }[field];
    if (field === "environment") delete next.environmentEvidence;
    next.verification.pending = next.verification.pending.filter(pending => pending !== field);
    next.verification.omitted = [...new Set([...(next.verification.omitted || []), field])];
    if (next[field] !== scene[field]) next.revision = Math.max(next.revision, Number(scene.revision || 0) + 1);
  }
  next.verification.status = next.verification.pending.length ? "needs_review" : "verified";
  if (pendingSceneFields(next).length) throw unresolved(pendingSceneFields(next));
  return next;
}

// Dependency injection keeps persistence/ownership checks testable without a
// model, live conversations or an image server. Concurrent identical captures
// share the one review, not a cached answer for a later exchange.
export function createImageSceneResolver({ review, load, update }) {
  const inFlight = new Map();
  return async (config, thread) => {
    if (!pendingSceneFields(thread.scene).length) return { thread, reconciled: false };
    const input = sceneReviewInput(thread);
    if (!input.latestExchange.character || input.latestExchange.user.length + input.latestExchange.character.length > 20000) throw unresolved();
    const signature = value => JSON.stringify({ scene: value.scene, input: sceneReviewInput(value) });
    const original = signature(thread);
    const key = JSON.stringify([thread.id, thread.storageInstanceId, original]);
    if (inFlight.has(key)) return inFlight.get(key);
    const work = (async () => {
      const current = await load(thread.id);
      if (!current || current.storageInstanceId !== thread.storageInstanceId || signature(current) !== original) throw conflict();
      const response = await reviewOrOmit(config, input, review);
      const scene = validateSceneReview(thread.scene, input, response);
      const saved = await update(thread.id, latest => {
        if (signature(latest) !== original) throw conflict();
        return { scene };
      }, { expectedInstanceId: thread.storageInstanceId, preserveUpdatedAt: true });
      return { thread: saved, reconciled: true };
    })();
    inFlight.set(key, work);
    try { return await work; } finally { inFlight.delete(key); }
  };
}
