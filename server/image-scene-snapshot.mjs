import {
  cleanLocationLabel,
  cleanSceneActivity,
  environmentForLocation,
  isDetailedEnvironment,
} from "./environment.mjs";
import { classifyPlaceCandidate } from "./scene-events-v2.mjs";
import { optionalSceneFields } from "./scene-verification.mjs";

const roomNames = [
  "living room", "dining room", "locker room", "walk-in cooler", "walk-in freezer",
  "bedroom", "bathroom", "kitchen", "classroom", "office", "library", "gym",
  "lobby", "hallway", "laboratory", "workshop", "studio",
];
const settingNames = [
  ...roomNames,
  "restaurant", "cafe", "coffee shop", "bar", "club", "store", "shop", "mall",
  "park", "garden", "courtyard", "patio", "porch", "deck", "balcony", "rooftop",
  "street", "station", "airport", "garage", "beach", "pool", "forest", "woods",
  "mountain", "cave", "castle", "temple", "church", "hotel", "hospital", "museum",
  "theater", "cinema", "arena", "stadium", "field", "house", "apartment", "home",
  "school", "campus", "ship", "boat", "island", "city", "town", "village",
  "cooler", "refrigerator", "fridge", "freezer",
];

const escapedSettings = settingNames
  .sort((left, right) => right.length - left.length)
  .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const locativeSetting = new RegExp(`\\b(?:in|inside|at|on|near|outside|within)\\s+(?:(?:the|a|an)\\s+)?(${escapedSettings})\\b`, "giu");
const settingWord = new RegExp(`\\b(${escapedSettings})\\b`, "giu");
const ordinaryContainer = /^(?:cooler|refrigerator|fridge|freezer)$/i;
const environmentScaffold = /^the (?:setting|location|scene) is\b/i;
const environmentNarrativeAction = /^[)\]}\s]*(?:we|i|you|she|he|they|the character)\s+(?:dry|walk|step|move|head|go|went|come|came|enter|leave|left|arrive|reach|sit|stand|lie|lay|drop|dive|climb|crawl|run|ran|drive|drove|fly|flew)\w*\b/i;
const sentenceLikeActivity = /^(?:the scene|the setting|the location|there|this|that)\b/i;

function compact(value, limit = 520) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function canonicalSetting(value = "") {
  return String(value).toLowerCase().replace(/^walk[- ]in\s+/, "walk-in ").replace(/^woods$/, "forest");
}

function mentionedSettings(value = "") {
  return [...String(value || "").matchAll(settingWord)].map((match) => canonicalSetting(match[1]));
}

function settingFamily(value = "") {
  const key = canonicalSetting(value);
  if (roomNames.includes(key)) return "room";
  if (/^(?:cooler|refrigerator|fridge|freezer)$/.test(key)) return "object";
  if (/^(?:patio|porch|deck|balcony|rooftop|courtyard|garden|park|beach|forest|mountain|field)$/.test(key)) return "outdoor";
  if (/^(?:car|train|bus|ship|boat)$/.test(key)) return "vehicle";
  return "venue";
}

function settingsConflict(candidate, anchors) {
  const key = canonicalSetting(candidate);
  if (!anchors.size) return false;
  if (anchors.has(key)) return false;
  if (key === "home" && (anchors.has("house") || anchors.has("apartment"))) return false;
  if (key === "house" && anchors.has("home")) return false;
  if (key === "woods" && anchors.has("forest") || key === "forest" && anchors.has("woods")) return false;
  const family = settingFamily(key);
  const anchorFamilies = new Set([...anchors].map(settingFamily));
  // Different named rooms are mutually exclusive. Other broad setting words
  // (for example a patio at a restaurant) can legitimately describe the same
  // place, so only reject them when their families clearly cannot coexist.
  if (family === "room" && anchorFamilies.has("room")) return true;
  if (family === "object") return true;
  if (family === "vehicle" && !anchorFamilies.has("vehicle")) return true;
  if (family === "outdoor" && anchorFamilies.has("room")) return true;
  if (family === "room" && anchorFamilies.has("outdoor")) return true;
  return false;
}

