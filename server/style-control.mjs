const styleFamilies = [
  {
    name: "gaming stats, buffs, levels, or status effects",
    pattern: /\b(?:hp|mana|stats?|buffs?|debuffs?|levels?|status (?:effect|ailment)|cooldowns?|regen(?:eration)?|npc|party members?|character stats?)\b/i,
  },
  {
    name: "quests, combat, bosses, rounds, or attacks",
    pattern: /\b(?:quests?|side quests?|boss(?:es)?|battle|combat|fight|rounds?|attacks?|commands?|victory|defeat|final boss)\b/i,
  },
  {
    name: "computer systems, errors, or hardware metaphors",
    pattern: /\b(?:cpu|buffer|packets?|firewall|protocol|system|error(?: code)?|patch|recalibrat\w*|glitch\w*|process(?:es)?|hardware|low-spec|overdrive)\b/i,
  },
  {
    name: "embarrassment, racing-heart, or panic deflection",
    pattern: /\b(?:embarrass\w*|my (?:face|heart) (?:is|was)|face (?:is|was) burning|heart (?:is|was) racing|panic(?:king)?|social anxiety levels?)\b/i,
  },
];

const openingPatterns = [
  { name: "H-Hey or Hey", pattern: /^\s*(?:h-+)?hey\b/i },
  { name: "Wait", pattern: /^\s*wait\b/i },
  { name: "But fine", pattern: /^\s*but\s+fine\b/i },
  { name: "Okay", pattern: /^\s*okay\b/i },
  { name: "You can't just", pattern: /^\s*you\s+can(?:not|'t)\s+just\b/i },
  { name: "Don't", pattern: /^\s*don(?:ot|'t)\b/i },
];

const rhetoricFamilies = [
  {
    name: "teasing or dismissive setup",
    pattern: /(?:^|[.!?]\s+)(?:you\b[^.!?]{0,55}\bfor someone\b|spoken like\b|flattery\b[^.!?]{0,35}\bcheap\b)/i,
  },
  {
    name: "guarded or reluctant concession",
    pattern: /\b(?:but|though|still|however)\b[^.!?]{0,55}\b(?:fine|suppose|guess|admit|honestly|coming from you|not (?:entirely|all that) (?:bad|terrible))\b/i,
  },
  {
    name: "conditional warning or challenge ending",
    pattern: /\b(?:just\s+don['â€™]t|make sure (?:you|that)|be careful|don['â€™]t (?:act|expect|get|come|think))\b/i,
  },
  {
    name: "danger, fire, light, or shadow metaphor",
    pattern: /\b(?:playing with fire|burn(?:ed|ing|s)?|thin ice|dangerous territory|light (?:finally )?goes out|shadows?|bite|teeth|handle what you find)\b/i,
  },
];

function recentCharacterText(messages, limit = 10) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.from === "character" && typeof message.text === "string" && message.text.trim())
    .slice(-limit)
    .map((message) => message.text.trim());
}

function saturatedStyle(messages) {
  const recent = recentCharacterText(messages);
  const families = styleFamilies
    .map((family) => ({ ...family, count: recent.filter((text) => family.pattern.test(text)).length }))
    .filter((family) => family.count >= 3);
  const openings = openingPatterns
    .map((opening) => ({ ...opening, count: recent.filter((text) => opening.pattern.test(text)).length }))
    .filter((opening) => opening.count >= 2);
  const rhetoric = rhetoricFamilies
    .map((family) => ({ ...family, count: recent.filter((text) => family.pattern.test(text)).length }))
    .filter((family) => family.count >= 2);
  return { recent, families, openings, rhetoric };
}

export function recentStyleCooldown(messages) {
  const { recent, families, openings, rhetoric } = saturatedStyle(messages);
  if (recent.length < 3 || (!families.length && !openings.length && !rhetoric.length)) return "";
  const details = [
    ...(families.length ? ["overused motif families: " + families.map((item) => item.name).join("; ")] : []),
    ...(openings.length ? ["overused openings: " + openings.map((item) => item.name).join(", ")] : []),
    ...(rhetoric.length ? ["overused rhetorical moves: " + rhetoric.map((item) => item.name).join("; ")] : []),
  ].join(". ");
  return "RECENT STYLE COOLDOWN: " + details + ". Avoid all of these in the next reply, even if they are normally in character. Change the rhetorical shape, not merely the vocabulary. Do not replace a tired metaphor with a synonym. Use the character's plain baseline voice and choose a genuinely different move: a direct answer, sincere observation, practical detail, specific question, dry understatement, or brief unqualified acceptance.";
}

export function repeatsRecentStyle(reply, messages) {
  const value = String(reply || "").trim();
  if (!value) return false;
  const { recent, families, openings, rhetoric } = saturatedStyle(messages);
  if (recent.length < 3) return false;
  return families.some((family) => family.pattern.test(value))
    || openings.some((opening) => opening.pattern.test(value))
    || rhetoric.some((family) => family.pattern.test(value));
}

export function isCannedConditionalIntimacy(reply) {
  const value = String(reply || "");
  return /\b(?:(?:if\s+)?you keep (?:talking|saying|being|doing|this|that|it up)|keep (?:(?:talking|saying|doing) like that|this up|it up))\b[^.!?]{0,100}\b(?:i|we)(?:['’]ll|\s+(?:might|may|could|will|am going to))\b/i.test(value)
    || /\bcareful\b[^.!?]{0,100}\b(?:i|we) might (?:actually |just )?(?:start |have to )?\b/i.test(value)
    || /\bcareful\b[\s\S]{0,160}\bi might (?:actually |just )?(?:start )?(?:thinking|believing|liking|trusting|enjoying|wondering)\b/i.test(value)
    || /\bcareful\b[^.!?]{0,120}\byou(?:['’]ll|['’]re going to|\s+(?:will|might|may|could|are going to))\b[^.!?]{0,45}\bmake me (?:start )?(?:think|believe|like|trust|enjoy|wonder)/i.test(value)
    || /\b(?:i|we)(?:['’]ll|\s+(?:might|may|could|will|am going to))\b[^.!?]{0,75}\b(?:start )?(?:thinking|believing|liking|trusting|enjoying|expecting)\b[^.!?]{0,75}\bif you keep\b/i.test(value)
    || /\bplaying with fire\b/i.test(value)
    || /\bdon['’]t act surprised\b[^.!?]{0,80}\b(?:burn|burned|burnt)\b/i.test(value);
}
