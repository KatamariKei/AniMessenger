import {
  cleanLocationLabel,
  cleanSceneActivity,
  environmentForLocation,
  inferActionLocationEvent,
  inferDepartureEvent,
  inferEnvironmentCue,
  inferLocationEvent,
  inferTransitionActivity,
  isDetailedEnvironment,
  isRelativeLocation,
  locationChangeIsEstablished,
  meaningfulLocationChange,
  resolveSceneLocation,
  stabilizeEnvironment,
} from "./environment.mjs";
import { inferWardrobeDescription, inferWardrobeEvent, normalizeWardrobePrompt, removeWardrobeItems } from "./wardrobe.mjs";

const presenceValues = new Set(["apart", "together", "uncertain"]);
const ownerValues = new Set(["shared", "character", "user", "unknown"]);

function value(input, fallback = "") {
  return typeof input === "string" && input.trim() ? input.trim() : fallback;
}

export function normalizeSceneState(scene = {}) {
  const rawLocation = value(scene.location, "somewhere familiar");
  const location = cleanLocationLabel(rawLocation);
  const rawEnvironment = value(scene.environment);
  const environmentRepeatsDiscardedLocationClause = rawLocation.toLowerCase() !== location.toLowerCase()
    && rawEnvironment.toLowerCase().includes(rawLocation.toLowerCase());
  const environment = /^(?:["“]|the (?:sight|feeling|moment|tension)\b)/i.test(rawEnvironment)
    || environmentRepeatsDiscardedLocationClause
    ? environmentForLocation(location)
    : rawEnvironment;
  const presence = presenceValues.has(scene.presence) ? scene.presence : "apart";
  const locationOwner = presence === "together"
    ? "shared"
    : ownerValues.has(scene.locationOwner)
    ? scene.locationOwner
    : presence === "together" ? "shared" : "character";
  return {
    ...scene,
    location,
    environment,
    activity: cleanSceneActivity(scene.activity) || "chatting with you",
    outfit: normalizeWardrobePrompt(value(scene.outfit, "default outfit")),
    expression: value(scene.expression, "natural expression"),
    lighting: value(scene.lighting, "soft natural light"),
    presence,
    revision: Math.max(0, Math.trunc(Number(scene.revision) || 0)),
    locationOwner,
    ...(locationOwner === "shared" ? {
      // "Together" is a hard spatial invariant. Legacy or model-produced
      // per-person locations cannot survive inside a shared physical scene.
      sharedLocation: location,
      characterLocation: location,
      userLocation: location,
    } : locationOwner === "character" ? {
      characterLocation: value(scene.characterLocation, location),
      ...(scene.userLocation ? { userLocation: scene.userLocation } : {}),
    } : {}),
  };
}

export function sceneContinuityCheckpoint(scene = {}) {
  const current = normalizeSceneState(scene);
  return [
    "IMMEDIATE SCENE CHECKPOINT (authoritative immediately before the latest user turn):",
    `location=${current.location}; environment=${current.environment || "not yet established"}; activity=${current.activity}; outfit=${current.outfit}; lighting=${current.lighting}; presence=${current.presence}.`,
    "Any earlier history at another location or describing an earlier activity is completed past context. Do not make earlier food, props, surroundings, actions, or unfinished business present again unless the latest user turn explicitly returns to them.",
  ].join(" ");
}

export function mergeScene(existing, update = {}, evidence = "") {
  const current = normalizeSceneState(existing);
  // Relative progress changes the activity, not the enclosing setting. Keep
  // surroundings intact even when the model puts "the far end" in location.
  if (isRelativeLocation(update.location)) {
    update = { ...update, location: current.location, environment: current.environment };
  }
  const next = { ...current };
  const proposedLocation = cleanLocationLabel(update.location);
  const authoritativeLocation = update.locationAuthority === "deterministic";
  const acceptsProposedLocation = proposedLocation
    ? authoritativeLocation || locationChangeIsEstablished(current.location, proposedLocation, evidence)
    : false;
  const rejectsProposedLocation = Boolean(
    proposedLocation
    && proposedLocation.toLowerCase() !== current.location.toLowerCase()
    && !acceptsProposedLocation,
  );
  const changedLocation = acceptsProposedLocation && meaningfulLocationChange(current.location, proposedLocation);

  if (acceptsProposedLocation) next.location = proposedLocation;
  for (const key of ["outfit", "expression", "presence"]) {
    if (key === "presence" && !presenceValues.has(update[key])) continue;
    if (value(update[key])) next[key] = value(update[key]);
  }
  if (value(update.outfit) && update.outfitEvidence) next.outfitEvidence = update.outfitEvidence;
  // A rejected move cannot leak its destination-dependent fields into the
  // accepted scene. This is the atomic boundary that prevents hybrids such as
  // a kitchen label with a bedroom environment or an arcade with rink lights.
  if (!rejectsProposedLocation) {
    for (const key of ["activity", "lighting"]) {
      const candidate = key === "activity" ? cleanSceneActivity(update[key]) : value(update[key]);
      if (candidate) next[key] = candidate;
    }
    next.environment = stabilizeEnvironment(current.environment, update.environment, evidence, {
      currentLocation: current.location,
      nextLocation: next.location,
    });
  }

  if (changedLocation) {
    next.revision = current.revision + 1;
    next.locationOwner = ownerValues.has(update.locationOwner)
      ? update.locationOwner
      : next.presence === "together" ? "shared" : "character";
    if (next.locationOwner === "shared") {
      next.sharedLocation = next.location;
      next.characterLocation = next.location;
      next.userLocation = next.location;
    } else if (next.locationOwner === "character") {
      next.characterLocation = next.location;
      delete next.sharedLocation;
    } else if (next.locationOwner === "user") {
      next.userLocation = next.location;
      delete next.sharedLocation;
    }
    if (update.locationEvidence) next.locationEvidence = update.locationEvidence;
  }
  return next;
}

function eventForMainScene(event, presence) {
  if (!event) return null;
  if (event.actor === "shared") return { ...event, owner: "shared" };
  if (event.actor === "character") return { ...event, owner: presence === "together" ? "shared" : "character" };
  return null;
}

export function reduceSceneTurn(existing, options = {}) {
  const current = normalizeSceneState(existing);
  const userText = value(options.userText);
  const characterText = value(options.characterText);
  const evidence = [userText, characterText].filter(Boolean).join(" ");
  const modelScene = options.modelScene && typeof options.modelScene === "object" ? options.modelScene : {};
  const deterministicPatch = options.deterministicPatch && typeof options.deterministicPatch === "object"
    ? options.deterministicPatch
    : {};
  const presencePatch = options.presencePatch && typeof options.presencePatch === "object"
    ? options.presencePatch
    : {};
  const authoritativePresence = presencePatch.presenceAuthority === "deterministic";
  const nextPresence = authoritativePresence && presenceValues.has(presencePatch.presence)
    ? presencePatch.presence
    : presenceValues.has(modelScene.presence)
      ? modelScene.presence
      : presenceValues.has(presencePatch.presence) ? presencePatch.presence : current.presence;
  // Explicit action blocks are authoritative physical-stage directions. Parse
  // them first so natural wording can correct stale model continuity before
  // either the model scene or ordinary conversational inference is considered.
  const userEvent = inferActionLocationEvent(userText, "user") || inferLocationEvent(userText, "user");
  const characterEvent = inferActionLocationEvent(characterText, "character") || inferLocationEvent(characterText, "character");
  const userDeparture = userEvent ? null : inferDepartureEvent(userText, current.location, "user");
  const characterDeparture = characterEvent ? null : inferDepartureEvent(characterText, current.location, "character");
  const userWardrobeEvent = inferWardrobeEvent(userText, "user");
  const characterWardrobeEvent = inferWardrobeEvent(characterText, "character");
  const userWardrobeDescription = inferWardrobeDescription(userText, "user");
  const characterWardrobeDescription = options.allowWardrobeDescription
    ? inferWardrobeDescription(characterText, "character")
    : null;
  const presenceEvent = value(presencePatch.location)
    ? { type: "location_change", phase: "arrived", kind: "presence", location: presencePatch.location, actor: "shared", evidence: userText }
    : null;
  const deterministicEvent = value(deterministicPatch.location)
    ? { type: "location_change", phase: "arrived", kind: "deterministic", location: deterministicPatch.location, actor: nextPresence === "together" ? "shared" : "character", evidence: userText }
    : null;
  const selectedEvent = eventForMainScene(userEvent, nextPresence)
    || eventForMainScene(userDeparture, nextPresence)
    || eventForMainScene(presenceEvent, nextPresence)
    || eventForMainScene(deterministicEvent, nextPresence)
    || eventForMainScene(characterEvent, nextPresence)
    || eventForMainScene(characterDeparture, nextPresence);

  const explicitEnvironment = inferEnvironmentCue(userText) || inferEnvironmentCue(characterText);
  const transitionActivity = selectedEvent
    ? inferTransitionActivity(selectedEvent.evidence || evidence, selectedEvent)
    : "";
  const update = {
    ...modelScene,
    ...deterministicPatch,
    ...presencePatch,
    presence: nextPresence,
  };

  let wardrobeEvent = userWardrobeEvent || characterWardrobeEvent || characterWardrobeDescription;
  if (
    wardrobeEvent?.phase === "changed"
    && /^(?:dress|outfit|clothes|clothing|attire|gear|ensemble|look)$/i.test(wardrobeEvent.outfit || "")
    && userWardrobeDescription?.outfit
  ) {
    wardrobeEvent = { ...wardrobeEvent, outfit: userWardrobeDescription.outfit };
  }
  if (wardrobeEvent) {
    update.outfit = wardrobeEvent.phase === "removed"
      ? removeWardrobeItems(current.outfit, wardrobeEvent.removedGarments)
      : wardrobeEvent.outfit;
    update.outfitEvidence = {
      source: wardrobeEvent.source,
      kind: wardrobeEvent.phase,
      text: wardrobeEvent.evidence,
    };
  } else if (!value(deterministicPatch.outfit) && !options.allowModelOutfit) {
    // Location, activity, and lighting may evolve implicitly. Clothing may
    // not: keep the last known outfit until dialogue/action, an authoritative
    // correction, or a generated visual explicitly establishes a change.
    delete update.outfit;
    delete update.outfitEvidence;
  }

  if (selectedEvent) {
    const settledLocation = resolveSceneLocation(current.location, selectedEvent.location);
    update.location = settledLocation;
    update.locationAuthority = "deterministic";
    update.locationOwner = selectedEvent.owner;
    update.locationEvidence = {
      source: selectedEvent.actor,
      kind: selectedEvent.kind,
      text: selectedEvent.evidence,
    };
    const modelEnvironment = isDetailedEnvironment(modelScene.environment) ? modelScene.environment : "";
    update.environment = explicitEnvironment || modelEnvironment || environmentForLocation(settledLocation);
    const modelActivity = value(modelScene.activity);
    update.activity = value(selectedEvent.activity)
      || transitionActivity
      || (modelActivity && modelActivity.toLowerCase() !== current.activity.toLowerCase() ? modelActivity : "")
      || `settling into ${settledLocation}`;
  } else if (explicitEnvironment) {
    update.environment = explicitEnvironment;
  }

  let next = mergeScene(current, update, evidence);
  // A user's solo location report while the characters are apart is useful
  // context but must not teleport the character or replace the displayed
  // character location.
  if (userEvent?.actor === "user" && nextPresence !== "together") {
    next = {
      ...next,
      userLocation: userEvent.location,
      revision: current.revision + 1,
    };
  }
  return next;
}

export function previewSceneForUserTurn(existing, userText, options = {}) {
  return reduceSceneTurn(existing, {
    userText,
    presencePatch: options.presencePatch,
    deterministicPatch: options.deterministicPatch,
  });
}
