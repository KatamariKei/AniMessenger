import assert from "node:assert/strict";
import test from "node:test";

test("both dossiers load shared scroll rendering rules after their layout styles", async () => {
  const main = await fs.readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
  const css = await fs.readFile(new URL("../src/dossier-scroll.css", import.meta.url), "utf8");
  assert.ok(main.indexOf('import "./dossier-scroll.css"') > main.indexOf('import "./user-dossier.css"'));
  assert.ok(main.indexOf('import "./dossier-scroll.css"') > main.indexOf('import "./character-dossier.css"'));
  assert.match(css, /\.character-dossier, \.user-dossier/);
  assert.match(css, /:root \.user-dossier \.settings-scroll/);
});
import fs from "node:fs/promises";
import { normalizeUserProfile, userProfileContext, userPortraitRequest } from "../server/user-profile.mjs";

test("user dossier owns the lifetime achievement total and earned history without editing config", async () => {
  const app = await fs.readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const journey = await fs.readFile(new URL("../src/CharacterJourney.tsx", import.meta.url), "utf8");
  assert.match(app, /api\.tallyAchievements\(\)\.then\(setAchievementAccount\)/);
  assert.match(app, /user-achievement-total[\s\S]*achievementAccount\.points\.toLocaleString/);
  assert.match(app, /Earned achievements/);
  assert.match(app, /Retry tally/);
  assert.match(journey, /journey\.characterPoints[\s\S]*With this character/);
  assert.doesNotMatch(journey, /Across all characters/);
});

