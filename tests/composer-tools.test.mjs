import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("the composer replaces canned suggestions with compact accessible writing tools", async () => {
  const app = await fs.readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const css = await fs.readFile(new URL("../src/local.css", import.meta.url), "utf8");
  assert.doesNotMatch(app, /What are you doing\?/);
  assert.doesNotMatch(app, /className="quick-prompts"/);
  assert.match(app, /<form className="composer"[\s\S]*?className="composer-tools"/);
  assert.match(app, /className="composer-action" onClick=\{insertAction\}/);
  assert.match(app, /aria-label="Insert an action"/);
  assert.match(app, />\[action:\]<\/button>/);
  assert.match(css, /\.composer-tools button \{[^\n]*min-height: 44px/);
  assert.match(css, /\.composer-tools button:focus-visible/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) 48px/);
  assert.match(css, /\.composer-tools \.capture-moment-button \{ width: 48px; height: 48px;/);
  assert.doesNotMatch(css, /\.composer-tools \{[^\n]*margin: -/);
});
