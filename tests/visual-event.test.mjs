import assert from "node:assert/strict";
import test from "node:test";
import { keyVisualPhotoBrief, visualEventOpportunity } from "../server/visual-event.mjs";

test("immediate visual transitions can open a photo opportunity while characters are apart", () => {
  assert.match(visualEventOpportunity("Go try on the red dress.", { presence: "apart" }), /outfit/i);
  assert.match(visualEventOpportunity("Open your gift already!", { presence: "apart" }), /reveal/i);
  assert.match(visualEventOpportunity("You arrived at the rooftop.", { presence: "apart" }), /location/i);
  assert.match(visualEventOpportunity("You finished your makeover!", { presence: "apart" }), /appearance/i);
  assert.match(visualEventOpportunity("Nagatoro finishes her workout, showers, gets dressed, and texts me back.", { presence: "apart" }), /outfit/i);
});

test("character replies can independently establish a missed visual payoff", () => {
  const apart = { presence: "apart" };
  assert.match(visualEventOpportunity("I just finished my workout.", apart, { actor: "character" }), /activity/i);
  assert.match(visualEventOpportunity("I finally got out of the shower and got dressed.", apart, { actor: "character" }), /outfit/i);
  assert.match(visualEventOpportunity("I'm at the observation deck now.", apart, { actor: "character" }), /location/i);
  assert.match(visualEventOpportunity("Here's my new outfit.", apart, { actor: "character" }), /outfit/i);
  assert.equal(visualEventOpportunity("I just finished my workout.", { presence: "together" }, { actor: "character" }), null);
});

test("a model photo brief cannot replace the deterministic key-moment instruction", () => {
  const brief = keyVisualPhotoBrief("standing in a room", "an immediate outfit change", true, "[action: She changes into a red sequin dress]");
  assert.match(brief, /standing in a room/);
  assert.match(brief, /KEY VISUAL MOMENT/);
  assert.match(brief, /newly established state/);
  assert.match(brief, /actively sharing/);
  assert.match(brief, /red sequin dress/);
  assert.doesNotMatch(brief, /\[action:/i);
});

test("hypothetical talk and in-person scenes do not create automatic character-sent photos", () => {
  assert.equal(visualEventOpportunity("Would you ever try on a red dress?", { presence: "apart" }), null);
  assert.equal(visualEventOpportunity("Imagine arriving at the castle someday.", { presence: "apart" }), null);
  assert.equal(visualEventOpportunity("Go try on the red dress.", { presence: "together" }), null);
  assert.equal(visualEventOpportunity("I finally opened the gift.", { presence: "apart" }), null);
  assert.equal(visualEventOpportunity("I changed into a red dress.", { presence: "apart" }), null);
  assert.equal(visualEventOpportunity("I opened my email.", { presence: "apart" }), null);
});