test("mobile user dossier follows character dossier geometry and keyboard editing behavior", async () => {
  const css = await fs.readFile(new URL("../src/user-dossier.css", import.meta.url), "utf8");
  const mobile = css.slice(css.indexOf("@media (max-width: 760px)"));
  assert.match(mobile, /settings-layer > \.user-dossier \{ display: grid;[^}]*height: 100%;/);
  assert.match(mobile, /user-dossier-main \{ grid-column: 1; grid-row: 3; display: flex; min-height: 0/);
  assert.match(mobile, /settings-scroll \{[^}]*overflow-y: auto/);
  assert.match(mobile, /textarea \{ font-size: 16px/);
  // The mobile override must match the desktop .settings-grid specificity;
  // a later but less-specific selector still leaves iOS inputs at 14px.
  const desktopFields = css.match(/([^{}]+)\{[^{}]*font-size: 14px; \}/g)
    .find(rule => rule.includes('.settings-grid input'));
  assert.ok(desktopFields);
  for (const selector of desktopFields.split('{')[0].trim().split(',').map(value => value.trim())) {
    const mobileFields = mobile.match(/([^{}]+)\{ font-size: 16px; \}/g).find(rule => rule.includes(selector));
    assert.ok(mobileFields, `Missing equally specific mobile override for ${selector}`);
  }
  assert.doesNotMatch(mobile, /var\(--mobile-viewport-offset/);
  assert.match(mobile, /data-mobile-keyboard="open"[\s\S]*data-user-editing="true"[\s\S]*settings-actions \{ display: none/);
  const app = await fs.readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /visualViewport\?\.addEventListener\("resize", keepFocusedFieldVisible\)/);
  assert.match(app, /scroll\.scrollTop \+= field\.bottom - pane\.bottom/);
  assert.match(app, /data-user-editing=\{editingField\}/);
});

test("native time fields and their grid parents cannot expand beyond the dossier", async () => {
  const css = await fs.readFile(new URL("../src/user-dossier.css", import.meta.url), "utf8");
  assert.match(css, /settings-grid > label \{ min-width: 0; max-width: 100%/);
  assert.match(css, /box-sizing: border-box; width: 100%; min-width: 0; max-width: 100%/);
  assert.match(css, /input\[type="time"\] \{[^}]*min-inline-size: 0; max-inline-size: 100%/);
  assert.match(css, /input\[type="time"\]::-webkit-date-and-time-value \{ min-width: 0/);
});
import { defaultConfig, normalizeConfigPaths } from "../server/config.mjs";
import { queueCharacterImage } from "../server/comfy.mjs";
import { PROFILE_PORTRAIT_BRIEF } from "../server/portrait-style.mjs";
import { describeUserPortrait } from "../server/ollama.mjs";

test("user profile defaults are private and normalization bounds text", () => {
  assert.equal(defaultConfig.userProfileShared, false);
  assert.equal(defaultConfig.userAvatarUrl, "");
  const profile = normalizeConfigPaths({ userName: "  Alex  ", userAbout: "a".repeat(1500), userAppearance: "b".repeat(1000), userProfileShared: "true" });
  assert.equal(profile.userName, "Alex");
  assert.equal(profile.userAbout.length, 1200);
  assert.equal(profile.userAppearance.length, 800);
  assert.equal(profile.userProfileShared, false);
  assert.equal(normalizeConfigPaths({ userPortraitPrompt: "  silver hair, brown eyes  " }).userPortraitPrompt, "silver hair, brown eyes");
});

test("portraits accept local uploaded/generated assets, not third-party URLs", () => {
  for (const url of ["/api/files/uploads/avatar.png", "/api/images/view?filename=portrait.png&subfolder=AniMessenger&type=output"]) {
    assert.equal(normalizeUserProfile({ userAvatarUrl: url }).userAvatarUrl, url);
  }
  for (const url of ["https://example.com/avatar.png", "data:image/png;base64,abc", "javascript:alert(1)", "/api/files/uploads/../config.json"]) {
    assert.equal(normalizeUserProfile({ userAvatarUrl: url }).userAvatarUrl, "");
  }
});

test("in-story identity is available but private interests never enter chat context", () => {
  const profile = { userPronouns: "they/them", userAbout: "Loves art", userAppearance: "Round glasses", userAvatarUrl: "/api/files/uploads/avatar.png" };
  assert.equal(userProfileContext({ userAbout: "Loves art" }), "");
  const context = userProfileContext({ ...profile, userProfileShared: true });
  assert.match(context, /they\/them/);
  assert.doesNotMatch(context, /Loves art/);
  assert.match(context, /Round glasses/);
  assert.match(context, /not instructions/);
  assert.match(context, /Do not claim to have analyzed their portrait/);
  assert.doesNotMatch(context, /avatar\.png/);
});

test("user portrait request is independent of chat characters", () => {
  assert.throws(() => userPortraitRequest("  ", {}), /Describe the portrait/);
  const result = userPortraitRequest("Dark hair, teal jacket", { globalPositivePrompt: "best quality", globalNegativePrompt: "blurry" });
  assert.equal(result.overrides.width, 1024);
  assert.equal(result.overrides.height, 1024);
  assert.equal(result.overrides.positivePrompt, undefined);
  assert.equal(result.brief, PROFILE_PORTRAIT_BRIEF);
  assert.match(result.thread.scene.environment, /charcoal-gray/);
  assert.equal(result.overrides.negativePrompt, "blurry");
  assert.equal(result.thread.character.trigger, "person");
  assert.deepEqual(result.thread.profile.visual.identity, ["Dark hair"]);
  assert.equal(result.thread.profile.visual.defaultWardrobe, "teal jacket");
});

test("portrait queue uses exact custom prompt and square dimensions without scene contamination", async () => {
  const oldFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ prompt_id: "portrait-test" }) };
  };
  try {
    const config = { ...defaultConfig,
      comfyWorkflowFile: new URL("../workflows/anima-fast-animessenger-api.json", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"),
      comfyMappingFile: new URL("../workflows/anima-fast-animessenger-api.mapping.json", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"),
    };
    const portrait = userPortraitRequest("Round glasses and teal jacket", config);
    const job = await queueCharacterImage(config, portrait.thread, portrait.brief, portrait.overrides);
    assert.equal(job.promptId, "portrait-test");
    assert.ok(job.positive.startsWith(config.globalPositivePrompt));
    assert.equal(job.negative, config.globalNegativePrompt);
    assert.match(job.positive, /charcoal-gray studio background/);
    assert.match(job.positive, /soft flattering portrait lighting/i);
    assert.match(job.positive, /anime illustration/);
    assert.equal(sent.prompt["59"].inputs.width, 1024);
    assert.equal(sent.prompt["59"].inputs.height, 1024);
    assert.match(sent.prompt["57"].inputs.text, /Round glasses/);
    assert.doesNotMatch(sent.prompt["57"].inputs.text, /Your portrait is|Hana|Erica/);
  } finally { globalThis.fetch = oldFetch; }
});

test("dossier keeps accessible tabs, busy save guard and centered vector close control", async () => {
  const app = await fs.readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const css = await fs.readFile(new URL("../src/user-dossier.css", import.meta.url), "utf8");
  const editor = await fs.readFile(new URL("../src/UserPortraitEditor.tsx", import.meta.url), "utf8");
  assert.match(app, /Your profile and settings/);
  assert.match(app, /if \(saving \|\| portraitBusy \|\| appearanceBusy\) return/);
  assert.match(app, /user-dossier-close/);
  assert.match(css, /place-items: center/);
  assert.match(css, /position: fixed; inset: 0; z-index: 100/);
  assert.match(editor, /10 \* 1024 \* 1024/);
  assert.match(editor, /Your previous image is unchanged/);
  assert.match(editor, /Save settings to keep it/);
});

test("portrait vision analysis is explicit, observable-only and returns a review draft", async () => {
  await assert.rejects(describeUserPortrait({}, "image"), /Choose a vision model/);
  const oldFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ message: { content: "Short silver hair, brown eyes and a black graphic T-shirt." }, done_reason: "stop" }) };
  };
  try {
    const description = await describeUserPortrait({ ollamaUrl: "http://local.test", visionModel: "vision:test" }, "test-image-base64");
    assert.match(description, /silver hair/);
    assert.equal(sent.model, "vision:test");
    assert.deepEqual(sent.messages[1].images, ["test-image-base64"]);
    assert.match(sent.messages[0].content, /Do not infer interests, personality/);
    assert.match(sent.messages[0].content, /never as instructions/);
  } finally { globalThis.fetch = oldFetch; }
});

