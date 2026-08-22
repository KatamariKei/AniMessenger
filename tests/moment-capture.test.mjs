import assert from "node:assert/strict";
import test from "node:test";
import { capturedMomentBrief } from "../server/moment-capture.mjs";

test("captured moment prompts use the current scene without implying a selfie or visible camera", () => {
  const brief = capturedMomentBrief({
    character: { name: "Misty (Pokemon)" },
    scene: {
      activity: "relaxing beside the pool",
      location: "Cerulean Gym",
      outfit: "red swimsuit",
      expression: "playful smile",
      lighting: "bright indoor light",
    },
  });

  assert.match(brief, /Misty \(Pokemon\) clearly visible in frame/);
  assert.match(brief, /relaxing beside the pool/);
  assert.match(brief, /wearing red swimsuit/);
  assert.match(brief, /natural observer viewpoint/);
  assert.doesNotMatch(brief, /selfie|camera/i);
});
