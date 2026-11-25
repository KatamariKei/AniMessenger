import { classifyPlaceCandidate, evaluateSceneTurnV2, isApproximatePosture } from "./scene-events-v2.mjs";
import { environmentForLocation, inferEnvironmentCue } from "./environment.mjs";
import { normalizeWardrobePrompt, explicitCharacterGarmentRemoval, inferWardrobeEvent, removeWardrobeItems, conditionalWardrobeAction } from "./wardrobe.mjs";
import { pendingOutfitReveal } from "./photo-claim.mjs";

export const finalSceneFields = ["location", "environment", "activity", "outfit", "expression", "lighting", "presence", "posture"];
const postures = new Set(["standing", "seated", "lying", "kneeling", "crouching", "unknown"]);
const presences = new Set(["apart", "together", "uncertain"]);
const normalize = (value) => String(value || "").normalize("NFKC").replace(/[’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
const future = /\b(?:tomorrow|next (?:week|month|day)|will|would|might|could|should|plan(?:ning)? to|want to|going to)\b/i;
const negated = /\b(?:didn't|did not|haven't|have not|never|won't|will not)\b/i;
const anchorStop = new Set(["the", "our", "their", "her", "his", "inside", "outside", "house", "room", "interior", "private", "rental", "at", "in", "a", "an"]);
export const isGenericHomeLocation = value => /^(?:(?:the|his|her|their|our|my|your)\s+)?(?:home|house|apartment|living room)$/.test(normalize(value));

function groundedEvidence(evidence, options) {
  if (!evidence || evidence.phase !== "current" || !["user", "character"].includes(evidence.source) || !["user", "character", "shared"].includes(evidence.actor)) return "";
  const quote = String(evidence.quote || "").trim();
  const source = evidence.source === "user" ? options.userText : options.characterText;
  if (quote.length < 4 || !normalize(source).includes(normalize(quote))) return "";
  if (future.test(quote) || negated.test(quote)) return "";
  return quote;
}

function approximatePostureQuote(quote, sourceText) {
  if (isApproximatePosture(quote)) return true;
  const source = normalize(sourceText);
  const excerpt = normalize(quote);
  let index = source.indexOf(excerpt);
  while (index !== -1) {
    const prefix = source.slice(Math.max(0, index - 60), index);
    const modifier = prefix.match(/\b(?:almost|nearly|practically|virtually|about to|started to)\s+(?:\w+\s+){0,2}$/);
    if (!modifier || !isApproximatePosture(modifier[0] + excerpt)) return false;
    index = source.indexOf(excerpt, index + excerpt.length);
  }
  return true;
}

// A direct user declaration is authoritative current-scene evidence, not a
// movement guess. It can correct a stale model location, but never infer travel
// from a mention, a question, or an intended destination.
export function declaredSharedLocation(options) {
  const text = String(options.userText || "").replace(/[’]/g, "'");
  let declaration = null;
  for (const segment of text.match(/[^.!?;\n\]]+[.!?;\]]?/g) || []) {
    if (/\?\s*$/.test(segment)) continue;
    const clause = segment.replace(/[.!;\]]$/, "");
    if (future.test(clause) || negated.test(clause) || /\b(?:if|imagine|suppose|remember|yesterday)\b/i.test(clause)) continue;
    const currentPlace = clause.match(/^(?:\s*\[action:\s*)?\s*(?:we are|we're)\s+(?:(?:now|already|both|currently)\s+)*(?:(?:standing|sitting|seated|lying|kneeling|waiting|relaxing)\s+)?(?:in|inside|at)\s+(.+)$/i)?.[1];
    const seatedPlace = clause.match(/^\s*\[action:\s*we\s+(?:sit|sat)(?: down)?\s+(?:on\s+[^,;]+?\s+)?(?:in|inside)\s+(.+)$/i)?.[1];
    const gatedArrival = clause.match(/^\s*\[action:\s*we\s+(?:enter|entered|walk|walked|step|stepped|pass|passed)\s+through\s+(?:(?:the|a|an)\s+)?(?:[\w-]+\s+){0,4}(?:gates?|entrance|doors?)\s+(?:of|to)\s+(.+)$/i)?.[1];
    const enteredRoom = clause.match(/^\s*\[action:\s*we\s+(?:(?:enter|entered)\s+.+?\s+and\s+(?:then\s+)?(?:we\s+)?)?(?:walk|walked|step|stepped|go|went)\s+(?:into|inside)\s+(.+)$/i)?.[1];
    const travelPlace = clause.match(/^\s*\[action:\s*we\s+(?:walk|walked|stroll|strolled)\s+(?:side by side\s+|together\s+)?(?:along|down|across)\s+(.+?)(?=\s+(?:on (?:our|the) way to|towards?)\b|$)/i)?.[1];
    const enteredRoute = clause.match(/^\s*\[action:\s*we\s+(?:leave|left|exit|exited)\s+[^,]+?,?\s+and\s+(?:then\s+)?(?:we\s+)?(?:enter|entered|(?:step|stepped|walk|walked) onto)\s+([^,]+?\b(?:streets?|roads?))(?=\s+(?:and|on (?:our|the) way to|to|towards?)\b|,|$)/i)?.[1];
    const place = currentPlace || seatedPlace || gatedArrival || enteredRoom || (enteredRoute || travelPlace)?.replace(/\b(street|road)s$/i, "$1");
    if (!place) continue;
    let label = place.split(/\s+(?:while|with|where|doing|shopping|trying)\b|,/i)[0].trim();
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

export function directedSceneLocation({ userText } = {}) {
  const text = String(userText || "");
  const blocks = [...text.matchAll(/\[action\s*:\s*([^\]]+)\]/gi)].map(match => match[1]);
  for (const block of (blocks.length ? blocks : [text]).toReversed()) {
    const clauses = block.match(/[^.!?;\n]+[.!?;]?/g) || [];
    for (const raw of clauses.toReversed()) {
      const quote = raw.trim().replace(/[.!;]$/, "");
      const direction = quote.match(/^(?:please\s+)?(?:(?:let['’]s\s+)?focus on (?:her|his|their|the character['’]s) narrative and\s+|let['’]s\s+)?(?:change|set|switch)\s+(?:the\s+)?(?:scene location|location|setting|scene)\s+to\s+(.+)$/i);
      if (!direction || future.test(quote) || negated.test(quote) || /\b(?:if|tomorrow|later)\b/i.test(quote)) continue;
      const place = classifyPlaceCandidate(direction[1], quote);
      if (!place.valid) continue;
      const key = value => normalize(value).replace(/^the\s+/, "");
      const venue = clauses.map(clause => clause.match(/\b(?:at|inside|in)\s+([^,.!?;]+?)\s+(bar|pub|tavern)\b/i))
        .find(match => match && key(match[1]) === key(place.label));
      return { value: place.label, quote, source: "user", actor: "character", phase: "current",
        ...(venue ? { environment: `${venue[2].toLowerCase()} interior` } : {}) };
    }
  }
  return null;
}

// Visible narration can establish a place even if the model's structured
// scene fields are empty or stale. A place mentioned in dialogue is weaker.
export function narratedCurrentLocation({ characterText, characterName, allowUnnamedCharacter = true } = {}) {
  const names = String(characterName || "").trim();
  const subjects = ["she", "he", "they", "we", names, names.split(/\s+/)[0]]
    .filter(Boolean).map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const subject = `(?:${subjects.join("|")})`;
  const location = new RegExp(
    `(?:^|,\\s*)(${subject})\\s+(?:(?:finally|now|already)\\s+)*` +
      String.raw`(?:(?:arrived? (?:at|in)|entered?|reached|(?:stepped|walked|went|came) (?:into|inside))|(?:is|are|was|were|remained)\s+(?:(?:now|already|still|currently)\s+)*(?:(?:working|standing|sitting|waiting|in (?:her|his|their) element)\s+)?(?:at|inside|in))\s+([^,]+)`,
    "i",
  );
  const departure = new RegExp(`^(?:${subject})\\s+(?:then\\s+)?(?:left|departed|walked out of|stepped out of)\\b`, "i");
  const narration = String(characterText || "").replace(/“[^”]*”|"[^"]*"/g, " ");
  for (const sentence of (narration.match(/[^.!?;\n]+[.!?;]?/g) || []).toReversed()) {
    const clause = sentence.trim();
    if (clause.endsWith("?") || future.test(clause) || negated.test(clause)
      || /\b(?:if|imagin\w*|suppose|remember\w*|recall\w*|yesterday|last night|earlier|used to|had been|not|never)\b/i.test(clause)) continue;
    if (departure.test(clause)) return null;
    const match = clause.replace(/[.!;]$/, "").match(location);
    if (!match) continue;
    if (!allowUnnamedCharacter && /^(?:she|he)$/i.test(match[1])) return null;
    const quote = match[0].replace(/^,\s*/, "");
    const label = match[2].split(/\s+(?:while|where|with|as|during|when|because)\b/i)[0];
    const place = classifyPlaceCandidate(label, quote);
    if (!place.valid) continue;
    const surroundings = narration.slice(narration.lastIndexOf(quote));
    const venue = surroundings.match(/\b(?:moved|walked|stepped)\s+through\s+the\s+(bar|pub|tavern)\b/i)?.[1];
    const environment = inferEnvironmentCue(surroundings) || (venue ? `${venue.toLowerCase()} interior` : "");
    return { value: place.label, quote, source: "character",
      actor: /^(?:they|we)$/i.test(match[1]) ? "shared" : "character", phase: "current", environment };
  }
  return null;
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

export function explicitSeatingAction(userText, characterName) {
  const name = normalize(characterName);
  for (const match of String(userText || "").matchAll(/\[action:\s*([^\]]+)\]/gi)) {
    const action = normalize(match[1]);
    if (future.test(action) || negated.test(action)) continue;
    if (/^we(?:(?:'re| are) (?:both )?(?:sitting|seated)| (?:both )?(?:sit|sat))(?: down)? (?:on|in|at)\b/.test(action)) return true;
    for (const subject of new Set([name, name.split(" ")[0]].filter(Boolean))) {
      if (action.startsWith(subject + " ") && /^(?:(?:is|remains|stays) (?:still )?(?:sitting|seated)|sits|sat)\b/.test(action.slice(subject.length + 1))) return true;
    }
  }
  return false;
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
  const locationDirection = options.respectSharedDeclaration !== false
    ? directedSceneLocation(options) || (existing.presence === "together" ? declaredSharedLocation(options) : null)
    : null;
  const narratedPlace = options.respectSharedDeclaration !== false && !locationDirection && options.characterNarration
    ? narratedCurrentLocation({ characterText: options.characterNarration, characterName: options.characterName }) : null;
  const narratedFallback = narratedPlace
    && (normalize(narratedPlace.value) !== normalize(existing.location) || options.verifyFields?.includes("location"))
    && (!proposed.location || !groundedEvidence(evidence.location, options) || normalize(proposed.location) === normalize(existing.location))
    ? narratedPlace : null;
  const explicitLocation = locationDirection || narratedFallback;
  for (const field of finalSceneFields) {
    const proposedValue = typeof proposed[field] === "string" ? proposed[field].trim() : "";
    // An unspecified pose does not undo the last pose. A confirmed room change
    // still resets posture when the new room has no pose evidence.
    if (field === "posture" && proposedValue === "unknown") continue;
    const placeKey = value => normalize(value).replace(/^(?:the|a|an)\s+/, "");
    const candidate = field === "location" && explicitLocation
      ? placeKey(proposedValue) === placeKey(explicitLocation.value) ? proposedValue : explicitLocation.value
      : proposedValue;
    if (!candidate || (!options.verifyUnchanged && !options.verifyFields?.includes(field) && normalize(candidate) === normalize(existing[field]))) continue;
    // A summary such as "home" cannot erase a specific established residence.
    if (field === "location" && !locationDirection && isGenericHomeLocation(candidate)
      && !isGenericHomeLocation(existing.location)
      && /\b(?:home|house|apartment|townhouse|townhome|condo|flat|residence|living room)\b/i.test(existing.location)
      && !completedArrivalEvidence(candidate, options, existing.presence === "together")) continue;
    const declaration = field === "location" ? explicitLocation : null;
    const fieldEvidence = declaration || (groundedEvidence(evidence[field], options) ? evidence[field] :
      field === "location" ? completedArrivalEvidence(candidate, options, existing.presence === "together") : evidence[field]);
    const quote = groundedEvidence(fieldEvidence, options);
    let reason = quote ? "accepted" : "missing_current_source_quote";
    const evidenceText = fieldEvidence?.source === "user" ? options.userText : options.characterText;
    const outfitQuote = field === "outfit" ? normalize(fieldEvidence?.quote) : "";
    const outfitClauses = outfitQuote
      ? String(evidenceText || "").split(/[.!?;\n]/).filter(clause => normalize(clause).includes(outfitQuote.replace(/[.!?;]+$/, "")))
      : [];
    if (field === "outfit" && (conditionalWardrobeAction(fieldEvidence?.quote)
      || (outfitClauses.length && outfitClauses.every(conditionalWardrobeAction)))) reason = "conditional_outfit";
    else if (quote) {
      if (fieldEvidence.actor === "user" && ["outfit", "expression", "posture", "activity"].includes(field)) reason = "user_state_not_character_state";
      else if (field === "outfit" && fieldEvidence.source === "character" && pendingOutfitReveal(options.characterText)) reason = "outfit_change_still_pending";
      else if (field === "location") {
        const place = classifyPlaceCandidate(candidate, quote);
        const sourceText = fieldEvidence.source === "user" ? options.userText : options.characterText;
        if (!place.valid || !placeHasSourceAnchor(place.label, sourceText)) reason = place.valid ? "missing_place_anchor" : place.reason;
        else accepted[field] = { value: place.label, quote, evidence: fieldEvidence };
      } else if (field === "environment" && !isVisibleFinalEnvironment(candidate)) reason = "not_visible_surroundings";
      else if (field === "presence" && !presences.has(candidate)) reason = "invalid_presence";
      else if (field === "posture" && (!postures.has(candidate) || approximatePostureQuote(quote,
        fieldEvidence.source === "user" ? options.userText : options.characterText))) reason = "invalid_posture";
      else if (field === "posture" && candidate === "standing" && ["seated", "lying", "kneeling", "crouching"].includes(existing.posture)
        && !/\b(?:stand(?:s|ing)?|stood|rose|ris(?:e|es|ing)|got up|gets? up|on (?:her|his|their) feet|walk(?:s|ed|ing)?|step(?:s|ped|ping)?)\b/i.test(quote)) reason = "invalid_posture";
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
      next.environment = accepted.environment?.value || explicitLocation?.environment || environmentForLocation(location.value);
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
  if (next.presence === "together" && explicitSeatingAction(options.userText, options.characterName)) {
    const narration = String(options.characterText || "").replace(/“[^”]*”|"[^"]*"/g, " ");
    const laterPose = evaluateSceneTurnV2(next, { characterText: narration }).accepted
      .findLast(event => event.kind === "set_posture" && event.actorIds.includes("character"));
    next.posture = laterPose?.payload.posture || "seated";
    const postureDecision = decisions.find(decision => decision.field === "posture");
    const verified = { field: "posture", status: "accepted", reason: "explicit_seating_action" };
    if (postureDecision) Object.assign(postureDecision, verified);
    else decisions.push(verified);
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
