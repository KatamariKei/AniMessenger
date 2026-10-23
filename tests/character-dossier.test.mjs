import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/character-dossier.css"), "utf8");
const scrollCss = fs.readFileSync(path.join(root, "src/dossier-scroll.css"), "utf8");
const journey = fs.readFileSync(path.join(root, "src/CharacterJourney.tsx"), "utf8");

test("the character dossier disables fullscreen backdrop blur without removing the dimmed overlay", () => {
  assert.match(scrollCss, /:root \.profile-layer:has\(> :is\(\.character-dossier, \.user-dossier\)\) \{\s*backdrop-filter: none;\s*-webkit-backdrop-filter: none;/);
  assert.match(css, /\.profile-layer:has\(> \.character-dossier\) \{[^}]*background: rgba\(5, 8, 10, \.8\)/);
});

test("all dossier tabs share an opaque isolated scroll layer without size containment", () => {
  assert.match(scrollCss, /\.character-dossier :is\(\.profile-section, \.profile-memories, \.profile-gallery, \.profile-journey\),\s*:root \.user-dossier \.settings-scroll \{\s*contain: layout paint;\s*isolation: isolate;\s*transform: translateZ\(0\);\s*background: #101518;/);
  assert.doesNotMatch(scrollCss, /contain:\s*(?:strict|size|content)/);
});

test("the character dossier uses existing bust artwork and real character information", () => {
  assert.match(app, /className="profile-card character-dossier"/);
  assert.match(app, /<Portrait character=\{active.character\} large \/>/);
  assert.match(app, /traits.slice\(0, 5\)/);
  assert.match(app, /dossier-hero-caption">\{\(active.profile.persona\?\.traits \|\| \[\]\)\.slice\(0, 3\)/);
  assert.match(app, /const openProfile = async \(\) => \{\s*if \(active\?\.summary\)/);
  assert.match(app, /newestSnapshot.summary && olderSnapshot && !olderSnapshot.summary/);
  assert.match(app, /active.scene.location/);
  assert.match(app, /active.scene.outfit/);
  assert.match(css, /\.portrait:not\(\.portrait--sprite\)/);
});

test("dossier polish uses one theme accent and only offers expansion for clipped mobile copy", () => {
  assert.match(css, /--character-accent: var\(--accent-bright\)/);
  assert.doesNotMatch(app, /"--character-accent": accentFor/);
  assert.match(app, /copy.scrollHeight > lineHeight \* 3/);
  assert.match(app, /new ResizeObserver\(measure\)/);
  assert.match(css, /profile-tabs \{ background: transparent/);
  assert.match(css, /profile-hero-copy \{ align-self: flex-start; margin: 0; padding: 0; text-align: left/);
  assert.match(css, /profile-hero-copy h2 \{ margin-left: 0; padding-left: 0; text-indent: -.035em/);
});

test("wide and mobile dossiers have distinct layouts and one bounded content scroller", () => {
  assert.match(css, /grid-template-columns: minmax\(280px, .88fr\) minmax\(0, 1.12fr\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /grid-template-rows: auto auto minmax\(0, 1fr\)/);
  assert.match(css, /:is\(\.profile-section, \.profile-memories, \.profile-gallery\)[\s\S]*?min-height: 0/);
  assert.match(css, /\[data-profile-tab="memories"\][\s\S]*?min-height: 88px/);
});

test("long profile details are disclosed accessibly rather than stacked in full", () => {
  for (const name of ["dossier-outfit", "dossier-voice", "dossier-identity"]) assert.match(app, new RegExp(`<details className="dossier-disclosure ${name}"`));
  assert.match(app, /aria-controls="dossier-about-copy"/);
  assert.match(app, /className="dossier-chat-options"><summary aria-label="Chat options"/);
  assert.match(app, /className="dossier-edit" type="button" onClick=\{\(\) => setShowIdentityEditor\(true\)\}/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /prefers-contrast/);
});

test("editing a memory gives space back when the iOS keyboard is open", () => {
  assert.match(app, /data-memory-editing=\{Boolean\(memoryDraft\)\}/);
  assert.match(app, /dataset.mobileKeyboard = window.innerHeight - height > 140/);
  assert.match(css, /data-mobile-keyboard="open"[\s\S]*?\.profile-hero/);
  assert.match(css, /data-mobile-keyboard="open"[\s\S]*?\.dossier-footer \{ display: none; \}/);
  assert.match(css, /\.memory-editor-actions \{ position: static/);
});

test("disclosure headings stay anchored and the desktop gallery uses three columns", () => {
  assert.match(css, /dossier-disclosure > summary \{ display: flex; align-items: flex-start/);
  assert.match(css, /summary b[^\n]*line-height: 20px/);
  assert.match(css, /@media \(min-width: 761px\)[\s\S]*profile-gallery \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

test("Journey is a keyboard-accessible tab with honest preview and no spoiler slots", () => {
  assert.match(app, /profile-tab-journey.*role="tab"/);
  assert.match(app, /const tabs = \["profile", "memories", "gallery", "journey"\]/);
  assert.match(journey, /role="tabpanel" aria-labelledby="profile-tab-journey"/);
  assert.match(journey, /Verified progress · rewards are still being tested/);
  assert.match(journey, /Target reached · awaiting reward activation/);
  assert.match(journey, /AchievementEmblem/);
  assert.match(journey, /<progress max=\{achievement.target\} value=\{achievement.progress\}/);
  assert.doesNotMatch(journey, /secret slots|revelation 1/i);
  assert.match(css, /profile-tabs \{ overflow-x: auto/);
});

test("the laughter emblem preserves the edited Illustrator geometry and uses the theme color", () => {
  assert.match(journey, /viewBox="0 0 240 240"/);
  assert.match(journey, /points="70 76.3 100 96.3 70 116.3" strokeWidth="10"/);
  assert.match(journey, /points="170 76.3 140 96.3 170 116.3" strokeWidth="10"/);
  assert.match(journey, /d="M70,139.5h100c0,60-100,60-100,0Z" fill="currentColor" stroke="none"/);
});

test("achievement progress uses a dark track and explicit accent fill across browsers", () => {
  assert.match(css, /journey-achievement progress \{[^\n]*appearance: none[^\n]*background: #29383c/);
  assert.match(css, /progress::-webkit-progress-bar \{ background: #29383c/);
  assert.match(css, /progress::-webkit-progress-value \{ background: var\(--character-accent\)/);
  assert.match(css, /progress::-moz-progress-bar \{ background: var\(--character-accent\)/);
});

test("discovery preparation is opt-in and announces queued and active work", () => {
  assert.match(journey, /onClick=\{prepareDiscoveries\}/);
  assert.match(journey, /api.prepareDiscoveries\(thread.id, discoveryStatus === "ready"\)/);
  assert.match(journey, /Queued behind active chat and image work/);
  assert.match(journey, /aria-live="polite"/);
  assert.match(journey, /Follow a lead or ask naturally/);
  assert.match(journey, /Focus on this clue/);
  assert.match(journey, /leadAvailability\?\.newAvailable/);
  assert.doesNotMatch(journey, /Look for leads|>Check again</);
  assert.match(journey, /Exploring this clue<\/span>/);
});
