import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const localCss = fs.readFileSync(path.join(root, "src", "local.css"), "utf8");
const server = fs.readFileSync(path.join(root, "server", "index.mjs"), "utf8");
const ollama = fs.readFileSync(path.join(root, "server", "ollama.mjs"), "utf8");

test("source thumbnails fill portrait frames and crop from the top", () => {
  assert.match(localCss, /\.portrait--remote\s*\{[^}]*position:\s*relative/);
  assert.match(localCss, /\.portrait--remote\s*>\s*img\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0/);
  assert.match(localCss, /\.portrait--source-thumbnail\s*>\s*img\s*\{[^}]*object-fit:\s*cover;[^}]*object-position:\s*center top/);
});

test("first-run setup treats Ollama as required and ComfyUI as optional", () => {
  assert.match(app, /Ollama is required to create and chat with characters/);
  assert.match(app, /Required to meet characters/);
  assert.match(app, /disabled=\{step === 1 && !ready\}/);
  assert.match(app, /ComfyUI adds optional profile pictures/);
  assert.doesNotMatch(app, /Your characters live here—not in the cloud/);
});

test("unavailable image controls are disabled or hidden while ComfyUI is offline", () => {
  assert.match(app, /disabled=\{!activeReadyForChat \|\| !health\.comfy \|\| typing \|\| capturingMoment\}/);
  assert.match(app, /\{health\.comfy && <button[\s\S]*?className="avatar-refresh"/);
  assert.match(app, /if \(!active \|\| !health\.comfy \|\| typing \|\| capturingMoment\) return/);
});

test("empty discovery and settings actions use clear labels", () => {
  assert.match(app, /Use the character search on the left to choose someone to meet/);
  assert.match(app, /Save settings/);
  assert.doesNotMatch(app, /Save locally/);
});

test("character searches do not autocorrect names on mobile keyboards", () => {
  for (const label of ["Search for a new character", "Search researched characters"]) {
    const input = app.split("\n").find((line) => line.includes("<input") && line.includes(label)) || "";
    assert.match(input, /autoCorrect="off"/);
    assert.match(input, /autoCapitalize="off"/);
    assert.match(input, /spellCheck=\{false\}/);
  }
});

test("character catalogue status offers a manual reconnect and refreshes active discovery searches", () => {
  assert.match(app, /health\.animadex \? "Refresh" : "Reconnect"/);
  assert.match(app, /onClick=\{\(\) => void retryConnections\(\)\}/);
  assert.match(app, /\[mode, search, health\.animadex\]/);
  assert.match(app, /Character search is still offline/);
});

test("a first meeting opens immediately while the character profile is prepared", () => {
  assert.match(app, /openThread\(started\)/);
  assert.match(app, /className="build-in-chat"/);
  assert.match(app, /className="first-contact-card"/);
  assert.match(app, /Start this adventure/);
  assert.match(app, /Try another opening/);
  assert.match(app, /disabled=\{!activeReadyForChat\}/);
  assert.doesNotMatch(app, /className="profile-layer build-layer"/);
});

test("a dropped long-running profile response follows server progress instead of declaring setup failed", () => {
  assert.match(app, /const characterId = building\?\.id \|\| \(!pendingBuildThread\?\.profile \? pendingBuildThread\?\.id : ""\)/);
  assert.match(app, /if \(progress\?\.stage === "complete"\) \{[\s\S]*?api\.thread\(characterId\)/);
  assert.match(app, /if \(result\.thread\.profile\) \{[\s\S]*?mergeThread\(result\.thread\)/);
  assert.match(app, /awaitingServerResult = \/local service is not responding/);
  assert.match(app, /The connection was interrupted\. Checking whether character preparation is still running/);
});

test("profile setup errors retain the failed stage and appear on the recovery card", () => {
  assert.match(server, /failedStage: previous\?\.stage/);
  assert.match(server, /reportCreation\(body\.character\.id, "error", error instanceof Error \? error\.message/);
  assert.match(app, /buildStage\.stage === "error" && buildStage\.error/);
  assert.match(app, /Stopped during \{buildStage\.failedStage \|\| "setup"\}: \{buildStage\.error\}/);
});

test("factual review edits profiles without becoming a character-creation gate", () => {
  assert.match(ollama, /Character profile published with unresolved review warnings/);
  assert.doesNotMatch(ollama, /if \(blockingIssues\.length\) throw new Error\("Character research needs clarification/);
  assert.match(ollama, /if \(!hasUsableCoreProfile\(parsed\)\) throw new Error/);
});

test("a truncated validation response falls back to the usable pre-validation profile", () => {
  assert.match(ollama, /const preValidationProfile = structuredClone\(parsed\)/);
  assert.match(ollama, /catch \(validationError\) \{\s*parsed = preValidationProfile;/);
  assert.match(ollama, /Character profile validation was skipped after a recoverable local-model failure/);
});

test("mobile startup defers offscreen images and uses a smaller conversation window", () => {
  assert.match(app, /const MOBILE_MESSAGE_BATCH_SIZE = 40/);
  assert.match(app, /<Portrait character=\{character\} defer \/>/);
  assert.match(app, /loading=\{defer \? "lazy" : "eager"\}/);
  assert.match(app, /new IntersectionObserver/);
  assert.match(app, /rootMargin: "160px 0px"/);
  assert.match(app, /preview=webp%3B70/);
  assert.match(app, /loading="lazy"\s+decoding="async"/);
  assert.match(app, /const openFirstChat = Boolean\(first && !isMobileLayout\(\)\)/);
});
