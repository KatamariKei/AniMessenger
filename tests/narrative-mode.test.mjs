import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ensureNarrativeParagraphs,
  narrativeModeInstructions,
  narrativeTurnText,
  normalizeConversationMode,
  normalizeNarration,
  normalizeStoryTurn,
  storyDialogueRequired,
  storyMinimumWords,
  storyPassageHasDanglingSpeechCue,
  storyPassageHasDialogue,
  storyTurnHasUsablePassage,
  storyTurnMeetsRequirements,
} from "../server/narrative-mode.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("legacy and unknown conversation modes remain ordinary chat", () => {
  assert.equal(normalizeConversationMode(undefined), "chat");
  assert.equal(normalizeConversationMode("narrative"), "chat");
  assert.equal(normalizeConversationMode("story"), "story");
});

test("Story mode moves a stray legacy action tag out of the dialogue bubble", () => {
  assert.deepEqual(normalizeStoryTurn({
    reply: "[action: glances toward the rain] We should wait here.",
    narration: "Thunder rolls beyond the windows.",
    mode: "story",
    characterName: "Motoko",
  }), {
    reply: "We should wait here.",
    narration: "Thunder rolls beyond the windows. Motoko glances toward the rain.",
  });
});

test("narration is retained only for Story mode and cleaned for display", () => {
  assert.equal(normalizeNarration("Narrator: Rain whispered across the glass.", "chat"), null);
  assert.equal(normalizeNarration("  Narrator:  Rain   whispered across the glass. ", "story"), "Rain whispered across the glass.");
});

test("Narrative normalization never crops prose at an arbitrary character boundary", () => {
  const longPassage = "A complete sentence carries the moment forward. ".repeat(80).trim();
  const normalized = normalizeNarration(longPassage, "story");
  assert.ok(normalized.length > 2600);
  assert.match(normalized, /forward\.$/);
});

test("long unbroken Story prose receives readable paragraph structure", () => {
  const prose = "Motoko studies the menu while the surf murmurs beyond the glass. She traces the courses with one finger and considers the evening ahead. Then she looks up. Her expression warms as she settles back into the chair. The restaurant falls away until only the shared table seems to remain.";
  const formatted = ensureNarrativeParagraphs(prose);
  assert.match(formatted, /\n\nThen she looks up\.\n\n/);
  assert.ok(formatted.split("\n\n").length >= 3);
});

test("questions and explicit requests for words require character dialogue", () => {
  assert.equal(storyDialogueRequired("What do you think of the menu?"), true);
  assert.equal(storyDialogueRequired("Tell me what you're thinking."), true);
  assert.equal(storyDialogueRequired("[action: I slide the menu across the table.]"), false);
  assert.equal(storyDialogueRequired("[action: I text her] Hope your shift isn't too hard.", "apart"), true);
  assert.equal(storyPassageHasDialogue('Motoko looks up. “It works,” she says.'), true);
  assert.equal(storyPassageHasDialogue("Motoko looks up and nods."), false);
  assert.equal(storyPassageHasDanglingSpeechCue("She leans closer, lowering her voice as she speaks."), true);
  assert.equal(storyPassageHasDanglingSpeechCue('She leans closer. “It works,” she says.'), false);
  assert.match(narrativeModeInstructions("story", "together", "Answer me, Motoko.").join("\n"), /VERBAL RESPONSE REQUIRED/);
});

test("Story mode keeps dialogue inside its sole narrative response field", () => {
  const guidance = narrativeModeInstructions("story", "together", "What do you think?").join("\n");
  assert.match(guidance, /Narration is the only response field/);
  assert.match(guidance, /end before writing what they actually say/);
});

