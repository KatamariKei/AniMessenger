import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const server = fs.readFileSync(path.join(root, "server", "index.mjs"), "utf8");

test("a character can claim prior recall only from the pre-turn memory snapshot", () => {
  assert.match(server, /memorySnapshot: priorThread\.memories/);
  assert.match(server, /memorySnapshot: speakerId === working\.character\.id \? priorThread\.memories : guestThread\.memories/);
});
