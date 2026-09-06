import assert from "node:assert/strict";
import test from "node:test";
import { capturedMomentBrief } from "../server/moment-capture.mjs";

test("captured moment briefs describe composition without duplicating the persistent scene", () => {
  const brief = capturedMomentBrief({
    character: { name: "Misty (Pokemon)" },
    scene: {
      activity: "relaxing beside the pool",
      location: "Cerulean Gym",
      environment: "bright tiled pool deck, rippling blue water, tall windows",
      outfit: "red swimsuit",
      expression: "playful smile",
      lighting: "bright indoor light",
    },
  });

  assert.equal(brief, "A candid third-person image.");
  assert.doesNotMatch(brief, /relaxing beside the pool|rippling blue water|red swimsuit|natural observer viewpoint/);
  assert.doesNotMatch(brief, /selfie|camera/i);
});
