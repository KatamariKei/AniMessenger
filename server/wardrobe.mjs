export function normalizeWardrobePrompt(outfit = "") {
  const cleaned = String(outfit || "").replace(/\s+/g, " ").trim();
  if (/^(?:none|nothing|no clothes|no clothing|nude|naked)$/i.test(cleaned)) return "completely nude";
  return cleaned;
}

export function photoOutfitUpdate(photoBrief = "", photoOutfit = "") {
  if (!String(photoBrief || "").trim()) return "";
  return normalizeWardrobePrompt(photoOutfit);
}

const wardrobePlaceholder = /^(?:(?:the|her|his|their)\s+)?(?:standard|usual|normal|default|appropriate|character-appropriate)\s+(?:attire|outfit|clothes|clothing)$/i;
const wardrobeTransition = /\b(?:put(?:s|ting)? on|try(?:ing|ies)? on|change(?:s|d|ing)? into|chang(?:e|ed|ing) clothes|slip(?:s|ped|ping)? into|dress(?:es|ed|ing)? (?:up )?(?:as|in)|get(?:s|ting)? dressed|got dressed|finish(?:ed|es|ing)? (?:getting dressed|dressing)|costume change|outfit change|outfit reveal|(?:go(?:es|ing)? (?:and )?)?get(?:s|ting)? (?:a|an|the|her|his|their|my|your|some)?\s*(?:[\w-]+\s+){0,4}(?:jumpsuit|outfit|clothes|gear) on|(?:return(?:s|ed|ing)?|come(?:s|ing)? back|back) in\s+(?:[\w-]+\s+){0,4}(?:attire|outfit|clothes|clothing|gear|jumpsuit|dress|shirt|top|pants|shorts|skirt|jacket|coat|robe|uniform|swimsuit|bikini|leggings|sweater)|wear(?:s|ing)?\s+(?:(?:a|an|the|her|his|their|my|your|some)s+)?(?:[\w-]+\s+){0,4}(?:attire|outfit|clothes|clothing|gear|jumpsuit|dress|shirt|top|pants|shorts|skirt|jacket|coat|robe|uniform|swimsuit|bikini|leggings|sweater)|take(?:s|n|ing)? off|remove(?:s|d|ing)? (?:her|his|their|the)?\s*(?:clothes|clothing|outfit|dress|shirt|top|pants|shorts|skirt|jacket|coat|robe))\b/i;
const garmentWord = /\b(?:t[- ]?shirt|tee|shirt|tank(?: top)?|top|blouse|sweater|hoodie|cardigan|dress|gown|robe|towel|uniform|suit|jumpsuit|bodysuit|swimsuit|bikini|lingerie|underwear|bra|panties|pajamas?|shorts|pants|trousers|jeans|leggings|skirt|jacket|coat|apron|armor|attire|outfit|clothes|clothing|gear)\b/i;
const futureWardrobe = /\b(?:will|would|might|maybe|later|tomorrow|plan(?:ning)? to|want(?:ing)? to|going to|about to|should|could|(?:i|you|she|he|they)['’]ll)\b/i;

function cleanWardrobeCandidate(value = "") {
  const candidate = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^(?:(?:a|an|the|her|his|their|my|your|some)\s+)+/i, "")
    .replace(/\s+(?:and|while|before)\s+(?:she|he|they|i|you)\b.*$/i, "")
    .replace(/[\].,!?;:]+$/g, "")
    .trim()
    .slice(0, 240);
  if (!candidate || (!garmentWord.test(candidate) && !/\b(?:completely nude|naked|nude)\b/i.test(candidate))) return "";
  return normalizeWardrobePrompt(candidate);
}

