import { classifyPlaceCandidate } from "./scene-events-v2.mjs";
import { environmentForLocation } from "./environment.mjs";
import { normalizeWardrobePrompt, explicitCharacterGarmentRemoval, inferWardrobeEvent, removeWardrobeItems } from "./wardrobe.mjs";
import { pendingOutfitReveal } from "./photo-claim.mjs";

export const finalSceneFields = ["location", "environment", "activity", "outfit", "expression", "lighting", "presence", "posture"];
const postures = new Set(["standing", "seated", "lying", "kneeling", "crouching", "unknown"]);
const presences = new Set(["apart", "together", "uncertain"]);
const normalize = (value) => String(value || "").normalize("NFKC").replace(/[’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
const future = /\b(?:tomorrow|next (?:week|month|day)|will|would|might|could|should|plan(?:ning)? to|want to|going to)\b/i;
const negated = /\b(?:didn't|did not|haven't|have not|never|won't|will not)\b/i;
const anchorStop = new Set(["the", "our", "their", "her", "his", "inside", "outside", "house", "room", "interior", "private", "rental", "at", "in", "a", "an"]);

function groundedEvidence(evidence, options) {
  if (!evidence || evidence.phase !== "current" || !["user", "character"].includes(evidence.source) || !["user", "character", "shared"].includes(evidence.actor)) return "";
  const quote = String(evidence.quote || "").trim();
  const source = evidence.source === "user" ? options.userText : options.characterText;
  if (quote.length < 4 || !normalize(source).includes(normalize(quote))) return "";
  if (future.test(quote) || negated.test(quote)) return "";
  return quote;
}

// A direct user declaration is authoritative current-scene evidence, not a
// movement guess. It can correct a stale model location, but never infer travel
// from a mention, a question, or an intended destination.
function declaredSharedLocation(options) {
  const text = String(options.userText || "").replace(/[’]/g, "'");
  let declaration = null;
  for (const segment of text.match(/[^.!?;\n\]]+[.!?;\]]?/g) || []) {
    if (/\?\s*$/.test(segment)) continue;
    const clause = segment.replace(/[.!;\]]$/, "");
    if (future.test(clause) || negated.test(clause) || /\b(?:if|imagine|suppose|remember|yesterday)\b/i.test(clause)) continue;
    const match = clause.match(/^(?:\s*\[action:\s*)?\s*(we are|we're)\s+(?:(?:now|already|both|currently)\s+)*(?:(?:standing|sitting|seated|lying|kneeling|waiting|relaxing)\s+)?(?:in|inside|at)\s+(.+)$/i);
    if (!match) continue;
    let label = match[2].split(/\s+(?:while|with|where|doing|shopping|trying)\b|,/i)[0].trim();
    // "And" can join adjectives before the room noun. Only stop there once
    // the preceding words already identify a place; otherwise the actual
    // destination ("bright and spacious private quarters") gets discarded.
    for (const conjunction of label.matchAll(/\s+and\s+/gi)) {
      const prefix = label.slice(0, conjunction.index).trim();
      if (classifyPlaceCandidate(prefix, clause).valid) {
        label = prefix;
        break;
      }
    }
    if (!classifyPlaceCandidate(label, clause).valid) continue;
    declaration = { value: label, quote: clause.trim(), source: "user", actor: "shared", phase: "current" };
  }
  return declaration;
}

export function placeHasSourceAnchor(label, quote) {
  const words = normalize(label).match(/[\p{L}\p{N}'-]+/gu) || [];
  const specific = words.filter((word) => !anchorStop.has(word));
  const anchors = specific.length ? specific : words.filter((word) => !["the", "our", "a", "an", "in", "at", "inside", "outside"].includes(word));
  const source = normalize(quote);
  // Home/house/apartment are equivalent whole-home descriptions in an arrival.
  // Never use this equivalence to invent a particular room within that home.
  const home = /\b(?:home|house|apartment|flat|townhouse|townhome|residence)\b/i;
  const room = /\b(?:kitchen|living|bedroom|bathroom|hallway|balcony|bed|garage|study|office|dining|entryway|foyer)\b/i;
  if (home.test(label) && !room.test(label) && home.test(source)) return true;
  return anchors.some((word) => source.includes(word));
}

// Recover evidence only for the model's proposed destination, never guess a
// destination from a prop or a future mention. A completed shared arrival is
// authoritative even if the model omitted its structured quotation.
function completedArrivalEvidence(candidate, options, together) {
  if (!together || !classifyPlaceCandidate(candidate, "").valid) return null;
  for (const source of ["user", "character"]) {
    const text = String(source === "user" ? options.userText || "" : options.characterText || "");
    for (const raw of text.split(/[.!?;\n\]]/)) {
      const clause = raw.replace(/^\s*\[action:\s*/i, "").trim();
      if (!clause || future.test(clause) || negated.test(clause) || /\b(?:if|imagine|suppose|remember|yesterday)\b/i.test(clause)) continue;
      const shared = source === "user" ? /^we\b/i.test(clause) : /^(?:they|we|she|he|[A-Z][\p{L}'’-]+)\b/u.test(clause);
      const arrival = /\b(?:entered|enters|enter|arrived (?:at|in)|arrive (?:at|in)|reached|reach|(?:go|went|walk|walked|step|stepped|bounce|bounced)\s+(?:inside|into))\s+(?:the\s+|our\s+|their\s+)?/i;
      if (shared && arrival.test(clause) && placeHasSourceAnchor(candidate, clause)) return { source, actor: source === "user" ? "shared" : "character", phase: "current", quote: clause };
    }
  }
  return null;
}

export function isVisibleFinalEnvironment(value) {
  const text = String(value || "").trim();
  return text.split(/\s+/).length >= 4 && text.length <= 520
    && !/["“”]|\b(?:felt|feels|thought|thinks|smiled|laughed|said|replied)\b/i.test(text)
    && !/^(?:i|we|you|she|he|they)\b/i.test(text);
}

/** Commit the model's end-of-exchange scene, using exact source quotations.
 * Validation checks evidence and field shape; it never reparses movement verbs.
 */
export function applyFinalScene(existing, options = {}) {
  const proposed = options.modelScene || {};
  const evidence = options.sceneEvidence || {};
  const next = { ...existing };
  const decisions = [];
  const accepted = {};
  const sharedDeclaration = options.respectSharedDeclaration !== false && existing.presence === "together" ? declaredSharedLocation(options) : null;
  for (const field of finalSceneFields) {
    const proposedValue = typeof proposed[field] === "string" ? proposed[field].trim() : "";
    const placeKey = value => normalize(value).replace(/^(?:the|a|an)\s+/, "");
    const candidate = field === "location" && sharedDeclaration
      ? placeKey(proposedValue) === placeKey(sharedDeclaration.value) ? proposedValue : sharedDeclaration.value
      : proposedValue;
    if (!candidate || (!options.verifyUnchanged && !options.verifyFields?.includes(field) && normalize(candidate) === normalize(existing[field]))) continue;
    const declaration = field === "location" ? sharedDeclaration : null;
    const fieldEvidence = declaration || (groundedEvidence(evidence[field], options) ? evidence[field] :
      field === "location" ? completedArrivalEvidence(candidate, options, existing.presence === "together") : evidence[field]);
    const quote = groundedEvidence(fieldEvidence, options);
    let reason = quote ? "accepted" : "missing_current_source_quote";
    if (quote) {
      if (fieldEvidence.actor === "user" && ["outfit", "expression", "posture", "activity"].includes(field)) reason = "user_state_not_character_state";
      else if (field === "outfit" && fieldEvidence.source === "character" && pendingOutfitReveal(options.characterText)) reason = "outfit_change_still_pending";
      else if (field === "location") {
        const place = classifyPlaceCandidate(candidate, quote);
        const sourceText = fieldEvidence.source === "user" ? options.userText : options.characterText;
        if (!place.valid || !placeHasSourceAnchor(place.label, sourceText)) reason = place.valid ? "missing_place_anchor" : place.reason;
        else accepted[field] = { value: place.label, quote, evidence: fieldEvidence };
      } else if (field === "environment" && !isVisibleFinalEnvironment(candidate)) reason = "not_visible_surroundings";
      else if (field === "presence" && !presences.has(candidate)) reason = "invalid_presence";
      else if (field === "posture" && !postures.has(candidate)) reason = "invalid_posture";
      else if (candidate.length > (field === "environment" ? 520 : field === "outfit" ? 420 : 240)) reason = "field_too_long";
      else accepted[field] = { value: candidate, quote, evidence: evidence[field] };
    }
    decisions.push({ field, status: reason === "accepted" ? "accepted" : "rejected", reason });
  }
  // Deterministic user corrections retain precedence over an inferred proposal.
  const correction = options.deterministicPatch || {};
  const presenceCorrection = options.presencePatch || {};
  if (accepted.presence) next.presence = accepted.presence.value;
  if (presenceCorrection.presenceAuthority === "deterministic" && presences.has(presenceCorrection.presence)) next.presence = presenceCorrection.presence;
  const location = accepted.location;
  const locationChanged = location && normalize(location.value) !== normalize(existing.location);
  const userOnlyMove = location?.evidence.actor === "user" && next.presence !== "together";
  if (userOnlyMove) decisions.find(decision => decision.field === "location").scope = "user";
  if (location && userOnlyMove) next.userLocation = location.value;
  else if (location) {
    next.location = location.value;
    next.locationOwner = next.presence === "together" || location.evidence.actor === "shared" ? "shared" : "character";
    next.locationEvidence = { source: location.evidence.source, kind: "final_scene", text: location.quote };
    if (locationChanged) {
      next.environment = accepted.environment?.value || environmentForLocation(location.value);
      // Clear location-dependent staging when a move gives no replacement.
      next.activity = accepted.activity?.value || `settling into ${location.value}`;
      next.posture = accepted.posture?.value || "unknown";
      next.lighting = accepted.lighting?.value || "ambient light";
    }
  }
  const rejectedLocation = decisions.some((decision) => decision.field === "location" && decision.status === "rejected");
  for (const decision of decisions) {
    if (decision.status === "accepted" && (rejectedLocation || userOnlyMove) && ["environment", "activity", "lighting", "posture"].includes(decision.field)) {
      decision.status = "rejected";
      decision.reason = userOnlyMove ? "user_move_not_character_staging" : "dependent_on_rejected_location";
    }
  }
  for (const field of ["environment", "activity", "lighting", "posture", "outfit", "expression"]) {
    if ((rejectedLocation || userOnlyMove) && ["environment", "activity", "lighting", "posture"].includes(field)) continue;
    if (accepted[field]) next[field] = field === "outfit" ? normalizeWardrobePrompt(accepted[field].value) : accepted[field].value;
  }
  if (accepted.outfit) next.outfitEvidence = { source: accepted.outfit.evidence.source, kind: "final_scene", text: accepted.outfit.quote };
  if (accepted.environment && !rejectedLocation && !userOnlyMove) next.environmentEvidence = { source: accepted.environment.evidence.source, kind: "final_scene", text: accepted.environment.quote };
  else if (locationChanged && !userOnlyMove) delete next.environmentEvidence;
  if (correction.outfit) next.outfit = normalizeWardrobePrompt(correction.outfit);
  const userRemoval = explicitCharacterGarmentRemoval(options.userText, "user", options.characterName);
  const characterRemoval = explicitCharacterGarmentRemoval(options.characterText, "character", options.characterName);
  const laterChange = inferWardrobeEvent(options.characterText, "character", options.characterName);
  const removal = characterRemoval || (laterChange?.phase === "changed" && accepted.outfit ? null : userRemoval);
  if (removal && !correction.outfit) {
    const reduced = removeWardrobeItems(next.outfit, removal.removedGarments);
    if (reduced !== next.outfit) {
      next.outfit = reduced;
      next.outfitEvidence = { source: removal.source, kind: "final_scene", phase: "removed", text: removal.evidence };
      const outfitDecision = decisions.find(item => item.field === "outfit");
      if (outfitDecision) Object.assign(outfitDecision, { status: "accepted", reason: "explicit_garment_removal" });
      else decisions.push({ field: "outfit", status: "accepted", reason: "explicit_garment_removal" });
    }
  }
  if (next.presence === "together") {
    next.locationOwner = "shared";
    next.sharedLocation = next.characterLocation = next.userLocation = next.location;
  } else {
    next.characterLocation = next.location;
    delete next.sharedLocation;
    if (!userOnlyMove) next.locationOwner = "character";
  }
  const changed = finalSceneFields.some((field) => normalize(next[field]) !== normalize(existing[field])) || next.userLocation !== existing.userLocation;
  if (changed) next.revision = Number(existing.revision || 0) + 1;
  return { scene: next, decisions };
}
