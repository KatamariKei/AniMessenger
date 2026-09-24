import { normalizeWardrobePrompt } from "./wardrobe.mjs";

function cleanList(value, limit = 24) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 180)))]
    .slice(0, limit);
}

function cleanText(value, limit = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function normalizeVisualOverrides(value = {}, baseline = {}) {
  const defaultWardrobe = normalizeWardrobePrompt(cleanText(value.defaultWardrobe));
  const researchedDefaultWardrobe = normalizeWardrobePrompt(cleanText(baseline.defaultWardrobe));
  const signature = cleanList(value.signature);
  const signatureKeys = new Set(signature.map((item) => item.toLowerCase()));
  const hiddenSignature = cleanList(value.hiddenSignature)
    .filter((item) => signatureKeys.has(item.toLowerCase()));
  return {
    identity: cleanList(value.identity),
    signature,
    hiddenSignature,
    exceptions: cleanList(value.exceptions),
    ...(defaultWardrobe && defaultWardrobe !== researchedDefaultWardrobe ? { defaultWardrobe } : {}),
    updatedAt: new Date().toISOString(),
  };
}

export function applyVisualOverrides(profile, value) {
  if (!profile?.visual) throw new Error("That character profile does not have visual identity data.");
  const visual = { ...profile.visual };
  if (value === null) delete visual.userOverrides;
  else visual.userOverrides = normalizeVisualOverrides(value, visual);
  return { ...profile, visual };
}

export function preserveVisualOverrides(rebuilt, existing) {
  const userOverrides = existing?.visual?.userOverrides;
  const lockedSocialIdentity = existing?.socialIdentity?.locked ? existing.socialIdentity : null;
  return {
    ...rebuilt,
    ...(lockedSocialIdentity ? { socialIdentity: lockedSocialIdentity } : {}),
    ...(userOverrides && rebuilt?.visual
      ? { visual: { ...rebuilt.visual, userOverrides } }
      : {}),
  };
}

export function effectiveVisual(profile) {
  const baseline = profile?.visual || {};
  const overrides = baseline.userOverrides;
  const signature = overrides ? cleanList(overrides.signature) : cleanList(baseline.signature);
  const hiddenSignature = new Set(cleanList(overrides?.hiddenSignature).map((item) => item.toLowerCase()));
  return {
    identity: overrides ? cleanList(overrides.identity) : cleanList(baseline.identity),
    signature: signature.filter((item) => !hiddenSignature.has(item.toLowerCase())),
    exceptions: overrides ? cleanList(overrides.exceptions) : [],
    defaultWardrobe: normalizeWardrobePrompt(cleanText(overrides?.defaultWardrobe) || cleanText(baseline.defaultWardrobe)) || "casual outfit",
  };
}
