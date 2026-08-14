import { normalizeWardrobePrompt } from "./wardrobe.mjs";

const clothingWords = [
  "apron", "armor", "bikini", "blazer", "blindfold", "boots", "cape", "cardigan",
  "casual clothes", "coat", "costume", "dress", "detached sleeves", "gloves", "gown",
  "gym uniform", "haori", "hat", "hoodie", "jacket", "japanese clothes", "jeans",
  "kimono", "necktie", "pajamas", "pants", "plugsuit", "robe", "school uniform",
  "shirt", "shoes", "shorts", "skirt", "sleeves", "socks", "suit", "sweater",
  "swimsuit", "uniform", "vest", "white shawl",
];

const identityWords = [
  "eyes", "eye", "hair", "twintails", "ponytail", "braid", "ahoge", "ears", "horns",
  "tail", "wings", "scar", "mole", "freckles", "skin", "fang", "antennae", "1girl",
  "1boy", "1other", "no humans", "long hair", "short hair", "very long hair",
];

const correctionGarments = [
  "tank top", "t-shirt", "tee shirt", "school uniform", "gym uniform", "swimsuit",
  "pajamas", "pyjamas", "underwear", "lingerie", "robe", "uniform", "jacket",
  "cardigan", "sweater", "hoodie", "blazer", "coat", "shirt", "shorts", "skirt",
  "dress", "pants", "jeans", "bikini", "apron", "armor", "cape", "kimono",
];

const correctionGarmentPattern = correctionGarments
  .sort((a, b) => b.length - a.length)
  .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

export const CHARACTER_PHOTO_NEGATIVE = "first-person POV, character unseen, scenery-only image, food-only image";

