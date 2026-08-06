export function normalizeDisplayName(value, canonicalName = "") {
  const normalized = String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const canonical = String(canonicalName || "").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.toLocaleLowerCase() === canonical.toLocaleLowerCase()) return undefined;
  return normalized;
}

export function applyDisplayName(character, value) {
  const displayName = normalizeDisplayName(value, character?.name);
  const next = { ...character };
  if (displayName) next.displayName = displayName;
  else delete next.displayName;
  return next;
}
