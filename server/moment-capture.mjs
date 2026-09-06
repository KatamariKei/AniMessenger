function clean(value, limit = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function capturedMomentBrief(thread) {
  // Scene, wardrobe, expression, and lighting are assembled once by the
  // central image prompt builder. This brief only establishes composition.
  return "A candid third-person image.";
}