export function mergePromptTags(...values) {
  const seen = new Set();
  return values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

function cleanOutfitLayer(value) {
  return String(value || "")
    .replace(/^\s*(?:a|an|the)\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[,; ]+|[,; ]+$/g, "")
    .trim();
}

function outfitLayers(value) {
  return String(value || "")
    .split(/\s+(?:layered\s+)?(?:over|under|with|plus|and)\s+/i)
    .map(cleanOutfitLayer)
    .filter(Boolean);
}

function garmentFrom(value) {
  return String(value || "").toLowerCase().match(new RegExp("\\b(" + correctionGarmentPattern + ")\\b", "i"))?.[1]?.toLowerCase() || null;
}

function preferredLayer(candidate, garment, currentLayers) {
  const cleanCandidate = cleanOutfitLayer(candidate);
  const matchingCurrent = currentLayers.find((layer) => layer.toLowerCase().includes(garment));
  if (!matchingCurrent) return cleanCandidate;
  const candidateWords = cleanCandidate.toLowerCase().split(/\s+/).filter(Boolean);
  const preservesCurrent = candidateWords.length === 1 || candidateWords.every((word) => matchingCurrent.toLowerCase().includes(word));
  return preservesCurrent ? matchingCurrent : cleanCandidate;
}

export function inferOutfitCorrection(text = "", currentOutfit = "") {
  const value = String(text).replace(/\s+/g, " ").trim();
  const currentLayers = outfitLayers(currentOutfit);
  const exclusive = value.match(new RegExp(
    "\\b(?:just|only)\\s+(?:(?:the|a|an|my|your|her|his|their)\\s+)?([^,.!?;]{0,48}?\\b(" + correctionGarmentPattern + ")\\b)",
    "i",
  ));
  if (exclusive) {
    const garment = exclusive[2].toLowerCase();
    const outfit = preferredLayer(exclusive[1], garment, currentLayers);
    const excluded = currentLayers.filter((layer) => layer !== outfit && !layer.toLowerCase().includes(outfit.toLowerCase()));
    return { outfit, excluded, exclusive: true };
  }

  const removal = value.match(new RegExp(
    "\\b(?:without|no|remove|take off|lose|get rid of)\\s+(?:(?:the|a|an|my|your|her|his|their)\\s+)?([^,.!?;]{0,36}?\\b(" + correctionGarmentPattern + ")\\b)",
    "i",
  ));
  if (removal) {
    const garment = removal[2].toLowerCase();
    const kept = currentLayers.filter((layer) => !layer.toLowerCase().includes(garment));
    const excluded = currentLayers.filter((layer) => layer.toLowerCase().includes(garment));
    if (kept.length && excluded.length) return { outfit: kept.join(" and "), excluded, exclusive: false };
  }

  return null;
}

export function isClothingTag(tag) {
  const normalized = String(tag).toLowerCase();
  return clothingWords.some((word) => normalized === word || normalized.includes(word));
}

export function splitVisualTags(tags = []) {
  const clean = [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
  const wardrobe = clean.filter(isClothingTag);
  const identity = clean.filter((tag) => !isClothingTag(tag) && identityWords.some((word) => tag.toLowerCase().includes(word)));
  const signature = clean.filter((tag) => !identity.includes(tag) && !wardrobe.includes(tag));
  return { identity, signature, wardrobe };
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function portraitWardrobe(outfit = "") {
  const lowerBodyCue = "(?:high slit|pelvic curtain|thigh-?high|thighhigh|skirt|shorts|pants|trousers|boots|shoes|stockings|socks)";
  const trailingClause = new RegExp("\\s+(?:with|featuring|and)\\s+(?:an?\\s+)?(?:[\\w-]+\\s+){0,3}" + lowerBodyCue + "\\b.*$", "i");
  const trailingList = new RegExp(",\\s*(?:and\\s+)?(?:[\\w-]+\\s+){0,3}" + lowerBodyCue + "\\b.*$", "i");
  const cleaned = String(outfit || "")
    .replace(/\s+/g, " ")
    .replace(trailingClause, "")
    .replace(trailingList, "")
    .replace(/[;,\s]+$/, "")
    .trim();
  return cleaned || "character-appropriate upper garment";
}

export function portraitExpression(persona = {}) {
  const traits = Array.isArray(persona?.traits) ? persona.traits.map((trait) => String(trait).trim()).filter(Boolean) : [];
  const voice = [traits.join(" "), persona?.speechStyle, ...(Array.isArray(persona?.emotionalRules) ? persona.emotionalRules : [])].join(" ").toLowerCase();
  if (/stoic|reserved|serious|disciplined|calm|professional/.test(voice)) return "subtle composed expression, calm eyes, quiet confidence, restrained emotion true to the character";
  if (/shy|timid|anxious|guarded|hesitant|soft-spoken/.test(voice)) return "gentle reserved expression, slightly hesitant eyes, faint natural smile, understated warmth true to the character";
  if (/playful|mischievous|cheerful|energetic|teasing|upbeat/.test(voice)) return "subtle playful expression, lively eyes, small knowing smile true to the character";
  if (/confident|bold|assertive|charismatic|flirtatious/.test(voice)) return "assured character-appropriate expression, direct eyes, restrained confident half-smile";
  if (/kind|compassionate|warm|nurturing|gentle|empathetic/.test(voice)) return "warm attentive expression, kind eyes, soft natural smile true to the character";
  const traitCue = traits.slice(0, 3).join(", ");
  return traitCue
    ? "natural understated expression reflecting " + traitCue + ", true to the character"
    : "natural understated expression true to the character";
}

function escaped(value) {
  return String(value || "").replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
}

function replaceViewerReferences(value, userName = "") {
  let normalized = String(value || "")
    .replace(/\b(?:the\s+)?user['\u2019]s\b/giu, "the viewer's")
    .replace(/\b(?:the\s+)?user\b/giu, "the viewer");
  const cleanName = String(userName || "").trim();
  if (cleanName) {
    const name = escaped(cleanName);
    normalized = normalized
      .replace(new RegExp("\\b" + name + "['\u2019]s\\b", "giu"), "the viewer's")
      .replace(new RegExp("\\b" + name + "\\b", "giu"), "the viewer");
  }
  return normalized;
}

function dedupePromptPhrases(value) {
  const seen = new Set();
  return String(value || "")
    .split(/(\n\s*\n)/)
    .map((section) => {
      if (/^\n\s*\n$/.test(section)) return "\n\n";
      return section.split(/([,;])/).reduce((result, part, index, all) => {
        if (part === "," || part === ";") return result;
        const clean = part.replace(/\s+/g, " ").trim();
        if (!clean) return result;
        const key = clean.toLowerCase().replace(/[- ]camera/g, " camera");
        if (seen.has(key)) return result;
        seen.add(key);
        const previousSeparator = index > 0 && (all[index - 1] === ";" || all[index - 1] === ",") ? all[index - 1] : ",";
        return result ? result + previousSeparator + " " + clean : clean;
      }, "");
    })
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function reduceCharacterNameMentions(value, name) {
  const aliases = [String(name || "").trim(), String(name || "").trim().match(/^[\p{L}\p{N}'\u2019-]+/u)?.[0]]
    .filter((item, index, all) => item && item.length > 2 && all.indexOf(item) === index)
    .sort((a, b) => b.length - a.length)
    .map(escaped);
  if (!aliases.length) return value;
  let seen = false;
  return String(value).replace(new RegExp("(?:" + aliases.join("|") + ")", "giu"), (match, offset, source) => {
    if (!seen) {
      seen = true;
      return match;
    }
    const prior = source.slice(0, offset).trimEnd();
    return !prior || /[.!?]\s*$/.test(prior) ? "The character" : "the character";
  });
}

export function normalizeCharacterPhotoBrief(brief = "", character = {}, options = {}) {
  const value = replaceViewerReferences(
    String(brief || "").split(/\n\s*\n/).map((section) => section.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n\n"),
    options.userName,
  ).trim();
  if (!value) return "";
  const name = String(character?.name || "the character").trim() || "the character";
  const names = [name, ...name.match(/[\p{L}\p{N}]+/gu) || []]
    .filter((item, index, all) => item.length > 1 && all.indexOf(item) === index)
    .sort((a, b) => b.length - a.length)
    .map((item) => item.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&"));
  const owner = [
    ...(names.length ? ["(?:" + names.join("|") + ")[\u2019']s"] : []),
    "her",
    "his",
    "their",
    "the character[\u2019']s",
  ].join("|");
  let normalized = value
    .replace(new RegExp("\\bfrom\\s+(?:" + owner + ")\\s+(?:perspective|point of view|pov)\\b", "giu"), "of " + name)
    .replace(/\bfrom\s+the viewer['\u2019]s\s+(?:perspective|point of view|pov)\b/giu, "from the viewer's side")
    .replace(/\b(?:first[- ]person)\s+(?:perspective|point of view|view|pov)\b/giu, "third-person view of " + name)
    .replace(/\bpov\s+(?:shot|view|angle)\b/giu, "third-person view of " + name)
    .replace(/\bexternal[- ]camera\s+(?:view|shot|angle)\b/giu, "")
    .replace(/\bfrom\s+(?:a|the)\s+camera\s+positioned\s+(?:at|on|near)\s+/giu, "from ")
    .replace(/\b(?:a|the)\s+camera\s+positioned\s+(?:at|on|near)\s+/giu, "a viewpoint from ")
    .replace(/\blooking\s+(toward|at|into)\s+(?:the\s+)?camera\b/giu, "looking $1 the viewer");
  const guards = [];
  if (!new RegExp(name.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&") + "\\s+clearly visible in frame", "i").test(normalized)) {
    guards.push(name + " clearly visible in frame");
  }
  normalized = guards.length ? guards.join(", ") + ", " + normalized : normalized;
  const deduped = dedupePromptPhrases(normalized);
  return options.reduceCharacterNames === false ? deduped : reduceCharacterNameMentions(deduped, name);
}

export function buildImagePrompt(profile, character, scene, brief = "", options = {}) {
  const visual = effectiveVisual(profile);
  const identity = list(visual.identity);
  const signature = list(visual.signature);
  const normalizedBrief = normalizeCharacterPhotoBrief(brief, character, options);
  const outfit = normalizeWardrobePrompt(scene?.outfit && scene.outfit !== "default outfit"
    ? scene.outfit
    : visual.defaultWardrobe);
  const identityAndScene = [
    "1person",
    "adult",
    "age 18 or older",
    character.trigger || character.name,
    ...identity,
    ...signature,
    outfit,
    scene?.location,
    scene?.activity,
    scene?.expression,
    scene?.lighting,
  ];
  const continuity = [
    "solo focus",
    "anime illustration",
    "highly coherent character identity",
  ];
  return [identityAndScene, [normalizedBrief], continuity]
    .map((section) => [...new Set(section.map((part) => String(part || "").trim()).filter(Boolean))].join(", "))
    .filter(Boolean)
    .join("\n\n");
}

export function visualExceptionNegative(profile) {
  const exceptions = effectiveVisual(profile).exceptions;
  return exceptions.length ? "user-corrected visual exclusions: " + exceptions.join(", ") : "";
}

export function inferSceneCue(text = "") {
  const value = String(text).toLowerCase();
  const schoolTransition = /\b(?:at|to|inside|outside|around) (?:the )?(?:school|classroom|campus)\b/.test(value)
    || /\b(?:go|going|head|heading|come|coming|meet|arrive|return|back)(?:\s+\w+){0,4}\s+(?:school|classroom|campus)\b/.test(value)
    || /\b(?:school|class) uniform\b/.test(value);
  if (schoolTransition) {
    return { location: "at school", activity: "spending time at school", outfit: "character-appropriate school uniform" };
  }
  const trainingTransition = /\b(?:at|to|inside) (?:the )?(?:gym|training area)\b/.test(value)
    || /\b(?:go|going|head|heading|come|coming|meet|arrive)(?:\s+\w+){0,4}\s+(?:gym|training area)\b/.test(value)
    || /\b(?:working out|work out together|start (?:a )?workout|exercising now|training together)\b/.test(value);
  if (trainingTransition) {
    return { location: "at a gym or training area", activity: "training", outfit: "character-appropriate athletic wear" };
  }
  if (/\b(?:put on|change into|wearing|wear) (?:my |your |some )?(?:pajamas|pyjamas)\b/.test(value)
    || /\b(?:going to bed|time for bed|bedtime now|sleepover tonight)\b/.test(value)) {
    return { location: "at home in a comfortable room", activity: "winding down", outfit: "character-appropriate pajamas" };
  }
  if (/\b(?:going|go|heading|dressed|dress|wearing|attending)(?:\s+\w+){0,5}\s+(?:formal event|gala|wedding|fancy dinner)\b/.test(value)) {
    return { location: "at a formal event", activity: "attending the event", outfit: "character-appropriate formalwear" };
  }
  if (/\b(?:outside|go out|going out|walk|walking)(?:\s+\w+){0,5}\s+(?:snow|snowing|winter weather)\b/.test(value)) {
    return { location: "outside in winter", outfit: "warm character-appropriate winter clothing" };
  }
  if (/\b(?:outside|go out|going out|walk|walking)(?:\s+\w+){0,5}\s+(?:rain|raining|rainy weather)\b/.test(value)) {
    return { location: "outside in the rain", outfit: "character-appropriate rainwear" };
  }
  return {};
}
import { effectiveVisual } from "./visual-overrides.mjs";
