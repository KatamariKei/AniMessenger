function clean(value, limit = 520) {
  return String(value || "")
    .replace(/\[(?:action|thought)\s*:\s*/gi, "")
    .replace(/\]/g, " ")
    .replace(/\b(?:before|around) me\b/gi, "around the viewer")
    .replace(/\bmy eyes\b/gi, "the viewer's eyes")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

const vagueEnvironment = /^(?:outside|inside|indoors?|outdoors?|somewhere(?: familiar)?|the area|the surroundings|nearby|unspecified(?: surroundings)?|same place|current (?:area|location|surroundings)|no change|unchanged)$/i;
const settingDetail = /\b(?:cloud sea|landscape|scenery|vista|view|horizon|skyline|rolling hills?|mountains?|peaks?|cliffs?|valleys?|fields?|meadows?|grass|forest|woods?|trees?|river|stream|lake|ocean|sea|beach|waterfall|garden|yards?|backyards?|courtyard|patio|porch|deck|flowers?|cityscape|street|buildings?|village|town|castle|temple|ruins?|room|hallway|kitchen|bedroom|classroom|gym|pool|balcony|rooftop|doorway|windows?|furniture|walls?|floor|ceiling|shore|desert|snow|rain|fog|clouds?)\b/i;
const visualQuality = /\b(?:vast|distant|craggy|rolling|green|wind(?:y|swept)?|waving|sunlit|moonlit|bright|dark|misty|foggy|snowy|lush|rocky|wooden|stone|ornate|crowded|empty|quiet|glowing|colorful|beautiful|breathtaking)\b/i;
const sceneTransition = /\b(?:arrive(?:d|s|ing)?|reach(?:ed|es|ing)?|enter(?:ed|s|ing)?|step(?:ped|s|ping)? (?:inside|into|outside|out)|walk(?:ed|s|ing)? (?:inside|into|outside|out)|go(?:es|ing)? (?:inside|outside|through)|come(?:s|ing)? (?:inside|outside|through)|leave(?:s|ing)?|left|open(?:ed|s|ing)? (?:the |a )?(?:door|gate|curtain|window)|emerge(?:d|s|ing)?|move(?:d|s|ing)? (?:into|outside|inside)|head(?:ed|s|ing)? (?:to|outside|inside)|look(?:ed|s|ing)? (?:out|around|over)|reveal(?:ed|s|ing)?)\b/i;
const directDescription = /\b(?:there (?:is|are)|surrounded by|opens? (?:onto|to)|overlooks?|reveals?|we (?:can )?see|i (?:can )?see|you (?:can )?see|the (?:room|area|landscape|scenery|view|vista|sky|ground|walls?|floor|horizon) (?:is|are|has|shows?))\b/i;
const vagueLocation = /^(?:somewhere(?: familiar)?|inside|outside|indoors?|outdoors?|nearby|same place|current location|unspecified)$/i;
const concretePlace = /\b(?:apartment|house|home|room|kitchen|bedroom|bathroom|living room|dining room|hall|hallway|lobby|office|classroom|school|campus|gym|locker room|arcade|restaurant|cafe|coffee shop|bar|club|store|shop|mall|park|garden|yard|backyard|front yard|courtyard|patio|porch|deck|street|road|station|airport|garage|car|train|bus|beach|pool|forest|woods|mountain|cave|castle|temple|church|hotel|hospital|library|museum|studio|theater|cinema|arena|stadium|rink|field|court|wing|estate|building|facility|base|headquarters|ship|boat|island|city|town|village)\b/i;
const completedLocationTransition = /\b(?:arrive(?:d|s|ing)?|enter(?:ed|s|ing)?|step(?:ped|s|ping)? (?:inside|into|outside|out)|walk(?:ed|s|ing)? (?:inside|into|outside|out)|went (?:inside|outside|into|to)|came (?:inside|outside|through|to)|come(?:s|ing)? through|emerge(?:d|s|ing)?|move(?:d|s|ing)? (?:into|outside|inside)|land(?:ed|s|ing)? (?:in|inside|at)|teleport(?:ed|s|ing)? (?:into|to)|(?:leave(?:s|ing)?|left)\b[^.!?;]{0,120}?\band\s+(?:then\s+)?(?:are\s+)?(?:walk(?:ed|s|ing)?|stroll(?:ed|s|ing)?|step(?:ped|s|ping)?|move(?:d|s|ing)?|head(?:ed|s|ing)?)\s+(?:along|onto|across|to|into|through)|(?:hear|heard) (?:a )?knock at (?:my|our|the) door)\b/i;
const currentPlaceActivity = /\b(?:taking a break from|working out|exercising|training|lifting|hitting (?:the )?weights|doing (?:strength|cardio)|cleaning|shopping|eating|having (?:breakfast|lunch|dinner)|waiting|sitting|standing|swimming|playing|practicing|studying|working)\b/i;
const futureOrHypotheticalPlace = /\b(?:will|would|might|maybe|later|tomorrow|plan(?:ning)? to|want(?:ing)? to|going to|head(?:ing)? to|on (?:my|our|the) way to|should (?:go|head)|could (?:go|head))\b/i;
const characterDirectionLead = /^(?:(?:she|he|they|the character|[a-z][a-z'-]+)\s+)?(?:looks?|looking|gazes?|gazing|glances?|glancing|stares?|staring|faces?|facing|turns?|turning|poses?|posing|strikes?|striking|stands?|standing|sits?|sitting|leans?|leaning)\b/i;
const sceneActionLead = /^(?:ok[, ]+)?(?:as\s+|once\s+|when\s+|while\s+)?(?:we|i|you|she|he|they|the character)\s+(?:(?:finally|then|now)\s+)?(?:arriv\w*|enter\w*|leav\w*|left|walk\w*|step\w*|mov\w*|head\w*|go(?:es|ing)?|went|com\w*|came|rac\w*|run(?:s|ning)?|ran|rush\w*|dash\w*|follow\w*|driv\w*|drove|rid\w*|rode|fl\w*|flew|climb\w*|return\w*|jump\w*|sit\w*|sat|stand\w*|stood|play\w*|wrestl\w*|roll\w*|laugh\w*|mak\w*|start\w*|beg\w*)\b/i;
const narrativeSubjectLead = /^(?:(?:as|once|when|while|after|before)\s+)?(?:we|i|you|she|he|they|the character)\b/i;
const properNarrativeActionLead = /^(?:[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,2})\s+(?:practically\s+)?(?:arriv\w*|enter\w*|leav\w*|walk\w*|step\w*|float\w*|mov\w*|head\w*|com\w*|return\w*|sit\w*|stand\w*|look\w*|smil\w*|laugh\w*)\b/u;
const transientEnvironmentState = /\b(?:is|are|was|were)\s+(?:already\s+)?(?:start(?:ing)?|beginning|changing|moving|taking shape)\b/i;

export function isDetailedEnvironment(value) {
  const normalized = clean(value);
  if (!normalized || vagueEnvironment.test(normalized)) return false;
  // Dialogue and figurative reactions can contain setting nouns without
  // describing any visible surroundings: '"The view" is an understatement.'
  if (/^["“][^"”]+["”]\s+(?:is|was|would be)\b/i.test(normalized)) return false;
  if (/\b(?:no room for|room for (?:error|doubt|improvement)|the room is moving|walls? (?:around|of) (?:your|her|his) heart)\b/i.test(normalized)) return false;
  if (/^the (?:setting|location|scene) is\b/i.test(normalized)) return false;
  // Pose, gaze, and expression directions sometimes mention a window or door.
  // Those are momentary character instructions, not persistent surroundings.
  if (characterDirectionLead.test(normalized)) return false;
  // A movement/action summary can name a room without describing its visible
  // surroundings. It belongs in activity, never the persistent environment.
  if (sceneActionLead.test(normalized) || narrativeSubjectLead.test(normalized) || properNarrativeActionLead.test(normalized) || transientEnvironmentState.test(normalized)) return false;
  const words = normalized.split(/\s+/).length;
  return settingDetail.test(normalized) && (words >= 4 || visualQuality.test(normalized));
}

export function inferEnvironmentCue(text = "") {
  const actionDescription = /\[action\s*:/i.test(String(text || ""));
  const normalized = clean(text);
  if (!normalized || !settingDetail.test(normalized)) return "";
  if (!sceneTransition.test(normalized) && !directDescription.test(normalized) && !(actionDescription && visualQuality.test(normalized))) return "";
  const clauses = normalized.split(/(?:\.{2,}|[.!?;])\s*/).map((part) => part.trim()).filter(Boolean);
  const cleanedClauses = clauses.map((part) => part
    .replace(/^(?:the viewer's|my|our) eyes (?:adjust(?:ed)?|take|took) (?:in|to)\s+/i, "")
    .replace(/^(?:the viewer|i|we) (?:look(?:ed)? around|take|took in)\s+/i, "")
    .trim());
  const descriptive = cleanedClauses.filter((part) => isDetailedEnvironment(part));
  return descriptive.length ? clean(descriptive.join(", "), 420) : "";
}

export function environmentChangeIsEstablished(text = "") {
  const normalized = clean(text);
  return Boolean(normalized && settingDetail.test(normalized) && (sceneTransition.test(normalized) || directDescription.test(normalized)));
}

// Bare infinitives after movement verbs describe intent, not a destination:
// "moved to settle his bill" must not create a place called "settle his bill".
const destinationAction = /^(?:and\b|meet\b|see\b|find\b|check\b|look\b|sit\b|stand\b|wait\b|sleep\b|eat\b|talk\b|help\b|get\b|make\b|do\b|have\b|settle\b|pay\b|order\b|buy\b|prepare\b|finish\b|grab\b|pick\b|take\b|change\b|dress\b|shower\b|kiss\b|speak\b|say\b|ask\b|tell\b|work\b|clock\b|leave\b)/i;
const trailingDestinationAction = /\s+(?:and(?: then)?|then)\s+(?=(?:arrive|enter|exit|leave|check|look|scan|search|browse|order|sip|drink|sit|stand|wait|start|begin|inspect|explore|talk|eat|play|watch|see|help|work|practice|train|relax|jump|dive|flop|collapse|lie|lay|climb|crawl|step|move|go|head|turn|drop|sink|slide|stretch|curl|snuggle|wrestle|roll|laugh|run|race|rush|dash)\w*\b).*/i;
const trailingDestinationClause = /\s+(?:and|but|because|while|where)\s+(?=(?:(?:the|a|an)\s+[\p{L}\p{N}'’-]+|this|that)\s+(?:is|are|was|were|feels?|felt|looks?|looked|seems?|seemed|has|had|hits?|hit|starts?|started|becomes?|became)\b).*/iu;

// A destination is a noun phrase. Coordinated clauses with their own subject
// belong to the story, even when the place itself is new to the application.
export function cleanLocationLabel(input = "") {
  return clean(input, 180)
    .split(/\s+(?:and|but|because|while|where)\s+(?=(?:i|we|you|she|he|they|it|there)\b)/i)[0]
    .replace(trailingDestinationClause, "")
    .replace(/\s+(?:looking|wearing|carrying|holding)\b.*$/i, "")
    .replace(trailingDestinationAction, "")
    .replace(/\s+(?:and|then)\s+(?:arrive|reach|finish)(?:s|d|ed|es|ing)?\b.*$/i, "")
    .split(/(?:\.{2,}|[!?;]|\.(?=\s|$))/)[0]
    .trim();
}

export function isRelativeLocation(input = "") {
  const location = cleanLocationLabel(input);
  return /^(?:(?:at|to|on|in)\s+)?(?:(?:the|a)\s+)?(?:(?:other|opposite|far|near|same|this|that)\s+(?:side|end|edge)|(?:side|end|edge)\s+of\s+(?:it|this|that)|over (?:here|there)|back (?:here|there)|here|there)\b/i.test(location);
}

export function cleanSceneActivity(input = "") {
  const activity = clean(input, 240).replace(/^[.\s]+/, "");
  if (/^(?:and\s+)?(?:i|we|you|she|he|they|it|there|no one|nobody)\b/i.test(activity)) return "";
  return activity;
}

const containedSceneArea = /^(?:the\s+)?(?:patio|terrace|balcony|booth|bar counter|counter|pool deck|garden|courtyard|rooftop|lobby)$/i;

export function resolveSceneLocation(currentLocation = "", proposedLocation = "") {
  const current = cleanLocationLabel(currentLocation);
  const proposed = cleanLocationLabel(proposedLocation);
  if (!proposed || !containedSceneArea.test(proposed)) return proposed;
  const area = proposed.replace(/^the\s+/i, "");
  if (!current || vagueLocation.test(current) || new RegExp(`\\b${area.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(current)) return proposed;
  const namedVenue = /['’]s\b/.test(current) || /^(?:[A-Z][\p{L}\p{N}'’&.-]+)(?:\s+[A-Z][\p{L}\p{N}'’&.-]+)*$/u.test(current);
  if (!namedVenue) return proposed;
  return cleanLocationLabel(`${current} ${area}`);
}

function concreteLocationFromPhrase(value, { allowOpenVocabulary = false } = {}) {
  const candidate = cleanLocationLabel(value)
    .replace(/\s+(?:right )?now$/i, "")
    .replace(/\s+(?:already|together)$/i, "")
    .trim();
  const match = concretePlace.exec(candidate);
  const knownPlace = match ? candidate.slice(0, match.index + match[0].length) : "";
  const openPlace = allowOpenVocabulary
    ? candidate.replace(trailingDestinationAction, "").trim()
    : "";
  const destination = allowOpenVocabulary ? openPlace : knownPlace;
  if (!destination || isRelativeLocation(destination) || destinationAction.test(destination) || destination.split(/\s+/).length > 12) return "";
  return clean(destination, 120)
    .replace(/^(?:at|in|into|inside|outside|on|to)\s+(?:the\s+)?/i, "")
    .trim();
}

export function inferLocationEvent(text = "", source = "user") {
  const normalized = clean(text, 700).replace(/[’]/g, "'");
  if (!normalized) return null;
  // Compound actions often move the user first and then explicitly reunite the
  // character with them: "I head to the kitchen; she joins me in the kitchen."
  // Treat the reunion as the authoritative shared destination instead of
  // stopping at the user's earlier solo movement.
  const joined = normalized.match(
    /\b(?:she|he|they|[a-z][a-z'-]*(?:\s+[a-z][a-z'-]*){0,2})\s+(?:join(?:s|ed|ing)?|follow(?:s|ed|ing)?)\s+(?:me|us|you)\s+(?:at|in|inside|into|outside|on)\s+([^,.!?;]+)/i,
  );
  if (joined?.[1]) {
    const location = concreteLocationFromPhrase(joined[1]);
    if (location && !vagueLocation.test(location)) {
      return { type: "location_change", phase: "arrived", kind: "rejoined", location, actor: "shared", evidence: normalized };
    }
  }
  const patterns = [
    { kind: "present", pattern: /\b(we|i|you|she|he|they)(?:'re|'m|'s| are| am| is)\s+(?:now\s+)?(?:at|in|inside|outside|on)\s+([^,.!?;]+)/i },
    { kind: "arrival", pattern: /\b(we|i|you|she|he|they)\s+(?:leave(?:s|ing)?|left)\b[^,.!?;]{0,120}?\band\s+(?:then\s+)?(?:are\s+)?(?:walk(?:ed|s|ing)?|stroll(?:ed|s|ing)?|step(?:ped|s|ping)?|move(?:d|s|ing)?|head(?:ed|s|ing)?)\s+(?:along|onto|across|to|into|through)\s+([^,.!?;]+)/i },
    { kind: "arrival", pattern: /\b(we|i|you|she|he|they)\s+(?:enter(?:ed|s)?|reach(?:ed|es)?)\s+((?:the|a|an)\s+[^,.!?;]+)/i },
    { kind: "arrival", pattern: /\b(we|i|you|she|he|they)\s+(?:arrive(?:d|s)?|enter(?:ed|s)?|walk(?:ed|s)?|step(?:ped|s)?|move(?:d|s)?|head(?:ed|s)?|go|went|come|came|race(?:d|s)?|run|ran|rush(?:ed|es)?|dash(?:ed|es)?|follow(?:ed|s)?|drive|drove|ride|rode|fly|flew|climb(?:ed|s)?|return(?:ed|s)?)\s+(?:at|in|into|to|inside|outside|along|onto|across)\s+([^,.!?;]+)/i },
  ];
  for (const { kind, pattern } of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[2]) continue;
    // Completed movement may establish a new named place that is not in a
    // finite vocabulary. Present-location statements remain conservative so
    // phrases such as "we're in trouble" cannot become scene locations.
    const location = concreteLocationFromPhrase(match[2], { allowOpenVocabulary: kind === "arrival" });
    if (!location || vagueLocation.test(location) || location.split(/\s+/).length > 12) continue;
    const subject = match[1].toLowerCase();
    const actor = subject === "we"
      ? "shared"
      : subject === "i"
        ? source
        : subject === "you"
          ? (source === "user" ? "character" : "user")
          : "character";
    return { type: "location_change", phase: "arrived", kind, location, actor, evidence: normalized };
  }
  return null;
}

// Action blocks are the user's direct description of the physical scene. They
// deserve a slightly broader present-location grammar than ordinary dialogue,
// where phrases such as "we're talking about meeting in the kitchen" must not
// silently move the scene. In particular, allow a visible state/action before
// a later locative phrase: "we're lying in bed, in the bedroom."
export function inferActionLocationEvent(text = "", source = "user") {
  const blocks = [...String(text || "").matchAll(/\[action\s*:\s*([^\]]+)\]/gi)]
    .map((match) => match[1])
    .filter(Boolean);
  for (const block of blocks.reverse()) {
    const direct = inferLocationEvent(block, source);
    if (direct) return { ...direct, kind: `action_${direct.kind}` };

    const normalized = clean(block, 700).replace(/[’]/g, "'");
    const state = normalized.match(
      /\b(we|i|you|she|he|they)(?:'re|'m|'s| are| am| is)\s+([^.!?;]{1,240})/i,
    );
    const placement = normalized.match(
      /\b(we|i|you|she|he|they)\s+((?:sit(?:s|ting)?(?:\s+down)?|sat|settle(?:s|d|ing)?(?:\s+down)?|lie(?:s|d|ing)?(?:\s+down)?|lay|stand(?:s|ing)?|stood)\b[^.!?;]{1,240})/i,
    );
    const spatial = state?.[2] ? state : placement;
    if (!spatial?.[2]) continue;

    let location = "";
    for (const match of spatial[2].matchAll(/(?=\b(?:at|in|inside|outside|on)\s+([^,.!?;]+))/gi)) {
      const candidate = concreteLocationFromPhrase(match[1]);
      if (candidate && !vagueLocation.test(candidate)) location = candidate;
    }
    if (!location) continue;

    const subject = spatial[1].toLowerCase();
    const actor = subject === "we"
      ? "shared"
      : subject === "i"
        ? source
        : subject === "you"
          ? (source === "user" ? "character" : "user")
          : "character";
    return {
      type: "location_change",
      phase: "arrived",
      kind: placement ? "action_placement" : "action_present",
      location,
      actor,
      evidence: normalized,
      ...(placement ? { activity: placementActivity(placement[2]) } : {}),
    };
  }
  return null;
}

function placementActivity(value = "") {
  return clean(value, 220)
    .replace(/^sit(?:s|ting)?(?:\s+down)?\b/i, "sitting")
    .replace(/^sat\b/i, "sitting")
    .replace(/^settle(?:s|d|ing)?(?:\s+down)?\b/i, "settling")
    .replace(/^(?:lie(?:s|d|ing)?|lay)(?:\s+down)?\b/i, "lying")
    .replace(/^(?:stand(?:s|ing)?|stood)\b/i, "standing")
    .replace(/\band\s+check\b/i, "and checking")
    .replace(/\band\s+look\b/i, "and looking")
    .replace(/\band\s+order\b/i, "and ordering")
    .trim();
}

export function inferDepartureEvent(text = "", currentLocation = "", source = "user") {
  const normalized = clean(text, 700).replace(/[’]/g, "'");
  if (!normalized) return null;
  const match = normalized.match(/\b(we|i|you|she|he|they)\s+(?:finally\s+|then\s+)?(?:leave(?:s|ing)?|left|exit(?:s|ed|ing)?)\s+(?:from\s+)?([^,.!?;]+)/i);
  if (!match?.[2]) return null;
  const departed = concreteLocationFromPhrase(match[2]);
  if (!departed || isRelativeLocation(departed)) return null;
  const subject = match[1].toLowerCase();
  const actor = subject === "we"
    ? "shared"
    : subject === "i"
      ? source
      : subject === "you"
        ? (source === "user" ? "character" : "user")
        : "character";
  const current = cleanLocationLabel(currentLocation);
  const samePlace = locationKey(current) === locationKey(departed);
  const location = `outside ${/^(?:the|a|an)\s+/i.test(departed) ? departed : "the " + departed}`;
  return {
    type: "location_change",
    phase: "departed",
    kind: "departure",
    location,
    actor,
    evidence: normalized,
    departedLocation: samePlace ? current : departed,
  };
}

export function inferExplicitLocation(text = "") {
  return inferLocationEvent(text)?.location || "";
}

export function inferTransitionActivity(text = "", event = null) {
  if (!event?.location) return "";
  const normalized = clean(text, 700);
  const locationIndex = normalized.toLowerCase().indexOf(event.location.toLowerCase());
  if (locationIndex < 0) return "";
  const remainder = normalized.slice(locationIndex + event.location.length)
    .replace(/^\s*(?:right )?now\b/i, "")
    .replace(/^\s*(?:,|and|then)\s*/i, "")
    .replace(/[.!?]+$/g, "")
    .trim();
  if (!remainder || remainder.split(/\s+/).length > 28) return "";
  // Only an action may override the model's activity; never the rest of the
  // sentence by default (for example "she was right... it's private").
  if (!/^(?:check|look|sit|stand|wait|start|begin|inspect|explor|talk|eat|play|watch|see|help|work|practic|train|relax|jump|wrestl|roll|laugh|run|rac|rush|dash|swim|walk|kiss|hold|mak|wash|cook|read|rest|danc)\w*\b/i.test(remainder)) return "";
  return cleanSceneActivity(remainder.split(/\s+(?:and|but)\s+(?=(?:i|we|you|she|he|they|it)\b)/i)[0]);
}

function locationKey(value) {
  let normalized = clean(value, 160).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  while (/^(?:at|in|inside|on|the|a|an)\s+/.test(normalized)) {
    normalized = normalized.replace(/^(?:at|in|inside|on|the|a|an)\s+/, "");
  }
  return normalized;
}

export function meaningfulLocationChange(currentLocation, nextLocation) {
  const current = locationKey(currentLocation);
  const next = locationKey(nextLocation);
  return Boolean(next && !vagueLocation.test(next) && current && current !== next);
}

export function locationChangeIsEstablished(currentLocation, nextLocation, evidence = "") {
  if (isRelativeLocation(nextLocation)) return false;
  const current = locationKey(currentLocation);
  const next = locationKey(nextLocation);
  if (!next || vagueLocation.test(next) || destinationAction.test(next)) return false;
  if (!current || vagueLocation.test(current)) return true;
  if (current === next) return true;

  const observed = clean(evidence, 700);
  if (!observed) return false;

  // Accept an explicit statement or correction of the present location, but do
  // not let an activity noun (for example "air hockey") silently teleport the
  // scene to a semantically associated place (for example an ice rink).
  const normalizedEvidence = locationKey(observed);
  const meaningfulWords = next.split(" ").filter((word) => word.length > 2 && !/^(?:the|and|with)$/.test(word));
  const namesNextLocation = normalizedEvidence.includes(next)
    || (meaningfulWords.length > 0 && meaningfulWords.every((word) => normalizedEvidence.includes(word)));
  const locationAnchor = meaningfulWords.at(-1) || "";
  const namesLocationAnchor = locationAnchor.length >= 3
    && new RegExp(`\\b${locationAnchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalizedEvidence);
  const completedNamedTransition = completedLocationTransition.test(observed)
    && (namesNextLocation || namesLocationAnchor || /\b(?:hear|heard) (?:a )?knock at (?:my|our|the) door\b/i.test(observed));
  if (completedNamedTransition) return true;
  const statesPresentLocation = /\b(?:(?:we|i|you|she|he|they)(?:\s+(?:are|am|is)|'(?:re|m|s))\s+(?:still\s+)?(?:at|in|inside|outside|on)|(?:our|the|my)\s+(?:current\s+)?location\s+is|we (?:never left|remain(?:ed)?|stayed))\b/i.test(observed);
  const reportsCurrentActivityThere = namesLocationAnchor
    && currentPlaceActivity.test(observed)
    && !futureOrHypotheticalPlace.test(observed);
  return (namesNextLocation && statesPresentLocation) || reportsCurrentActivityThere;
}

export function environmentForLocation(location) {
  const place = cleanLocationLabel(location);
  if (!place || vagueLocation.test(place)) return "";
  if (/^outside\b/i.test(place)) {
    return `An exterior area immediately outside ${place.replace(/^outside\s+(?:the\s+)?/i, "the ")}, with open air, a visible path away from the entrance, and surrounding outdoor details.`;
  }
  if (/\bkitchen\b/i.test(place)) {
    return "A warm, functional kitchen with counters, cabinets, cookware, and a clear food-preparation area.";
  }
  if (/\bliving room\b/i.test(place)) {
    return "A comfortable living room with a sofa, low table, curtained windows, warm lamplight, interior walls, and flooring.";
  }
  if (/\b(?:shower|bathroom)\b/i.test(place)) {
    return "A tiled bathroom shower with running water, rising steam, wet tile surfaces, and clearly visible bathroom walls and fixtures.";
  }
  if (/\bsauna\b/i.test(place)) {
    return "A cedar-lined sauna filled with dry heat and the scent of aromatic wood, with tiered benches and a warm amber glow.";
  }
  if (/\bindoor (?:swimming )?pool\b/i.test(place)) {
    return "An indoor swimming pool with clear water, tiled poolside flooring, reflected light on the water, and a high ceiling spanning the swimming hall.";
  }
  if (/\b(?:mountainous?|alpine) forest\b/i.test(place)) {
    return "A mountain forest with steep wooded terrain, dense trees, a narrow path, and crisp open air.";
  }
  if (/\b(?:forest|woods?)\b/i.test(place)) {
    return "A dense forest with layered trees, undergrowth, and a visible path through the landscape.";
  }
  if (/\b(?:cave|cavern|underground chamber)\b/i.test(place)) {
    return "A rocky cave chamber with irregular stone walls, uneven ground, shadowed recesses, and a visible passage deeper inside.";
  }
  if (/\bgarden\b/i.test(place)) {
    return "A detailed garden with layered plants, flowers, pathways, and setting-appropriate architecture.";
  }
  if (/\b(?:beach|shore)\b/i.test(place)) {
    return "An open shoreline with sand underfoot, water meeting the shore, and sky stretching to the horizon.";
  }
  if (/\bpatio\b/i.test(place) && !/\b(?:home|house|mansion|estate|yard|backyard|front yard)\b/i.test(place)) {
    return "A sunny outdoor restaurant patio with cafe tables, chairs, shade umbrellas, planters, and open morning air.";
  }
  if (/\b(?:yard|backyard|front yard|courtyard|patio|porch|deck)\b/i.test(place)) {
    return "An outdoor residential space with open ground, nearby exterior walls, landscaping, and visible features appropriate to the property.";
  }
  if (/\bbedroom\b/i.test(place)) {
    return "A furnished bedroom with a clearly visible bed, nightstands, soft bedding, interior walls, and comfortable residential lighting.";
  }
  if (/\broom\b/i.test(place)) {
    return `Inside ${place}, with walls, floor, furniture, and ordinary indoor details appropriate to the room.`;
  }
  if (/\b(?:apartment|house|home)\b/i.test(place)) {
    return `Inside ${place}, with furnished residential rooms, visible interior walls and flooring, and ordinary lived-in details.`;
  }
  return `The setting is ${place}.`;
}

export function stabilizeEnvironment(current, proposed, evidence = "", locations = {}) {
  const existing = clean(current);
  const candidate = clean(proposed);
  const observed = inferEnvironmentCue(evidence);
  if (meaningfulLocationChange(locations.currentLocation, locations.nextLocation)) {
    if (isDetailedEnvironment(candidate) && candidate.toLowerCase() !== existing.toLowerCase()) return candidate;
    if (isDetailedEnvironment(observed) && observed.toLowerCase() !== existing.toLowerCase()) return observed;
    return environmentForLocation(locations.nextLocation) || candidate || observed || existing;
  }
  if (candidate && isDetailedEnvironment(candidate) && environmentChangeIsEstablished(evidence)) return candidate;
  if (observed && isDetailedEnvironment(observed)) return observed;
  if (!candidate || vagueEnvironment.test(candidate)) {
    return isDetailedEnvironment(existing)
      ? existing
      : environmentForLocation(locations.nextLocation || locations.currentLocation);
  }
  if (!isDetailedEnvironment(candidate)) {
    return isDetailedEnvironment(existing)
      ? existing
      : environmentForLocation(locations.nextLocation || locations.currentLocation);
  }
  if (!existing || !isDetailedEnvironment(existing)) return candidate;
  return environmentChangeIsEstablished(evidence) ? candidate : existing;
}
