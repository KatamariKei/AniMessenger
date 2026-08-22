const hypothetical = /\b(?:would you|could you|might you|maybe (?:later|someday)|what if|imagine|hypothetically|have you ever|do you ever|thinking about|talking about)\b/i;
const userPerformsEvent = /\b(?:i|we)\s+(?:am |are |just |finally |already )?(?:put(?:ting)? on|try(?:ing)? on|change(?:d|ing)? into|dress(?:ed|ing)?|open(?:ed|ing)?|unveil(?:ed|ing)?|reveal(?:ed|ing)?|arrive(?:d|ing)?|reach(?:ed|ing)?|step(?:ped|ping)? into|enter(?:ed|ing)?|finished (?:my|our) (?:makeup|makeover))\b/i;
const wardrobeChange = /\b(?:put(?:ting)? on|try(?:ing)? on|change(?:d|ing)? into|chang(?:e|ed|ing) clothes|slip(?:ped|ping)? into|dress(?:ed|ing)? (?:up )?(?:as|in)|get(?:s|ting)? dressed|got dressed|finish(?:ed|es|ing)? (?:getting dressed|dressing)|costume change|outfit reveal)\b/i;
const appearanceReveal = /\b(?:your new haircut|cut your hair|dyed your hair|finished your (?:makeup|makeover)|you finished your (?:makeup|makeover)|your new look|transformation reveal)\b/i;
const objectReveal = /\b(?:unveil(?:ed|ing)?|big reveal|reveal(?:ed|ing)? (?:the|my|your|this|that)|open(?:ed|ing)? (?:the|my|your) (?:gift|present|box|case|door|curtain|package)|pull(?:ed|ing)? back the (?:cover|curtain|sheet))\b/i;
const visualLocation = "beach|festival|concert|party|ballroom|rooftop|garden|temple|castle|city|arcade|amusement park|stage|viewpoint|lookout|hot springs?|pool|museum|aquarium|carnival|mountains?|waterfall|observation deck";
const arrival = new RegExp("\\b(?:arrive(?:d|ing)? at|reach(?:ed|ing)?|step(?:ped|ping)? into|enter(?:ed|ing)?|made it to|just got to|(?:i(?:'m| am)|we(?:'re| are)|she(?:'s| is)|he(?:'s| is)|they(?:'re| are)) (?:now )?(?:at|in|on))\\s+(?:the |a |an )?(?:" + visualLocation + ")\\b", "i");
const completedVisualActivity = /\b(?:just |finally |all )?(?:finish(?:ed|ing)|done with|wrapped up)\s+(?:(?:my|her|his|their|the|a)\s+)?(?:workout|training|practice|performance|show|makeup|makeover|costume|hair)|\b(?:just |finally )?(?:got|stepped|came) out of (?:the |my |her |his |their )?shower\b|\b(?:just |finally )?shower(?:ed|ing)\b/i;
const visibleSelfReveal = /\b(?:here(?:'s| is) (?:the |my )?(?:new )?(?:outfit|dress|costume|look)|show(?:ing|s|ed)? (?:off )?(?:my|her|his|their) (?:new )?(?:outfit|dress|costume|look)|take a look at (?:the |my |her |his |their )?(?:new )?(?:outfit|dress|costume|look))\b/i;

export function visualEventOpportunity(text, scene = {}, options = {}) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  const actor = options.actor === "character" ? "character" : "user";
  if (!value || hypothetical.test(value) || (actor === "user" && userPerformsEvent.test(value)) || scene?.presence === "together") return null;
  if (wardrobeChange.test(value)) return "an immediate outfit change or wardrobe reveal";
  if (appearanceReveal.test(value)) return "a visible appearance change or makeover reveal";
  if (completedVisualActivity.test(value)) return "a just-completed visually distinctive activity or transition";
  if (visibleSelfReveal.test(value)) return "a current outfit or appearance reveal";
  if (objectReveal.test(value)) return "a meaningful physical reveal";
  if (arrival.test(value)) return "arrival at a visually distinctive location";
  return null;
}

export function keyVisualPhotoBrief(baseBrief, visualEvent, claimsPhoto = false, evidence = "") {
  const visibleEvidence = String(evidence || "").replace(/\[(?:action|thought)\s*:\s*/gi, "").replace(/\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 360);
  return [
    String(baseBrief || "").trim(),
    visualEvent ? "KEY VISUAL MOMENT: " + visualEvent + "; clearly depict the newly established state, change, arrival, or reveal rather than the previous scene" : "",
    visualEvent && visibleEvidence ? "LATEST VISUAL EVIDENCE: " + visibleEvidence : "",
    claimsPhoto ? "the character is actively sharing this current visual with the viewer" : "",
  ].filter(Boolean).join("; ");
}