export function inferWardrobeEvent(text = "", source = "user") {
  const normalized = String(text || "")
    .replace(/\[(?:action|thought)\s*:\s*/gi, "")
    .replace(/\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const towelAction = normalized.match(/\b(?:grab(?:s|bed|bing)?|take(?:s|n|ing)?)\s+(?:a|the)?\s*([^,.!?;]{0,60}\btowel\b)[^.!?;]{0,100}\bwrap(?:s|ped|ping)?\s+(?:it\s+)?around\s+(?:herself|himself|themself|their body|her body|his body)\b/i)
    || normalized.match(/\bwrap(?:s|ped|ping)?\s+(?:herself|himself|themself|their body|her body|his body)\s+in\s+(?:a|the)?\s*([^,.!?;]{0,80}\b(?:towel|robe)\b)/i);
  if (towelAction?.[1]) {
    const garment = cleanWardrobeCandidate(towelAction[1]);
    if (garment) {
      const outfit = /\btowel\b/i.test(garment)
        ? `${/^towel$/i.test(garment) ? "bath towel" : garment} wrapped around her body`
        : garment;
      return { type: "wardrobe_change", phase: "changed", outfit, source, evidence: normalized };
    }
  }

  const patterns = [
    /\b(?:i|you|she|he|they)\s+(?:(?:walk|step|come|came|return|emerge)(?:s|ed|ing)?\s+(?:out|back)\s+)?(?:am|are|is|was|were)?\s*wearing\s+([^,.!?;]+)/i,
    /\b(?:i|you|she|he|they)\s+(?:put(?:s|ting)? on|changed? into|changes? into|changing into|slip(?:s|ped|ping)? into|dress(?:es|ed|ing)? in|return(?:s|ed|ing)? in|emerge(?:s|d|ing)? in|walk(?:s|ed|ing)? out in|come(?:s|d|ing)? out in)\s+([^,.!?;]+)/i,
    /\b(?:i|you|she|he|they)(?:['’]m|['’]re|['’]s| am| are| is)\s+(?:now\s+)?(?:dressed in|wearing|in)\s+([^,.!?;]+)/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    const lead = normalized.slice(Math.max(0, (match.index || 0) - 40), match.index || 0);
    if (futureWardrobe.test(lead)) continue;
    const outfit = cleanWardrobeCandidate(match[1]);
    if (outfit) return { type: "wardrobe_change", phase: "changed", outfit, source, evidence: normalized };
  }

  if (/\b(?:i|you|she|he|they)(?:['’]m|['’]re|['’]s| am| are| is| was| were)\s+(?:now\s+)?(?:completely\s+)?(?:naked|nude)\b/i.test(normalized)) {
    return { type: "wardrobe_change", phase: "changed", outfit: "completely nude", source, evidence: normalized };
  }
  return null;
}

export function wardrobeDescriptionRequested(text = "") {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  const wardrobeSubject = "(?:outfit|clothes?|clothing|attire|gear|ensemble|look|what (?:you(?:'re| are)|they(?:'re| are)) wearing)";
  return new RegExp(
    "\\b(?:what (?:are|r) (?:you|they) wearing|what (?:do|does) (?:your|their) (?:outfit|clothes?|attire|gear) look like|describe[^.!?]{0,48}" + wardrobeSubject + "|(?:give|tell|show) me[^.!?]{0,48}" + wardrobeSubject + "|details? (?:about|of|on)[^.!?]{0,32}" + wardrobeSubject + ")\\b",
    "i",
  ).test(value);
}

export function isWardrobePlaceholder(outfit = "") {
  return wardrobePlaceholder.test(normalizeWardrobePrompt(outfit));
}

export function wardrobeChangeIsEstablished(...values) {
  return values.some((value) => Boolean(inferWardrobeEvent(value)));
}

export function replaceWardrobePlaceholders(text = "", outfit = "") {
  const replacement = normalizeWardrobePrompt(outfit);
  if (!replacement || isWardrobePlaceholder(replacement)) return String(text || "");
  return String(text || "").replace(
    /\b(?:wearing|dressed in|in)\s+(?:(?:the|her|his|their)\s+)?(?:standard|usual|normal|default|appropriate|character-appropriate)\s+(?:attire|outfit|clothes|clothing)\b/gi,
    "wearing " + replacement,
  );
}

const colorWords = [
  "black", "white", "red", "orange", "yellow", "green", "teal", "cyan", "blue", "navy",
  "purple", "violet", "pink", "magenta", "brown", "tan", "beige", "cream", "gray", "grey",
  "silver", "gold", "burgundy", "maroon", "charcoal",
];
const fallbackPalettes = [
  ["teal", "charcoal-gray"],
  ["burgundy", "cream"],
  ["navy", "white"],
  ["black", "red"],
  ["violet", "silver"],
  ["orange", "black"],
];

const outfitDesigns = {
  bikini: {
    sporty: [
      ({ primary, secondary }) => `${primary} athletic bikini with ${secondary} contrast piping and a supportive cross-back top`,
      ({ primary, secondary }) => `${primary} high-waisted sport bikini with ${secondary} side panels and secure shoulder straps`,
    ],
    playful: [
      ({ primary, secondary }) => `${primary} ruffled bikini with ${secondary} polka dots and small bow details`,
      ({ primary, secondary }) => `${primary} halter bikini with a ${secondary} floral print and scalloped trim`,
    ],
    elegant: [
      ({ primary, secondary }) => `${primary} wrap-front bikini with ${secondary} metallic accents and clean high-waisted bottoms`,
      ({ primary, secondary }) => `${primary} ruched bikini with ${secondary} trim and refined ring details`,
    ],
    edgy: [
      ({ primary, secondary }) => `${primary} strappy bikini with ${secondary} buckles and asymmetric cutout details`,
      ({ primary, secondary }) => `${primary} high-cut bikini with ${secondary} harness-inspired straps and metal ring accents`,
    ],
    neutral: [
      ({ primary, secondary }) => `${primary} halter bikini with ${secondary} trim and gathered side ties`,
      ({ primary, secondary }) => `${primary} fitted bikini with ${secondary} contrast straps and subtle textured fabric`,
    ],
  },
  athletic: {
    sporty: [
      ({ primary, secondary }) => `${primary} fitted racerback training top, tight ${secondary} athletic pants with a white side stripe, practical trainers`,
      ({ primary, secondary }) => `${primary} cropped performance tank, ${secondary} running shorts with contrast piping, lightweight trainers`,
    ],
    playful: [
      ({ primary, secondary }) => `${primary} fitted athletic crop top, ${secondary} high-waisted gym shorts with color-blocked panels, bright trainers`,
    ],
    elegant: [
      ({ primary, secondary }) => `${primary} long-sleeve fitted training top, sleek ${secondary} leggings with understated piping, minimalist trainers`,
    ],
    edgy: [
      ({ primary, secondary }) => `${primary} mesh-paneled athletic top, tight ${secondary} training pants with bold side stripes, high-top trainers`,
    ],
    neutral: [
      ({ primary, secondary }) => `${primary} fitted athletic tank top, ${secondary} training shorts with contrast piping, practical athletic shoes`,
    ],
  },
  casual: {
    sporty: [
      ({ primary, secondary, lower }) => `${primary} cropped ribbed tank top, ${secondary} ${lower}, lightweight sneakers and a practical zip jacket tied at the waist`,
    ],
    playful: [
      ({ primary, secondary, lower }) => `${primary} fitted ringer tee with ${secondary} trim, patterned ${lower}, playful hair accessory and casual sneakers`,
    ],
    elegant: [
      ({ primary, secondary, lower }) => `${primary} soft draped blouse, tailored ${secondary} ${lower}, delicate jewelry and polished ankle boots`,
    ],
    edgy: [
      ({ primary, secondary, lower }) => `${primary} fitted graphic crop top, distressed ${secondary} ${lower}, layered belt and heavy ankle boots`,
    ],
    neutral: [
      ({ primary, secondary, lower }) => `${primary} fitted casual top with ${secondary} contrast stitching, ${lower}, coordinated casual shoes`,
    ],
  },
  school: {
    sporty: [
      ({ primary, secondary }) => `${primary} fitted school shirt, ${secondary} pleated skirt with athletic stripe trim, loose neck ribbon and school loafers`,
    ],
    playful: [
      ({ primary, secondary }) => `${primary} fitted school blouse, green and black tartan-patterned pleated skirt, ${secondary} ribbon and knee socks`,
    ],
    elegant: [
      ({ primary, secondary }) => `${primary} tailored school blazer, crisp blouse, ${secondary} pleated skirt, narrow ribbon tie and polished loafers`,
    ],
    edgy: [
      ({ primary, secondary }) => `${primary} cropped school cardigan, ${secondary} tartan pleated skirt, loosened necktie and dark platform loafers`,
    ],
    neutral: [
      ({ primary, secondary }) => `${primary} fitted school blouse, ${secondary} tartan pleated skirt, coordinated neck ribbon and loafers`,
    ],
  },
  formal: {
    sporty: [
      ({ primary, secondary }) => `${primary} sleek sleeveless cocktail dress with ${secondary} side panels, asymmetric hem and simple ankle-strap heels`,
    ],
    playful: [
      ({ primary, secondary }) => `${primary} flared cocktail dress with ${secondary} embroidered details, a fitted waist and playful statement earrings`,
    ],
    elegant: [
      ({ primary, secondary }) => `low-cut ${primary} sequin cocktail dress with a thigh slit, ${secondary} jewelry and elegant heels`,
    ],
    edgy: [
      ({ primary, secondary }) => `${primary} asymmetric cocktail dress with a sharp thigh slit, ${secondary} metal accents and strappy heels`,
    ],
    neutral: [
      ({ primary, secondary }) => `${primary} fitted cocktail dress with ${secondary} accents, a defined waist and character-appropriate jewelry`,
    ],
  },
};

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value || "animessenger")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function wardrobePalette(visual = {}, seed = "") {
  const source = [visual.defaultWardrobe, ...(Array.isArray(visual.wardrobePreferences) ? visual.wardrobePreferences : [])]
    .join(" ")
    .toLowerCase();
  const colorPattern = new RegExp("\\b(?:" + colorWords.join("|") + ")\\b", "gi");
  const colors = [...new Set((source.match(colorPattern) || []).map((color) => color.toLowerCase()))];
  if (colors.length >= 2) return colors.slice(0, 2);
  const fallback = fallbackPalettes[stableHash(seed) % fallbackPalettes.length];
  return [colors[0] || fallback[0], colors[1] || fallback.find((color) => color !== colors[0]) || "black"];
}

function casualLowerGarment(visual = {}) {
  const source = String(visual.defaultWardrobe || "").toLowerCase();
  if (/\b(?:jeans|denim pants)\b/.test(source)) return "jeans";
  if (/\b(?:pants|trousers)\b/.test(source)) return "casual pants";
  if (/\bskirt\b/.test(source)) return "pleated skirt";
  if (/\bshorts\b/.test(source)) return "shorts";
  return "casual shorts";
}

function wardrobeStyle(visual = {}, seed = "") {
  const socialIdentity = visual.socialIdentity && typeof visual.socialIdentity === "object"
    ? Object.values(visual.socialIdentity).join(" ")
    : visual.socialIdentity;
  const source = [
    visual.defaultWardrobe,
    ...(Array.isArray(visual.wardrobePreferences) ? visual.wardrobePreferences : []),
    ...(Array.isArray(visual.personaTraits) ? visual.personaTraits : []),
    visual.personaSummary,
    socialIdentity,
  ].join(" ").toLowerCase();
  const styles = [
    ["sporty", /\b(?:athletic|sporty|active|practical|tomboy|training|energetic)\b/],
    ["playful", /\b(?:cute|playful|cheerful|bubbly|bright|girlish|fun)\b/],
    ["elegant", /\b(?:elegant|refined|sophisticated|graceful|glamorous|luxurious)\b/],
    ["edgy", /\b(?:edgy|punk|rebellious|bold|provocative|rough|intense)\b/],
  ];
  const matched = styles.filter(([, pattern]) => pattern.test(source)).map(([style]) => style);
  return matched[stableHash(`${seed}:style`) % Math.max(matched.length, 1)] || "neutral";
}

function masculinePresentation(visual = {}) {
  const identity = visual.socialIdentity && typeof visual.socialIdentity === "object"
    ? Object.values(visual.socialIdentity).join(" ")
    : String(visual.socialIdentity || "");
  return /\b(?:male|man|he\s*\/\s*him|boy)\b/i.test(identity)
    && !/\b(?:female|woman|she\s*\/\s*her|girl)\b/i.test(identity);
}

function designedOutfit(category, visual, seed) {
  const [primary, secondary] = wardrobePalette(visual, seed);
  if (masculinePresentation(visual) && category === "school") {
    return `${primary} tailored school blazer, crisp shirt, ${secondary} tartan trousers, narrow necktie and polished loafers`;
  }
  if (masculinePresentation(visual) && category === "formal") {
    return `${primary} tailored evening suit with a fitted waist, ${secondary} satin lapels, a crisp shirt and character-appropriate accessories`;
  }
  const style = wardrobeStyle(visual, seed);
  const designs = outfitDesigns[category]?.[style] || outfitDesigns[category]?.neutral || [];
  const design = designs[stableHash(`${seed}:${category}`) % designs.length];
  return design?.({ primary, secondary, lower: casualLowerGarment(visual) });
}

export function stabilizeWardrobePrompt(outfit = "", visual = {}, seed = "") {
  const normalized = normalizeWardrobePrompt(outfit);
  const cleaned = isWardrobePlaceholder(normalized)
    ? normalizeWardrobePrompt(visual.defaultWardrobe)
    : normalized;
  if (!cleaned || cleaned === "completely nude") return cleaned;
  const generic = cleaned.toLowerCase().replace(/^character-appropriate\s+/, "").trim();
  const [primary, secondary] = wardrobePalette(visual, seed);

  if (/^(?:bikini|two-piece swimsuit|two piece swimsuit)$/.test(generic)) {
    return designedOutfit("bikini", visual, seed);
  }
  if (/^(?:swimsuit|swimwear|bathing suit)$/.test(generic)) {
    return `${primary} fitted one-piece swimsuit with ${secondary} trim`;
  }
  if (/^(?:athletic wear|athletic gear|activewear|sportswear|workout clothes|gym clothes|training clothes)$/.test(generic)) {
    return designedOutfit("athletic", visual, seed);
  }
  if (/^(?:casual clothes|casual clothing|casual outfit|casual wear|everyday clothes)$/.test(generic)) {
    return designedOutfit("casual", visual, seed);
  }
  if (/^(?:pajamas|pyjamas|sleepwear|nightwear)$/.test(generic)) {
    return `${primary} soft sleep shirt, ${secondary} lounge shorts`;
  }
  if (/^(?:school uniform|school clothes)$/.test(generic)) {
    return designedOutfit("school", visual, seed);
  }
  if (/^(?:formalwear|formal clothes|formal outfit|evening wear)$/.test(generic)) {
    return designedOutfit("formal", visual, seed);
  }
  if (/^(?:rainwear|rain clothes)$/.test(generic)) {
    return `${primary} fitted raincoat with ${secondary} trim, dark weatherproof boots`;
  }
  if (/^(?:winter clothes|winter clothing|warm winter clothing)$/.test(generic)) {
    return `${primary} fitted winter coat, ${secondary} scarf, dark boots`;
  }
  return cleaned;
}

const footwearPattern = /\b(?:shoes?|boots?|heels?|loafers?|trainers?|sneakers?|sandals?|slippers?)\b/i;
const lowerGarmentPattern = /\b(?:shorts|pants?|trousers?|jeans|leggings?|skirts?|stockings?|thigh-highs?|knee socks?)\b/i;
const upperOrWholeGarmentPattern = /\b(?:top|shirt|tee|tank|blouse|cardigan|jacket|coat|blazer|dress|gown|robe|swimsuit|bikini|bodysuit|suit)\b/i;

export function imageFraming(brief = "") {
  const value = String(brief || "").toLowerCase();
  if (/\b(?:full[- ]body|head[- ]to[- ]toe|whole body|feet visible|footwear focus|shoe focus)\b/.test(value)) return "full";
  if (/\b(?:close[- ]up|face focus|headshot|shoulders? and upper chest|chest[- ]up|bust portrait)\b/.test(value)) return "close";
  if (/\b(?:three[- ]quarter|three quarters|knee[- ]up|knees? visible)\b/.test(value)) return "three-quarter";
  if (/\b(?:medium shot|waist[- ]up|upper[- ]body|torso shot|half[- ]body)\b/.test(value)) return "medium";
  return "unspecified";
}

function stripFootwear(segment) {
  if (!footwearPattern.test(segment)) return segment;
  if (!upperOrWholeGarmentPattern.test(segment) && !lowerGarmentPattern.test(segment)) return "";
  return segment
    .replace(/\s+(?:and|with)\s+(?:simple|elegant|polished|practical|casual|coordinated|dark|bright|minimalist|lightweight|heavy|strappy|platform|ankle-strap|high-top)?\s*(?:shoes?|boots?|heels?|loafers?|trainers?|sneakers?|sandals?|slippers?)\b.*$/i, "")
    .replace(/\s+(?:shoes?|boots?|heels?|loafers?|trainers?|sneakers?|sandals?|slippers?)\b.*$/i, "")
    .trim();
}

function closeFrameSegment(segment) {
  if (lowerGarmentPattern.test(segment) && !upperOrWholeGarmentPattern.test(segment)) return "";
  return segment
    .replace(/\s+(?:and|with)\s+(?:(?:a|an)\s+)?(?:sharp\s+|high\s+|dramatic\s+)?(?:thigh|side|high)[- ]slit\b.*$/i, "")
    .replace(/\s+(?:and|with)\s+(?:distressed\s+|tailored\s+|high-waisted\s+|tight\s+|fitted\s+|patterned\s+|tartan\s+|denim\s+|dark\s+|bright\s+|\w+\s+){0,3}(?:shorts|pants?|trousers?|jeans|leggings?|skirts?|stockings?)\b.*$/i, "")
    .trim();
}

export function wardrobeForFraming(outfit = "", brief = "") {
  const cleaned = normalizeWardrobePrompt(outfit);
  if (!cleaned || cleaned === "completely nude") return cleaned;
  const framing = imageFraming(brief);
  if (framing === "full") return cleaned;
  let parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean).map(stripFootwear).filter(Boolean);
  if (framing === "close") parts = parts.map(closeFrameSegment).filter(Boolean);
  return parts.join(", ") || cleaned;
}
