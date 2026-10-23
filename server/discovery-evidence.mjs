// Quotes are copied by code, not reconstructed by the drafting model.
export function discoveryEvidenceCatalog(passages) {
  const entries = [];
  for (const passage of passages) {
    const text = String(passage.text || "");
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 320, text.length);
      if (end < text.length) {
        const boundary = text.lastIndexOf(" ", end);
        if (boundary > start + 160) end = boundary;
      }
      if (text.length - end < 12) end = text.length;
      const quote = text.slice(start, end).trim();
      if (quote.length >= 12) entries.push({ id: `evidence-${entries.length + 1}`, sourceId: passage.id, quote, title: passage.title });
      start = end;
    }
  }
  return entries;
}

export function evidenceDraftSchema(base, entries) {
  const schema = structuredClone(base);
  const item = schema.properties.revelations.items;
  delete item.properties.sources;
  item.properties.evidenceIds = { type: "array", minItems: 1, maxItems: 3,
    items: { type: "string", enum: entries.map(entry => entry.id) } };
  item.required = item.required.map(key => key === "sources" ? "evidenceIds" : key);
  return schema;
}

export function attachDiscoveryEvidence(draft, entries) {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  return { revelations: (draft?.revelations || []).map(item => {
    const ids = Array.isArray(item.evidenceIds) ? [...new Set(item.evidenceIds)] : [];
    // Fail closed if any selected ID was invented; do not silently drop it.
    const sources = ids.length && ids.every(id => byId.has(id))
      ? ids.map(id => { const entry = byId.get(id); return { sourceId: entry.sourceId, quote: entry.quote }; }) : [];
    return { ...item, sources };
  }) };
}
