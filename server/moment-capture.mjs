function clean(value, limit = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function capturedMomentBrief(thread) {
  const name = clean(thread?.character?.displayName || thread?.character?.name, 100) || "the character";
  const scene = thread?.scene || {};
  const details = [
    clean(scene.activity),
    clean(scene.location),
    clean(scene.outfit) ? "wearing " + clean(scene.outfit) : "",
    clean(scene.expression),
    clean(scene.lighting),
  ].filter(Boolean);
  return [
    "current-moment candid scene",
    name + " clearly visible in frame",
    ...details,
    "natural observer viewpoint",
    "solo focus",
  ].join(", ");
}