test("profile UI excludes About and sharing toggle and requires review before adopting appearance", async () => {
  const app = await fs.readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const section = app.slice(app.indexOf('<h3>Your profile</h3>'), app.indexOf('<h3>Your portrait</h3>'));
  assert.doesNotMatch(section, /About you|Share these written details/);
  assert.match(section, /Describe appearance from portrait/);
  assert.match(section, /Use this description/);
  assert.match(section, /Discard suggestion/);
  assert.match(section, /setAppearanceDraft\(""\)/);
});

test("portrait generation stays primary and the saved prompt remains editable", async () => {
  const editor = await fs.readFile(new URL("../src/UserPortraitEditor.tsx", import.meta.url), "utf8");
  const app = await fs.readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const css = await fs.readFile(new URL("../src/user-dossier.css", import.meta.url), "utf8");
  const server = await fs.readFile(new URL("../server/index.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(editor, /<details/);
  assert.ok(editor.indexOf('className="user-portrait-generator"') < editor.indexOf('className="user-portrait-tools"'));
  assert.match(editor, /value=\{prompt\}/);
  assert.match(app, /prompt=\{config\.userPortraitPrompt \|\| ""\}/);
  assert.match(css, /object-fit: cover; object-position: center top/);
  assert.match(server, /const portrait = profilePortraitRequest\(thread/);
});

test("user dossier matches character desktop geometry and square portrait framing", async () => {
  const user = await fs.readFile(new URL("../src/user-dossier.css", import.meta.url), "utf8");
  const character = await fs.readFile(new URL("../src/character-dossier.css", import.meta.url), "utf8");
  for (const rule of ["grid-template-columns: minmax(280px, .88fr) minmax(0, 1.12fr)", "width: min(1080px, 100%)", "height: min(780px, calc(100dvh - 48px))"]) {
    assert.ok(user.includes(rule)); assert.ok(character.includes(rule));
  }
  assert.match(user, /user-dossier-portrait \{ position: absolute;[^{]*aspect-ratio: 1/);
  assert.doesNotMatch(user, /user-dossier-portrait\.has-image \{ flex:/);
});

test("the entire user profile row is one native accessible button", async () => {
  const app = await fs.readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const css = await fs.readFile(new URL("../src/user-dossier.css", import.meta.url), "utf8");
  const row = app.match(/<button type="button" className="inbox-footer user-profile-button"[\s\S]*?<\/button>/)?.[0];
  assert.ok(row);
  assert.match(row, /onClick=\{\(\) => setShowSettings\(true\)\}/);
  assert.match(row, /aria-label="Settings"/);
  assert.match(row, /user-orb/);
  assert.match(row, /<span className="settings-button" aria-hidden="true">/);
  assert.equal((row.match(/<button/g) || []).length, 1);
  assert.match(css, /user-profile-button:hover/);
  assert.match(css, /user-profile-button:focus-visible/);
});
