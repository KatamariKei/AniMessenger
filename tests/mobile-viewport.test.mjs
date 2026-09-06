import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "app", "globals.css"), "utf8");

test("the mobile app cannot inherit an iOS browser's restored outer page offset", () => {
  assert.match(css, /\.site-frame\s*\{\s*position:\s*fixed;\s*inset:\s*0;/);
  assert.match(app, /window\.addEventListener\("pageshow", handlePageShow\)/);
  assert.match(app, /document\.addEventListener\("visibilitychange", handleVisibility\)/);
  assert.match(app, /window\.scrollTo\(\{ left: 0, top: 0, behavior: "auto" \}\)/);
});
