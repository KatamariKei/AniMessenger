import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");

test("earlier memory details use a compact secondary disclosure style", () => {
  const css = fs.readFileSync(path.join(root, "src", "local.css"), "utf8");
  assert.match(app, /<details className="memory-history"><summary>Earlier details<\/summary>/);
  assert.match(css, /\.memory-card \.memory-history > summary \{[^}]*font-size: 12px;[^}]*font-weight: 500;[^}]*cursor: pointer;/);
  assert.match(css, /\.memory-card \.memory-history > summary:focus-visible/);
  assert.match(css, /\.memory-card \.memory-history > small \{[^}]*text-transform: none;/);
});

test("the memory tab supports review by search, category, and sort order", () => {
  assert.match(app, /placeholder="Search memories…"/);
  assert.match(app, /aria-label="Memory filters and options"/);
  assert.match(app, /<span>Show<\/span><select aria-label="Memory type"/);
  assert.match(app, /<span>Order<\/span><select aria-label="Memory sort order"/);
  assert.match(app, /<option value="shared_event">Shared events<\/option>/);
  assert.match(app, /<option value="recent">Recently captured<\/option>/);
  assert.match(app, /<option value="event">Newest event<\/option>/);
  assert.match(app, /<option value="importance">Most important<\/option>/);
  assert.match(app, /By when the remembered event happened/);
  assert.match(app, /By when AniMessenger captured or edited it/);
  assert.match(app, /No memories match those filters/);
});

test("memories can be added, corrected, and traced to their original chat", () => {
  assert.match(app, /aria-label="Add memory"/);
  assert.match(app, /className="memory-editor"/);
  assert.match(app, /"Save changes"/);
  assert.match(app, /beginEditingMemory\(memory\)/);
  assert.match(app, /aria-label="Memory actions"/);
  assert.match(app, /"View source"/);
  assert.match(app, /Forget memory/);
  assert.match(app, /<strong>Original chat<\/strong>/);
  assert.match(app, /memoryPanelRef\.current\?\.scrollTo\(\{ top: 0, behavior: "smooth" \}\)/);
  assert.match(app, /memoryEditorTextRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
});

test("a memory rescan stays visible and announces progress and completion", () => {
  assert.doesNotMatch(app, /const backfillActiveMemories[\s\S]{0,180}setMemoryOptionsOpen\(false\)/);
  assert.match(app, /setMemoryScanStatus\("Preparing full-chat scan…"\)/);
  assert.match(app, /Scan complete — no new lasting memories found/);
  assert.match(app, /role="status" aria-live="polite"/);
  assert.match(app, /aria-busy=\{memoryUpdating\}/);
  assert.match(app, /api.memoryScanStatus\(id\)/);
  assert.match(app, /completed\} of \$\{job.total\} batches/);
  assert.match(app, /The scan runs in the background/);
  assert.match(app, /if \(!disposed\) mergeThread\(latest.thread\)/);
});

test("memory scanning is available before the first memory and outside hidden filters", () => {
  const panel = app.slice(app.indexOf('profileTab === "memories" ? ('), app.indexOf('profileTab === "memories" ? (') + 11000);
  const scan = panel.indexOf('className="memory-maintenance"');
  const populatedOnly = panel.indexOf('{active.memories?.length ? (');
  assert.ok(scan >= 0 && populatedOnly > scan);
  assert.equal((panel.match(/className="memory-maintenance"/g) || []).length, 1);
  assert.match(panel, /Review the complete saved conversation/);
});
