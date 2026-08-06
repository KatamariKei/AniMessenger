import test from "node:test";
import assert from "node:assert/strict";
import { briefReactionGuard, conversationMomentumGuard, directQuestionGuard, evadesDirectQuestion, groundedReplyFallback, hasUsableCharacterReply, inventsUserBehavior, isGenericRelationshipAnswer, isRunawayAssistantHistory, needsReplyRepair, repeatsRecentReply } from "../server/ollama.mjs";
import { isCannedConditionalIntimacy, recentStyleCooldown, repeatsRecentStyle } from "../server/style-control.mjs";

test("detects duplicate-input panic replies so they do not reinforce themselves", () => {
  assert.equal(isRunawayAssistantHistory("H-HEY!!! Stop, stop, stop! You repeated your message and triggered an infinite loop! Error 404!"), true);
});

test("keeps ordinary technical conversation in history", () => {
  assert.equal(isRunawayAssistantHistory("A duplicate packet can happen when a client retries after a timeout."), false);
});

test("empty and ellipsis-only character replies require regeneration", () => {
  assert.equal(hasUsableCharacterReply(""), false);
  assert.equal(hasUsableCharacterReply("…"), false);
  assert.equal(hasUsableCharacterReply("..."), false);
  assert.equal(hasUsableCharacterReply("Give me five minutes. I am on my way."), true);
});

test("repairs metaphor pileups when the user is not discussing technology", () => {
  const reply = "My CPU is burning up! Panic Mode activated, the buffer is overflowing, and my firewall needs a patch!";
  assert.equal(needsReplyRepair(reply, "Are you feeling okay?"), true);
  assert.equal(needsReplyRepair(reply, "Can you explain this computer bug?"), false);
});

const repetitiveFutabaHistory = [
  "That is a major debuff to my stats.",
  "My mana needs time to regenerate after that quest.",
  "This status effect is completely unfair.",
  "The final boss can wait until tomorrow.",
  "My HP is low, so no more combat tonight.",
].map((text) => ({ from: "character", text }));

test("builds a cooldown when recent replies saturate the same metaphor family", () => {
  const cooldown = recentStyleCooldown(repetitiveFutabaHistory);
  assert.match(cooldown, /RECENT STYLE COOLDOWN/);
  assert.match(cooldown, /gaming stats/);
});

test("flags a new reply that continues a saturated character gimmick", () => {
  const draft = "Okay, but my stamina stat still needs another buff before the next quest.";
  assert.equal(repeatsRecentStyle(draft, repetitiveFutabaHistory), true);
  assert.equal(needsReplyRepair(draft, "Let's take a break.", repetitiveFutabaHistory), true);
});

test("allows a plain response after repetitive character history", () => {
  const draft = "Yeah, a break sounds good. I had fun, but I'd rather relax with you for a while.";
  assert.equal(repeatsRecentStyle(draft, repetitiveFutabaHistory), false);
  assert.equal(needsReplyRepair(draft, "Let's take a break.", repetitiveFutabaHistory), false);
});

const repetitiveFayeHistory = [
  "That's bold for someone who sounds so unsure. Fine... if you want to look closer, do it. Just don't complain when you discover more than you expected.",
  "Compliments are an easy shortcut, Alex. Still, I suppose this one sounded honest. You're on thin ice, though. Don't blame me if it cracks.",
  "Spoken like a poet. Or a fool. Hard to tell. I usually hate that kind of line, but yours was not all that terrible. Just don't expect sympathy when the shadows catch up.",
].map((text) => ({ from: "character", text }));

test("detects a repeated tease, concession, and warning response structure", () => {
  const cooldown = recentStyleCooldown(repetitiveFayeHistory);
  assert.match(cooldown, /RECENT STYLE COOLDOWN/);
  assert.match(cooldown, /guarded or reluctant concession/);
  assert.match(cooldown, /conditional warning or challenge ending/);
  assert.match(cooldown, /danger, fire, light, or shadow metaphor/);
});

test("repairs another reply built from the same guarded Mad Libs template", () => {
  const draft = "You sound awfully confident for someone taking that risk. But I suppose I can allow it. Just don't expect me to rescue you when you get burned.";
  assert.equal(repeatsRecentStyle(draft, repetitiveFayeHistory), true);
  assert.equal(needsReplyRepair(draft, "I meant every word.", repetitiveFayeHistory), true);
});

test("allows the same guarded personality to use a fresh rhetorical shape", () => {
  const draft = "I know you meant it. That's the part I'm still deciding what to do with.";
  assert.equal(repeatsRecentStyle(draft, repetitiveFayeHistory), false);
  assert.equal(needsReplyRepair(draft, "I meant every word.", repetitiveFayeHistory), false);
});

test("repairs invented user looks that were never established", () => {
  const history = [
    { from: "user", text: "You try the fries?" },
    { from: "character", text: "They're fine. A bit too salty, but I'm not complaining." },
  ];
  const reply = "What's that look for? Don't tell me you've suddenly turned boring on me.";
  assert.equal(inventsUserBehavior(reply, "hmm... ok", history), true);
  assert.equal(needsReplyRepair(reply, "hmm... ok", history), true);
});

test("allows reference to a user gaze when the user explicitly established it", () => {
  const history = [{ from: "user", text: "I keep one eye on her while she eats." }];
  assert.equal(inventsUserBehavior("Stop staring. You're going to make me choke.", "I know the Heimlich maneuver.", history), false);
});

