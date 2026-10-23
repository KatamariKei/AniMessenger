import test from "node:test";
import assert from "node:assert/strict";
import { attachDiscoveryEvidence, discoveryEvidenceCatalog, evidenceDraftSchema } from "../server/discovery-evidence.mjs";
import { revelationDraftSchema } from "../server/revelations.mjs";

test("evidence catalog copies bounded exact source excerpts and drafting selects IDs only", () => {
  const passages = [{ id: "wiki", title: "Character", text: "A meaningful source sentence. ".repeat(50) }];
  const entries = discoveryEvidenceCatalog(passages);
  assert.ok(entries.length > 1);
  for (const entry of entries) { assert.ok(passages[0].text.includes(entry.quote)); assert.ok(entry.quote.length <= 320); }
  const schema = evidenceDraftSchema(revelationDraftSchema, entries);
  assert.equal(schema.properties.revelations.items.properties.sources, undefined);
  const draft = attachDiscoveryEvidence({ revelations: [{ truth: "A supported fact", evidenceIds: [entries[0].id], sources: [{ quote: "invented" }] }] }, entries);
  assert.deepEqual(draft.revelations[0].sources, [{ sourceId: "wiki", quote: entries[0].quote }]);
  assert.deepEqual(attachDiscoveryEvidence({ revelations: [{ evidenceIds: [entries[0].id, "invented"] }] }, entries).revelations[0].sources, []);
});