function sanitizeBrief(brief = "", anchors = new Set()) {
  const issues = [];
  const sanitized = String(brief || "").replace(locativeSetting, (phrase, setting) => {
    if (!settingsConflict(setting, anchors)) return phrase;
    issues.push(`photo_brief_conflicts_with_scene:${canonicalSetting(setting)}`);
    return "";
  }).replace(/\s+([,.;:])/g, "$1")
    .replace(/,\s*,/g, ", ")
    .replace(/^\s*[,;:]\s*|\s*[,;:]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { brief: sanitized, issues };
}

/**
 * Builds a prompt-only, image-safe view of scene state. This never mutates or
 * persists the conversational scene. Its only job is to prevent malformed or
 * contradictory context from reaching the image model.
 */
export function buildImageSceneSnapshot(scene = {}, brief = "") {
  const rawLocation = cleanLocationLabel(scene?.location);
  const place = classifyPlaceCandidate(rawLocation, rawLocation);
  const issues = [];
  const location = place.valid ? place.label : "";
  if (rawLocation && !place.valid) issues.push(`location_rejected:${place.reason}`);

  const rawEnvironment = compact(scene?.environment);
  let environment = "";
  const groundedFinalEnvironment = scene?.environmentEvidence?.kind === "final_scene" && isVisibleFinalEnvironment(rawEnvironment);
  if (rawEnvironment && (groundedFinalEnvironment || isDetailedEnvironment(rawEnvironment)) && !environmentScaffold.test(rawEnvironment) && !environmentNarrativeAction.test(rawEnvironment)) {
    environment = rawEnvironment;
  } else if (rawEnvironment) {
    issues.push("environment_rejected:not_visual_setting");
  }
  const locationAnchors = new Set(mentionedSettings(location));
  const environmentConflict = locationAnchors.size
    && mentionedSettings(environment).some((setting) => settingsConflict(setting, locationAnchors));
  if (environmentConflict) {
    issues.push("environment_rejected:conflicts_with_location");
    environment = "";
  }
  if (!environment && location) {
    const fallback = compact(environmentForLocation(location));
    if (isDetailedEnvironment(fallback) && !environmentScaffold.test(fallback)) environment = fallback;
  }

  let activity = cleanSceneActivity(scene?.activity);
  if (activity && (sentenceLikeActivity.test(activity) || activity.split(/\s+/).length > 32)) {
    issues.push("activity_rejected:not_compact_staging");
    activity = "";
  }

  const anchors = new Set([
    ...locationAnchors,
    ...mentionedSettings(environment),
  ]);
  // A rejected ordinary container is never a valid photographic setting. If
  // it leaked into the brief too, the conflict pass removes it even when no
  // other setting survived.
  if (!place.valid && ordinaryContainer.test(place.label || rawLocation)) anchors.add("__not_a_container__");
  const briefResult = sanitizeBrief(brief, anchors);
  issues.push(...briefResult.issues);
  const posture = ["standing", "seated", "lying", "kneeling", "crouching"].includes(scene?.posture) ? scene.posture : "";
  if (posture) {
    const pose = { standing: "standing", sitting: "seated", seated: "seated", lying: "lying", reclining: "lying", kneeling: "kneeling", crouching: "crouching" };
    briefResult.brief = briefResult.brief.split(/(?<=[.!?])\s+|,\s*/).filter((clause) => {
      const poses = [...clause.matchAll(/\b(standing|sitting|seated|lying|reclining|kneeling|crouching)\b/gi)];
      const conflict = poses.some((match) => pose[match[1].toLowerCase()] !== posture);
      if (conflict) issues.push("photo_brief_conflicts_with_posture");
      return !conflict;
    }).join(", ");
  }

  return {
    version: 1,
    scene: {
      ...scene,
      location,
      environment,
      activity,
      ...Object.fromEntries(optionalSceneFields.filter(field => scene?.verification?.omitted?.includes(field)).map(field => [field, ""])),
    },
    brief: briefResult.brief,
    issues,
  };
}

import { isVisibleFinalEnvironment } from "./final-scene.mjs";
