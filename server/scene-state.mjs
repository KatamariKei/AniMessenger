import {
  cleanLocationLabel,
  cleanSceneActivity,
  environmentForLocation,
  inferEnvironmentCue,
  inferLocationEvent,
  inferTransitionActivity,
  isDetailedEnvironment,
  isRelativeLocation,
  locationChangeIsEstablished,
  meaningfulLocationChange,
  stabilizeEnvironment,
} from "./environment.mjs";
import { inferWardrobeEvent } from "./wardrobe.mjs";

const presenceValues = new Set(["apart", "together", "uncertain"]);
const ownerValues = new Set(["shared", "character", "user", "unknown"]);

function value(input, fallback = "") {
  return typeof input === "string" && input.trim() ? input.trim() : fallback;
}

export function normalizeSceneState(scene = {}) {
  const location = cleanLocationLabel(value(scene.location, "somewhere familiar"));
  const presence = presenceValues.has(scene.presence) ? scene.presence : "apart";
  const locationOwner = ownerValues.has(scene.locationOwner)
    ? scene.locationOwner
    : presence === "together" ? "shared" : "character";
  return {
    ...scene,
    location,
    environment: value(scene.environment),
    activity: cleanSceneActivity(scene.activity) || "chatting with you",
    outfit: value(scene.outfit, "default outfit"),
    expression: value(scene.expression, "natural expression"),
    lighting: value(scene.lighting, "soft natural light"),
    presence,
    revision: Math.max(0, Math.trunc(Number(scene.revision) || 0)),
    locationOwner,
    ...(locationOwner === "shared" ? {
      sharedLocation: cleanLocationLabel(value(scene.sharedLocation, location)),
      characterLocation: cleanLocationLabel(value(scene.characterLocation, location)),
      userLocation: cleanLocationLabel(value(scene.userLocation, location)),
    } : locationOwner === "character" ? {
      characterLocation: value(scene.characterLocation, location),
      ...(scene.userLocation ? { userLocation: scene.userLocation } : {}),
    } : {}),
  };
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
  if (event.actor === "character") return { ...event, owner: presence === "together" ? "character" : "character" };
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
  const nextPresence = presenceValues.has(presencePatch.presence)
    ? presencePatch.presence
    : presenceValues.has(modelScene.presence) ? modelScene.presence : current.presence;
  const userEvent = inferLocationEvent(userText, "user");
  const characterEvent = inferLocationEvent(characterText, "character");
  const userWardrobeEvent = inferWardrobeEvent(userText, "user");
  const characterWardrobeEvent = inferWardrobeEvent(characterText, "character");
  const presenceEvent = value(presencePatch.location)
    ? { type: "location_change", phase: "arrived", kind: "presence", location: presencePatch.location, actor: "shared", evidence: userText }
    : null;
  const deterministicEvent = value(deterministicPatch.location)
    ? { type: "location_change", phase: "arrived", kind: "deterministic", location: deterministicPatch.location, actor: nextPresence === "together" ? "shared" : "character", evidence: userText }
    : null;
  const selectedEvent = eventForMainScene(userEvent, nextPresence)
    || eventForMainScene(presenceEvent, nextPresence)
    || eventForMainScene(deterministicEvent, nextPresence)
    || eventForMainScene(characterEvent, nextPresence);

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

  const wardrobeEvent = userWardrobeEvent || characterWardrobeEvent;
  if (wardrobeEvent) {
    update.outfit = wardrobeEvent.outfit;
    update.outfitEvidence = {
      source: wardrobeEvent.source,
      kind: wardrobeEvent.phase,
      text: wardrobeEvent.evidence,
    };
  }

  if (selectedEvent) {
    update.location = selectedEvent.location;
    update.locationAuthority = "deterministic";
    update.locationOwner = selectedEvent.owner;
    update.locationEvidence = {
      source: selectedEvent.actor,
      kind: selectedEvent.kind,
      text: selectedEvent.evidence,
    };
    const modelEnvironment = isDetailedEnvironment(modelScene.environment) ? modelScene.environment : "";
    update.environment = explicitEnvironment || modelEnvironment || environmentForLocation(selectedEvent.location);
    const modelActivity = value(modelScene.activity);
    update.activity = transitionActivity
      || (modelActivity && modelActivity.toLowerCase() !== current.activity.toLowerCase() ? modelActivity : "")
      || `settling into ${selectedEvent.location}`;
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
