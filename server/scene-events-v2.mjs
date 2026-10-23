import {
  cleanLocationLabel,
  inferActionLocationEvent,
  inferDepartureEvent,
  inferLocationEvent,
  isRelativeLocation,
} from "./environment.mjs";

const placeWord = /\b(?:rental|apartment|house|home|room|kitchen|bedroom|bathroom|hall|hallway|lobby|office|classroom|school|campus|gym|locker room|arcade|restaurant|cafe|coffee shop|bar|club|store|shop|mall|park|garden|yard|courtyard|patio|porch|deck|street|road|station|airport|garage|car|train|bus|beach|pool|forest|woods|mountain|cave|castle|temple|church|hotel|hospital|library|museum|studio|theater|cinema|arena|stadium|rink|field|court|wing|estate|building|facility|base|headquarters|ship|boat|island|city|town|village|observatory|laboratory|workshop|warehouse|rooftop|balcony|terrace|shoreline)\b/i;
const objectWord = /^(?:(?:the|a|an)\s+)?(?:cooler|refrigerator|fridge|freezer|table|chair|sofa|couch|bed|door|gate|window|counter|barrel|cabinet|shelf|locker|box|crate|bag|bottle|glass|cup|jukebox|railing)\b/i;
const inhabitableObject = /\b(?:walk[- ]in cooler|walk[- ]in freezer|vehicle interior|inside (?:the )?(?:car|train|bus|ship|boat))\b/i;
const actionTail = /\s+(?:and(?: then)?|then)\s+(?:(?:i|we|you|she|he|they|the character)\s+)?(?:poured?|grabbed?|opened?|closed?|drank|drinks?|sat|stood|looked?|checked?|searched?|ordered?|started?|began|smiled?|laughed?|talked?|ate|held|leaned?|walked?|moved?|turned?)\b.*$/i;
const purposeTail = /\s+to\s+(?:inventory|inspect|check|search|look|grab|take|pour|drink|eat|sit|stand|talk|work|clean|prepare|open|close|help|find|see|meet|order|buy|rest|sleep|change|dress)\b.*$/i;
const futureCue = /\b(?:will|would|might|maybe|later|tomorrow|plan(?:ning)? to|want(?:ing)? to|going to|should|could)\b/i;
const hypotheticalCue = /\b(?:if|unless|imagine|suppose|what if)\b/i;
const negatedCue = /\b(?:did not|didn't|does not|doesn't|never|not going|won't|wouldn't)\b/i;
const posturePatterns = [
  { posture: "lying", activity: "sleeping", eyes: "closed", pattern: /\b(we|i|you|she|he|they|[A-Z][\p{L}'’-]+)\s+(?:sleep(?:s|ing)?|slept|(?:is|are|was|were)\s+asleep)\b([^.!?;]*)/iu, defaultSupport: "bed" },
  { posture: "lying", pattern: /\b(we|i|you|she|he|they|[A-Z][\p{L}'’-]+)\b[^.!?;]{0,100}?\b(?:dive(?:s|d|ing)?|climb(?:s|ed|ing)?|crawl(?:s|ed|ing)?|get(?:s|ting)?|got)\s+(?:down\s+)?(?:in|into|onto|on)\s+(?:the\s+|a\s+)?(bed|sofa|couch)\b([^.!?;]*)/iu, supportCapture: 2 },
  { posture: "seated", pattern: /\b(we|i|you|she|he|they|[A-Z][\p{L}'’-]+)\s+shift(?:s|ed|ing)?\s+(?:back\s+)?(?:in|into|onto)\s+(?:her|his|their|the|a|an)?\s*(lounger|chair|seat|sofa|couch)\b([^.!?;]*)/iu, supportCapture: 2 },
  { posture: "seated", pattern: /\b(we|i|you|she|he|they|[A-Z][\p{L}'’-]+)\s+(?:sit(?:s|ting)?(?:\s+down)?|sat|settle(?:s|d|ing)?(?:\s+down)?)\b([^.!?;]*)/iu },
  { posture: "lying", pattern: /\b(we|i|you|she|he|they|[A-Z][\p{L}'’-]+)\s+(?:lie(?:s|d|ing)?(?:\s+down)?|lay|recline(?:s|d|ing)?)\b([^.!?;]*)/iu },
  { posture: "kneeling", pattern: /\b(we|i|you|she|he|they|[A-Z][\p{L}'’-]+)\s+(?:kneel(?:s|ed|ing)?)\b([^.!?;]*)/iu },
  { posture: "crouching", pattern: /\b(we|i|you|she|he|they|[A-Z][\p{L}'’-]+)\s+(?:crouch(?:es|ed|ing)?)\b([^.!?;]*)/iu },
  { posture: "standing", pattern: /\b(we|i|you|she|he|they|[A-Z][\p{L}'’-]+)\s+(?:stand(?:s|ing)?|stood|lean(?:s|ed|ing)?\s+against)\b([^.!?;]*)/iu },
];

const shadowMetrics = {
  turns: 0,
  candidateTurns: 0,
  acceptedCandidates: 0,
  rejectedCandidates: 0,
  legacyDisagreements: 0,
  acceptedKinds: Object.create(null),
  rejectedKinds: Object.create(null),
  reasons: Object.create(null),
};

function compact(value, limit = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function locationKey(value = "") {
  return cleanLocationLabel(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/^(?:(?:at|in|inside|on|the|a|an)\s+)+/, "").trim();
}

function entityId(prefix, value) {
  const key = locationKey(value).replace(/\s+/g, "-").slice(0, 64) || "unknown";
  return `${prefix}:${key}`;
}

function actorIds(subject, source) {
  const normalized = String(subject || "").toLowerCase();
  if (normalized === "shared" || normalized === "we") return ["user", "character"];
  if (normalized === "user" || normalized === "i" && source === "user" || normalized === "you" && source === "character") return ["user"];
  return ["character"];
}

function evidenceFor(text, channel, messageId = "") {
  const quote = compact(text, 700);
  return quote ? [{
    messageId: String(messageId || `latest-${channel}`),
    channel,
    start: 0,
    end: quote.length,
    quote,
  }] : [];
}

function temporalFor(text) {
  const value = compact(text, 700);
  if (negatedCue.test(value)) return { temporal: "current", modality: "negated" };
  if (hypotheticalCue.test(value)) return { temporal: "hypothetical", modality: "uncertain" };
  if (futureCue.test(value)) return { temporal: "future", modality: "asserted" };
  return { temporal: "current", modality: "asserted" };
}

export function classifyPlaceCandidate(input = "", evidence = "") {
  const raw = cleanLocationLabel(input);
  const label = raw.replace(actionTail, "").replace(purposeTail, "").trim();
  if (!label) return { valid: false, label: "", kind: "unknown", reason: "empty_destination" };
  if (isRelativeLocation(label)) return { valid: false, label, kind: "unknown", reason: "relative_destination" };
  if (actionTail.test(raw) || /\b(?:and|then)\s+(?:poured?|grabbed?|drank|opened?|closed?)\b/i.test(raw)) {
    const objectLabel = raw.replace(actionTail, "").trim();
    if (objectWord.test(objectLabel) && !inhabitableObject.test(objectLabel + " " + evidence)) {
      return { valid: false, label: objectLabel, kind: "object", reason: "destination_is_object" };
    }
    return { valid: false, label, kind: "unknown", reason: "destination_contains_action" };
  }
  if (objectWord.test(label) && !inhabitableObject.test(label + " " + evidence)) {
    return { valid: false, label, kind: "object", reason: "destination_is_object" };
  }
  const words = label.split(/\s+/).filter(Boolean);
  const named = /^(?:(?:the|a|an)\s+)?[A-Z][\p{L}\p{N}'’&.-]+(?:\s+(?:and|of|the|&|[A-Z][\p{L}\p{N}'’&.-]+)){0,7}$/u.test(label);
  const residentialPlace = /\b(?:townhouse|townhome|condo|condominium|duplex|bungalow|cottage|cabin|flat|residence|driveway|entryway|foyer|vestibule|mudroom|basement|attic)\b/i;
  if (!placeWord.test(label) && !residentialPlace.test(label) && !/\b(?:boutique|hot springs?|onsen|thermal baths?|spa)\b/i.test(label) && !inhabitableObject.test(label + " " + evidence) && !named) return { valid: false, label, kind: "unknown", reason: "destination_not_place_like" };
  if (words.length > 12) return { valid: false, label, kind: "unknown", reason: "destination_too_long" };
  const kind = /\b(?:bedroom|bathroom|kitchen|classroom|office|room|hall|hallway|lobby|laboratory|workshop|entryway|foyer|vestibule|mudroom|basement|attic|walk[- ]in)\b/i.test(label)
    ? "room"
    : /\b(?:deck|patio|porch|yard|garden|courtyard|balcony|rooftop|beach|forest|woods|mountain|field|street|shoreline|driveway)\b/i.test(label)
      ? "outdoor_area"
      : /\b(?:car|train|bus|ship|boat)\b/i.test(label)
        ? "vehicle_interior"
        : "venue";
  return { valid: true, label, kind, reason: "place_candidate" };
}

function eventFromLegacy(event, channel, order, messageId) {
  if (!event) return null;
  const evidence = compact(event.evidence, 700);
  const timing = temporalFor(evidence);
  const place = classifyPlaceCandidate(event.location, evidence);
  if (!place.valid && place.kind === "object") {
    return {
      id: `candidate-${channel}-${order}`,
      baseRevision: 0,
      order,
      actorIds: actorIds(event.actor, channel === "user_action" || channel === "user_dialogue" ? "user" : "character"),
      kind: "interact_object",
      payload: { objectId: entityId("object", place.label), label: place.label },
      evidence: evidenceFor(evidence, channel, messageId),
      ...timing,
      validation: { status: timing.temporal === "current" && timing.modality === "asserted" ? "accepted" : "rejected", reason: place.reason },
    };
  }
  const status = place.valid && timing.temporal === "current" && timing.modality === "asserted" ? "accepted" : "rejected";
  return {
    id: `candidate-${channel}-${order}`,
    baseRevision: 0,
    order,
    actorIds: actorIds(event.actor, channel === "user_action" || channel === "user_dialogue" ? "user" : "character"),
    kind: event.phase === "departed" ? "depart" : "arrive",
    payload: { placeId: place.valid ? entityId("place", place.label) : null, label: place.label, placeKind: place.kind },
    evidence: evidenceFor(evidence, channel, messageId),
    ...timing,
    validation: { status, reason: status === "accepted" ? "grounded_current_place" : place.reason || `${timing.temporal}_${timing.modality}` },
  };
}

function postureCandidate(match, definition, channel, order, messageId, subjectOverride = "") {
  const { posture, activity = null, eyes = null, supportCapture = 0, defaultSupport = "" } = definition;
  const subject = subjectOverride || match[1];
  const support = supportCapture && match[supportCapture]
    ? match[supportCapture]
    : match[0].match(/\b(?:on|against|beside|near|in|into|onto)\s+(?:(?:her|his|their|the|a|an)\s+)?([\p{L}\p{N}'’-]+(?:\s+[\p{L}\p{N}'’-]+){0,2}?)(?=\s+(?:and|while|as)\b|[,.!?;]|$)/iu)?.[1] || defaultSupport;
  const timing = temporalFor(match[0]);
  const accepted = timing.temporal === "current" && timing.modality === "asserted";
  const offset = Math.max(0, Number(match.index) || 0);
  return {
    id: `candidate-${channel}-posture-${order}-${offset}`,
    baseRevision: 0,
    order: order + Math.min(0.99, offset / 10000),
    actorIds: actorIds(subject, channel.startsWith("user") ? "user" : "character"),
    kind: "set_posture",
    payload: {
      posture,
      activity,
      eyes,
      supportObjectId: support ? entityId("object", support) : null,
      supportObjectLabel: support || null,
    },
    evidence: evidenceFor(match[0], channel, messageId),
    ...timing,
    validation: {
      status: accepted ? "accepted" : "rejected",
      reason: accepted ? "explicit_posture" : `${timing.temporal}_${timing.modality}:explicit_posture`,
    },
    _subject: subject,
    _offset: offset,
  };
}

function postureEvents(text, channel, order, messageId) {
  const value = compact(text, 700);
  const events = [];
  for (const definition of posturePatterns) {
    const flags = definition.pattern.flags.includes("g") ? definition.pattern.flags : definition.pattern.flags + "g";
    for (const match of value.matchAll(new RegExp(definition.pattern.source, flags))) {
      events.push(postureCandidate(match, definition, channel, order, messageId));
    }
  }

  // Coordinated narration commonly elides the repeated subject: “she stood
  // up, grabbed the drinks, and sat back down.” Inherit the latest explicit
  // actor in the same sentence, then let textual order choose the final state.
  const continuation = /\b(?:and|then)\s+(?:(we|i|you|she|he|they)\s+)?(sat(?:\s+back)?(?:\s+down)?|stood(?:\s+back)?(?:\s+up)?|lay(?:\s+back)?(?:\s+down)?|knelt(?:\s+down)?|crouched(?:\s+down)?)\b/giu;
  for (const match of value.matchAll(continuation)) {
    const prior = [...events].filter((event) => event._offset < match.index).sort((a, b) => b._offset - a._offset)[0];
    const subject = match[1] || prior?._subject;
    if (!subject) continue;
    const verb = match[2].toLowerCase();
    const posture = /^sat/.test(verb) ? "seated" : /^stood/.test(verb) ? "standing" : /^lay/.test(verb) ? "lying" : /^knelt/.test(verb) ? "kneeling" : "crouching";
    const duplicate = events.some((event) => event.payload.posture === posture && Math.abs(event._offset - match.index) < 24);
    if (!duplicate) events.push(postureCandidate(match, { posture }, channel, order, messageId, subject));
  }
  return events.sort((left, right) => left.order - right.order).map(({ _subject, _offset, ...event }) => event);
}

function textCandidates(text, source, order, messageId) {
  const channel = source === "user"
    ? /\[action\s*:/i.test(String(text || "")) ? "user_action" : "user_dialogue"
    : "narration";
  const arrival = inferActionLocationEvent(text, source) || inferLocationEvent(text, source);
  const departure = arrival ? null : inferDepartureEvent(text, "", source);
  return [
    eventFromLegacy(arrival || departure, channel, order, messageId),
    ...postureEvents(text, channel, order + 0.01, messageId),
  ].filter(Boolean);
}

export function normalizeSceneStateV2(existing = {}) {
  const location = cleanLocationLabel(existing.location || "");
  const place = classifyPlaceCandidate(location, "");
  const placeId = place.valid ? entityId("place", place.label) : null;
  const fact = (value, status = "confirmed") => ({ value, status, evidence: [], establishedAtEventId: "legacy-import" });
  return {
    version: 2,
    revision: Math.max(0, Math.trunc(Number(existing.revision) || 0)),
    places: placeId ? { [placeId]: { id: placeId, label: place.label, kind: place.kind, parentId: null } } : {},
    objects: {},
    actors: {
      character: { placeId: fact(placeId, placeId ? "provisional" : "unknown"), movement: null, posture: fact("unknown", "unknown"), supportObjectId: fact(null, "unknown"), spatialRelations: fact([], "unknown"), activity: fact(existing.activity || null, existing.activity ? "provisional" : "unknown"), outfit: fact(existing.outfit || null, existing.outfit ? "confirmed" : "unknown") },
      user: { placeId: fact(existing.presence === "together" ? placeId : null, existing.presence === "together" && placeId ? "provisional" : "unknown"), movement: null, posture: fact("unknown", "unknown"), supportObjectId: fact(null, "unknown"), spatialRelations: fact([], "unknown"), activity: fact(null, "unknown"), outfit: fact(null, "unknown") },
    },
    environmentByPlace: {},
    pendingCandidates: [],
  };
}

export function evaluateSceneTurnV2(existing = {}, options = {}, legacyNext = existing) {
  const state = normalizeSceneStateV2(existing);
  const candidates = [
    ...textCandidates(options.userText, "user", 10, options.userMessageId),
    ...textCandidates(options.characterText, "character", 20, options.characterMessageId),
  ].sort((left, right) => left.order - right.order);
  const accepted = candidates.filter((candidate) => candidate.validation.status === "accepted");
  const rejected = candidates.filter((candidate) => candidate.validation.status !== "accepted");
  for (const event of accepted) {
    if (event.kind === "arrive" && event.payload.placeId) {
      state.places[event.payload.placeId] ||= { id: event.payload.placeId, label: event.payload.label, kind: event.payload.placeKind, parentId: null };
      for (const actorId of event.actorIds) {
        state.actors[actorId].placeId = { value: event.payload.placeId, status: "confirmed", evidence: event.evidence, establishedAtEventId: event.id };
        state.actors[actorId].movement = null;
      }
      state.revision += 1;
    } else if (event.kind === "depart") {
      for (const actorId of event.actorIds) state.actors[actorId].movement = { originId: state.actors[actorId].placeId.value, destinationId: null, phase: "departed" };
    } else if (event.kind === "interact_object") {
      state.objects[event.payload.objectId] ||= { label: event.payload.label, kind: "container", placeId: state.actors.character.placeId.value };
    } else if (event.kind === "set_posture") {
      for (const actorId of event.actorIds) {
        state.actors[actorId].posture = { value: event.payload.posture, status: "confirmed", evidence: event.evidence, establishedAtEventId: event.id };
        state.actors[actorId].supportObjectId = { value: event.payload.supportObjectId, status: event.payload.supportObjectId ? "confirmed" : "unknown", evidence: event.evidence, establishedAtEventId: event.id };
      }
    }
  }
  state.pendingCandidates = rejected;
  const characterPlaceId = state.actors.character.placeId.value;
  const projectedLocation = characterPlaceId ? state.places[characterPlaceId]?.label || "" : "";
  return {
    state,
    candidates,
    accepted,
    rejected,
    projectedLocation,
    legacyLocation: cleanLocationLabel(legacyNext?.location || ""),
    disagreesWithLegacy: Boolean(projectedLocation && locationKey(projectedLocation) !== locationKey(legacyNext?.location)),
  };
}

export function recordSceneShadowEvaluation(existing = {}, options = {}, legacyNext = existing) {
  const evaluation = evaluateSceneTurnV2(existing, options, legacyNext);
  shadowMetrics.turns += 1;
  if (evaluation.candidates.length) shadowMetrics.candidateTurns += 1;
  shadowMetrics.acceptedCandidates += evaluation.accepted.length;
  shadowMetrics.rejectedCandidates += evaluation.rejected.length;
  if (evaluation.disagreesWithLegacy) shadowMetrics.legacyDisagreements += 1;
  for (const candidate of evaluation.accepted) {
    shadowMetrics.acceptedKinds[candidate.kind] = (shadowMetrics.acceptedKinds[candidate.kind] || 0) + 1;
  }
  for (const candidate of evaluation.rejected) {
    const reason = candidate.validation.reason || "unknown";
    shadowMetrics.rejectedKinds[candidate.kind] = (shadowMetrics.rejectedKinds[candidate.kind] || 0) + 1;
    shadowMetrics.reasons[reason] = (shadowMetrics.reasons[reason] || 0) + 1;
  }
  return evaluation;
}

export function sceneShadowMetrics() {
  return structuredClone(shadowMetrics);
}