test("repairs canned interpretations that replace the user's literal meaning", () => {
  assert.equal(inventsUserBehavior("Is that your way of saying I'm a handful?", "I thought you were craving salty.", []), true);
  assert.equal(inventsUserBehavior("Don't tell me you're getting bored already.", "hmm... ok", []), true);
  assert.equal(inventsUserBehavior("Don't tell me you've lost your appetite already.", "hmm... ok", []), true);
  assert.equal(inventsUserBehavior("Don't go getting quiet on me now.", "hmm... ok", []), true);
  assert.equal(inventsUserBehavior("Are you just losing interest?", "hmm... ok", []), true);
});

test("adds a grounding guard for brief conversational reactions", () => {
  assert.match(briefReactionGuard("hmm... ok"), /Treat it literally/);
  assert.match(briefReactionGuard("ha"), /brief conversational reaction/);
  assert.equal(briefReactionGuard("I just thought you were craving salty."), "");
});

test("uses a deterministic clarification when a repaired reply still invents user state", () => {
  assert.equal(groundedReplyFallback("You going quiet on me already?", "hmm... ok", []), "Hmm?");
  assert.equal(groundedReplyFallback("Quiet tonight, aren't you? Is something bothering you?", "hmm... ok", []), "Hmm?");
  assert.equal(groundedReplyFallback("Is that your way of saying I'm a handful?", "I thought you were craving salty.", []), "What do you mean?");
  assert.equal(groundedReplyFallback("The fries are saltier than I expected.", "hmm... ok", []), "The fries are saltier than I expected.");
});

test("guards direct follow-up questions and rejects acknowledgment-only non-answers", () => {
  const question = "What makes you say that?";
  assert.match(directQuestionGuard(question), /direct follow-up question/);
  assert.equal(evadesDirectQuestion("You've got a point.", question), true);
  assert.equal(evadesDirectQuestion("Fair enough.", "No, why would you say that about yourself?"), true);
  assert.equal(needsReplyRepair("You've got a point.", question, []), true);
});

test("allows concise but substantive answers to direct follow-up questions", () => {
  const question = "Why would you say you have a thick skull?";
  assert.equal(evadesDirectQuestion("Because I ignored the obvious until you spelled it out.", question), false);
  assert.equal(evadesDirectQuestion("I don't know. That came out wrong.", question), false);
  assert.equal(needsReplyRepair("Because I ignored the obvious until you spelled it out.", question, []), false);
  assert.equal(directQuestionGuard("Do you want another drink?"), "");
});

test("adds selective momentum guidance for relationship, planning, and reflective openings", () => {
  assert.match(conversationMomentumGuard("How are you feeling about our relationship?"), /one natural door deeper/);
  assert.match(conversationMomentumGuard("What would you like to do tonight?"), /one concrete/);
  assert.match(conversationMomentumGuard("What's been on your mind lately?"), /invited reflection/);
  assert.equal(conversationMomentumGuard("The popcorn is ready."), "");
});

test("repairs exact recent repeats and generic relationship platitudes", () => {
  const repeated = "I'm feeling pretty great about it, honestly. You're someone I can really count on and trust—it means a lot to me.";
  const history = [{ from: "character", text: repeated }];
  const question = "How are you feeling about our relationship?";
  assert.equal(repeatsRecentReply(repeated, history), true);
  assert.equal(isGenericRelationshipAnswer(repeated, question), true);
  assert.equal(needsReplyRepair(repeated, question, history), true);
  assert.equal(isGenericRelationshipAnswer("I trust you because you stayed when things got ugly. Part of me still expects that to change.", question), false);
});

test("rejects the stock careful-you-keep-talking conditional intimacy trope", () => {
  const faye = "Careful, Alex. You keep talking like that and I might actually start believing you.";
  const softerVariant = "Keep this up and I might just start enjoying your company.";
  const splitVariant = "Careful with the lines like that. I might actually start thinking you mean it.";
  assert.equal(isCannedConditionalIntimacy(faye), true);
  assert.equal(isCannedConditionalIntimacy(softerVariant), true);
  assert.equal(isCannedConditionalIntimacy(splitVariant), true);
  assert.equal(needsReplyRepair(faye, "I meant it.", []), true);
  assert.equal(needsReplyRepair(splitVariant, "I meant it.", []), true);
  assert.equal(isCannedConditionalIntimacy("I believe you. Don't make me regret saying that."), false);
});

test("rejects contracted and reversed conditional-intimacy variants", () => {
  assert.equal(isCannedConditionalIntimacy("Careful, keep talking like that and I'll start thinking you have good taste."), true);
  assert.equal(isCannedConditionalIntimacy("Careful, you're going to make me think you have good taste."), true);
  assert.equal(isCannedConditionalIntimacy("I might actually start expecting it if you keep this up."), true);
});

test("rejects the stock playing-with-fire guarded flirtation immediately", () => {
  const stockLine = "You're playing with fire, Alex. Don't act surprised when you get burned.";
  assert.equal(isCannedConditionalIntimacy(stockLine), true);
  assert.equal(needsReplyRepair(stockLine, "I know what I want.", []), true);
  assert.equal(isCannedConditionalIntimacy("You're playing with fire."), true);
  assert.equal(isCannedConditionalIntimacy("Don't act surprised when you get burned."), true);
  assert.equal(isCannedConditionalIntimacy("I burned the toast."), false);
});