test("Story mode protects user agency and keeps remote narration on the character side", () => {
  const guidance = narrativeModeInstructions("story", "apart").join("\n");
  assert.match(guidance, /Never invent additional user dialogue, choices/);
  assert.match(guidance, /character's side of the connection/);
  assert.match(guidance, /complete message the character sends back/);
  assert.match(guidance, /without showing the actual words delivered/);
  assert.match(guidance, /complete visible response/);
  assert.match(guidance, /before, during, and after/);
  assert.match(guidance, /Mix short, medium, and long sentences/);
  assert.match(guidance, /two to four short paragraphs/);
});

test("the complete narrative passage is the canonical story turn without duplicate dialogue", () => {
  assert.equal(
    narrativeTurnText({ narration: "The elevator doors part.", reply: "This is our floor." }),
    "The elevator doors part.",
  );
});

test("Story mode accepts a usable legacy reply field before normalizing it into narration", () => {
  const legacy = {
    reply: "Hana goes still for one startled heartbeat, then rises onto her toes and returns the kiss with breathless, unmistakable warmth.",
  };
  assert.equal(storyTurnMeetsRequirements(legacy), true);
  assert.equal(storyTurnHasUsablePassage(legacy), true);
  assert.equal(normalizeStoryTurn({ ...legacy, mode: "story", characterName: "Hana" }).narration, legacy.reply);
  assert.equal(storyTurnMeetsRequirements({ reply: "She leans closer, lowering her voice as she speaks." }), false);
  assert.equal(storyTurnHasUsablePassage({ reply: "She leans closer, lowering her voice as she speaks." }), true);
  assert.equal(storyTurnMeetsRequirements({ reply: "Hana looks up and nods." }, true), false);
  assert.equal(storyTurnHasUsablePassage({ narration: "…" }), false);
});

test("short dialogue-free reactions to spoken turns receive one completion retry", () => {
  const croppedFeeling = {
    narration: "Astolfo freezes for a moment, then beams with bashful joy. He does not look away; instead, a rosy flush spreads across his cheeks as the flirtation sinks in.",
  };
  assert.equal(storyMinimumWords("Of course, my favorite cake is yours."), 60);
  assert.equal(storyMinimumWords("[action: I take his hand.]"), 0);
  assert.equal(storyTurnMeetsRequirements(croppedFeeling, false, 60), false);
  assert.equal(storyTurnMeetsRequirements({ narration: 'Astolfo grins. “Then you have excellent taste.”' }, false, 60), true);
});

test("the client exposes a persistent mode control and a typewritten prose surface", () => {
  const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
  const api = fs.readFileSync(path.join(root, "src", "api.ts"), "utf8");
  const css = fs.readFileSync(path.join(root, "src", "local.css"), "utf8");
  assert.match(app, /className=\{"conversation-mode-control/);
  assert.match(app, /function StoryPassage/);
  assert.match(app, /story-passage-line/);
  assert.match(app, /requestAnimationFrame/);
  assert.match(app, /tokens\.slice\(0, visibleTokens\)/);
  assert.match(app, /onCompleteRef\.current\(\)/);
  assert.match(app, /followLatestMessageRef\.current/);
  assert.doesNotMatch(app, /passageEndRef\.current\?\.scrollIntoView/);
  assert.match(app, /finishStoryReveal[\s\S]*?setAnimatedStoryMessageId\(\(current\) => current === messageId \? "" : current\)/);
  assert.match(app, /storyRevealWaitersRef\.current\.values\(\)[\s\S]*?setAnimatedStoryMessageId\(""\)/);
  assert.match(app, /text\.split\(\/\(\\s\+\)\//);
  assert.match(app, /visibleStoryPassage\(last\)/);
  assert.match(app, /visibleMessages\.map/);
  assert.match(app, /await revealFinished/);
  assert.match(app, /onComplete=\{\(\) => finishStoryReveal\(message\.id\)\}/);
  assert.match(app, /!isStoryPassage && message\.from === "character"[\s\S]*?className="reaction-control"/);
  assert.match(app, /const nextMode = active\.conversationMode === "story" \? "chat" : "story";\s*setReactionTarget\(null\)/);
  assert.doesNotMatch(app, /const renderedMessages/);
  assert.match(api, /setConversationMode/);
  assert.match(api, /conversation-mode/);
  assert.match(css, /\.story-passage\s*\{[\s\S]*?padding-bottom:\s*\.22em/);
  assert.match(css, /\.story-passage\s*\{[\s\S]*?text-wrap:\s*wrap/);
  assert.match(css, /\.story-reveal-edge\s*\{[\s\S]*?vertical-align:\s*text-bottom/);
  assert.doesNotMatch(css, /\.message-scroll\s*>\s*\.message-line\s*\{[\s\S]*?content-visibility:\s*auto/);
});

test("older history preserves its viewport instead of snapping to the bottom", () => {
  const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
  assert.match(app, /historyPrependAnchorRef\.current = \{ height: scroll\.scrollHeight, top: scroll\.scrollTop \}/);
  assert.match(app, /scroll\.scrollTop = prependAnchor\.top \+ \(scroll\.scrollHeight - prependAnchor\.height\)/);
  assert.match(app, /className="message-scroll"[\s\S]*?onScroll=\{trackMessageScroll\}/);
});
