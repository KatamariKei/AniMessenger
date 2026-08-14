export function normalizeWardrobePrompt(outfit = "") {
  const cleaned = String(outfit || "").replace(/\s+/g, " ").trim();
  if (/^(?:none|nothing|no clothes|no clothing|nude|naked)$/i.test(cleaned)) return "completely nude";
  return cleaned;
}
