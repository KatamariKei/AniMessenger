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
const completedLocationTransition = /\b(?:arrive(?:d|s|ing)?|enter(?:ed|s|ing)?|step(?:ped|s|ping)? (?:inside|into|outside|out)|walk(?:ed|s|ing)? (?:inside|into|outside|out)|went (?:inside|outside|into|to)|came (?:inside|outside|through|to)|come(?:s|ing)? through|emerge(?:d|s|ing)?|move(?:d|s|ing)? (?:into|outside|inside)|land(?:ed|s|ing)? (?:in|inside|at)|teleport(?:ed|s|ing)? (?:into|to)|(?:hear|heard) (?:a )?knock at (?:my|our|the) door)\b/i;
const currentPlaceActivity = /\b(?:taking a break from|working out|exercising|training|lifting|hitting (?:the )?weights|doing (?:strength|cardio)|cleaning|shopping|eating|having (?:breakfast|lunch|dinner)|waiting|sitting|standing|swimming|playing|practicing|studying|working)\b/i;
const futureOrHypotheticalPlace = /\b(?:will|would|might|maybe|later|tomorrow|plan(?:ning)? to|want(?:ing)? to|going to|head(?:ing)? to|on (?:my|our|the) way to|should (?:go|head)|could (?:go|head))\b/i;
const characterDirectionLead = /^(?:(?:she|he|they|the character|[a-z][a-z'-]+)\s+)?(?:looks?|looking|gazes?|gazing|glances?|glancing|stares?|staring|faces?|facing|turns?|turning|poses?|posing|strikes?|striking|stands?|standing|sits?|sitting|leans?|leaning)\b/i;
const sceneActionLead = /^(?:ok[, ]+)?(?:we|i|you|she|he|they|the character)\s+(?:arrive|enter|walk|step|move|head|go|went|come|came|race|run|rush|dash|follow|drive|ride|fly|climb|return|jump|sit|stand|play|wrestle|roll|laugh|make|start|begin)\b/i;

export function isDetailedEnvironment(value) {
  const normalized = clean(value);
  if (!normalized || vagueEnvironment.test(normalized)) return false;
  if (/\b(?:no room for|room for (?:error|doubt|improvement)|the room is moving|walls? (?:around|of) (?:your|her|his) heart)\b/i.test(normalized)) return false;
  if (/^the (?:setting|location|scene) is\b/i.test(normalized)) return false;
  // Pose, gaze, and expression directions sometimes mention a window or door.
  // Those are momentary character instructions, not persistent surroundings.
  if (characterDirectionLead.test(normalized)) return false;
  // A movement/action summary can name a room without describing its visible
  // surroundings. It belongs in activity, never the persistent environment.
  if (sceneActionLead.test(normalized)) return false;
  const words = normalized.split(/\s+/).length;
  return settingDetail.test(normalized) && (words >= 4 || visualQuality.test(normalized));
}

export function inferEnvironmentCue(text = "") {
  const actionDescription = /\[action\s*:/i.test(String(text || ""));
  const normalized = clean(text);
  if (!normalized || !settingDetail.test(normalized)) return "";
  if (!sceneTransition.test(normalized) && !directDescription.test(normalized) && !(actionDescription && visualQuality.test(normalized))) return "";
  const clauses = normalized.split(/(?:\.{2,}|[.!?;])\s*/).map((part) => part.trim()).filter(Boolean);
  const descriptive = clauses.filter((part) => settingDetail.test(part) || (visualQuality.test(part) && clauses.some((item) => settingDetail.test(item))));
  return clean((descriptive.length ? descriptive : [normalized]).join(", "), 420);
}

export function environmentChangeIsEstablished(text = "") {
  const normalized = clean(text);
  return Boolean(normalized && settingDetail.test(normalized) && (sceneTransition.test(normalized) || directDescription.test(normalized)));
}

const destinationAction = /^(?:and\b|meet\b|see\b|find\b|check\b|look\b|sit\b|stand\b|wait\b|sleep\b|eat\b|talk\b|help\b|get\b|make\b|do\b|have\b)/i;
const trailingDestinationAction = /\s+(?:and(?: then)?|then)\s+(?=(?:check|look|sit|stand|wait|start|begin|inspect|explore|talk|eat|play|watch|see|help|work|practice|train|relax|jump|wrestle|roll|laugh|run|race|rush|dash)\b).*/i;

// A destination is a noun phrase. Coordinated clauses with their own subject
// belong to the story, even when the place itself is new to the application.
export function cleanLocationLabel(input = "") {
  return clean(input, 180)
    .split(/\s+(?:and|but|because|while|where)\s+(?=(?:i|we|you|she|he|they|it|there)\b)/i)[0]
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
  const patterns = [
    { kind: "present", pattern: /\b(we|i|you|she|he|they)(?:'re|'m|'s| are| am| is)\s+(?:now\s+)?(?:at|in|inside|outside|on)\s+([^,.!?;]+)/i },
    { kind: "arrival", pattern: /\b(we|i|you|she|he|they)\s+(?:enter(?:ed|s)?|reach(?:ed|es)?)\s+((?:the|a|an)\s+[^,.!?;]+)/i },
    { kind: "arrival", pattern: /\b(we|i|you|she|he|they)\s+(?:arrive(?:d|s)?|enter(?:ed|s)?|walk(?:ed|s)?|step(?:ped|s)?|move(?:d|s)?|head(?:ed|s)?|go|went|come|came|race(?:d|s)?|run|ran|rush(?:ed|es)?|dash(?:ed|es)?|follow(?:ed|s)?|drive|drove|ride|rode|fly|flew|climb(?:ed|s)?|return(?:ed|s)?)\s+(?:at|in|into|to|inside|outside)\s+([^,.!?;]+)/i },
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
  if (!next || vagueLocation.test(next)) return false;
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
  if (/\bkitchen\b/i.test(place)) {
    return "A warm, functional kitchen with counters, cabinets, cookware, and a clear food-preparation area.";
  }
  if (/\bliving room\b/i.test(place)) {
    return "A comfortable living room with a sofa, low table, curtained windows, warm lamplight, interior walls, and flooring.";
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
  if (/\b(?:yard|backyard|front yard|courtyard|patio|porch|deck)\b/i.test(place)) {
    return "An outdoor residential space with open ground, nearby exterior walls, landscaping, and visible features appropriate to the property.";
  }
  if (/\b(?:bed)?room\b/i.test(place)) {
    return `Inside ${place}, with walls, floor, furniture, and ordinary indoor details appropriate to the room.`;
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
