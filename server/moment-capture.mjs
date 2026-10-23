import { buildImageSceneSnapshot } from "./image-scene-snapshot.mjs";
import { effectiveVisual } from "./visual-overrides.mjs";
import { imageFraming } from "./wardrobe.mjs";

const explicitFraming = /\b(?:full[- ]body|head[- ]to[- ]toe|whole body|close[- ]up|headshot|face focus|chest[- ]up|bust portrait|three[- ]quarter|knee[- ]up|medium[- ]wide|wide shot|medium shot|waist[- ]up|upper[- ]body|torso shot|half[- ]body)\b/i;
const movement = /\b(?:walking|running|dancing|swimming|stretching|exercising|jumping|climbing)\b/i;
const intimateExpression = /\b(?:kissing|kiss|whispering|laughing|crying|weeping)\b/i;
const handActivity = /\b(?:holding|carrying|pouring|drinking|eating|cooking|reading|playing|writing|painting)\b/i;
const plannedActivity = /\b(?:tomorrow|later|planning|plans? to|going to|will|wants? to|might|would|could|not|never)\b/i;

export function snapshotComposition(thread = {}, brief = "") {
  const snapshot = buildImageSceneSnapshot(thread.scene, brief);
  const visual = effectiveVisual(thread.profile);
  const configuredFraming = [...visual.identity, ...visual.signature].join(", ");
  const explicit = explicitFraming.test(snapshot.brief) ? snapshot.brief
    : explicitFraming.test(configuredFraming) ? configuredFraming : "";
  const scene = snapshot.scene;
  const activity = plannedActivity.test(scene.activity) ? "" : scene.activity;
  const faceMoment = intimateExpression.test(activity) || intimateExpression.test(scene.expression || "");
  let framing = "medium";
  let instruction = "medium shot, entire head and face visible, headroom above the hair";
  if (scene.posture === "lying") {
    framing = "full";
    instruction = "full-body shot, entire head and reclining body visible, supporting surface visible beneath the body";
  } else if (["seated", "kneeling", "crouching"].includes(scene.posture)) {
    framing = "three-quarter";
    instruction = "three-quarter shot, entire head, torso and bent legs visible";
  } else if (movement.test(activity)) {
    framing = "full";
    instruction = "full-body shot, entire head and feet visible, space around the limbs";
  } else if (/\b(?:getting dressed|changing (?:clothes|outfits?))\b/i.test(activity)) {
    framing = "three-quarter";
    instruction = "three-quarter shot, entire head and clothing silhouette visible";
  } else if (faceMoment && !handActivity.test(activity)) {
    framing = "close";
    instruction = "chest-up close-up, entire face and hair visible, headroom above the hair";
  }
  const actionDirection = /\bshowering\b/i.test(activity)
    ? "falling shower water visible"
    : handActivity.test(activity)
    ? "hands visible and unobscured"
    : "";
  const gazeContext = `${snapshot.brief} ${configuredFraming} ${scene.expression || ""} ${activity}`;
  const directedGaze = /\b(?:looking|gazing|glancing|staring|facing|turned|turning)\s+(?:at|toward|to|away|down|up|into|over|aside)|\b(?:profile view|side view|eyes? (?:closed|shut)|closed eyes|sleeping|asleep)\b/i.test(gazeContext);
  const occupied = /\b(?:reading|writing|cooking|painting|driving|running|swimming|sleeping)\b/i.test(activity);
  const interacting = /\b(?:talking|chatting|conversing|teasing|flirting|smiling|laughing|whispering|showering)\b/i.test(activity)
    || /\b(?:smile|smiling|playful|mischievous|affectionate)\b/i.test(scene.expression || "");
  const gaze = scene.presence === "together" && interacting && !occupied && !directedGaze ? "looking at the viewer" : "";
  return { framing: explicit ? imageFraming(explicit) : framing, explicit: Boolean(explicit),
    instruction: explicit ? "" : instruction,
    actionDirection: [explicit ? "" : actionDirection, gaze].filter(Boolean).join("; ") };
}

export function prepareSnapshotBrief(thread, brief = "") {
  const composition = snapshotComposition(thread, brief);
  return [brief, composition.instruction, composition.actionDirection].filter(Boolean).join("; ");
}

export function capturedMomentBrief(thread = {}) {
  // Scene, wardrobe, expression, and lighting are assembled once by the
  // central image prompt builder. This brief only establishes composition.
  const composition = snapshotComposition(thread);
  return [
    "A cinematic candid anime illustration",
    composition.instruction,
    composition.actionDirection,
  ].filter(Boolean).join("; ");
}
