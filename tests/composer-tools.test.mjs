import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("the composer replaces canned suggestions with compact accessible writing tools", async () => {
  const app = await fs.readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const css = await fs.readFile(new URL("../src/local.css", import.meta.url), "utf8");
  assert.doesNotMatch(app, /What are you doing\?/);
  assert.doesNotMatch(app, /className="quick-prompts"/);
  assert.match(app, /<form className="composer"[\s\S]*?className="composer-tools"/);
  assert.match(app, /className="composer-tool-menu"[\s\S]*?insertAction\(\)[\s\S]*?Insert action/);
  assert.match(app, /className="composer-modes" role="group" aria-label="Conversation view"/);
  assert.match(app, /aria-pressed=\{selected\}/);
  assert.match(css, /\.composer-mode, \.composer-tools \.capture-moment-button \{[^}]*min-height: 44px/);
  assert.match(css, /\.composer-mode:focus-visible/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) var\(--composer-control\)/);
  assert.doesNotMatch(css, /\.composer-tools \{[^\n]*margin: -/);
});
