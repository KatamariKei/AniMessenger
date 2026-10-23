// Remove reusable references before paired references. Otherwise <ref ... />
// can be mistaken for an opening tag and swallow prose through the next </ref>.
export function stripWikiReferences(value) {
  return String(value || "")
    .replace(/<ref\b[^>]*\/\s*>/gi, "")
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi, "")
    .replace(/<\/?ref\b[^>]*>/gi, "");
}
