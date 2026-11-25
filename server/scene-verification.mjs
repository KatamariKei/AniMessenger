export const sceneStateFields = ["location", "environment", "activity", "outfit", "expression", "lighting", "presence", "posture"];
export const optionalSceneFields = ["environment", "activity", "expression", "lighting"];

export function pendingSceneFields(scene = {}) {
  return sceneStateFields.filter(field => scene.verification?.pending?.includes(field));
}

export function sceneVerificationContext(scene = {}) {
  const fields = pendingSceneFields(scene);
  const uncertain = fields.length ? ` UNCERTAIN SCENE FIELDS: ${fields.join(", ")}. These saved values may be stale after an unverified update. Resolve the latest visible state with exact current evidence; do not restore an older room or pose just because it is saved here.` : "";
  const omitted = optionalSceneFields.filter(field => scene.verification?.omitted?.includes(field));
  return uncertain + (omitted.length ? ` UNSPECIFIED SCENE DETAILS: ${omitted.join(", ")}. These details are omitted from artwork; establish them only when visible scene evidence supports them.` : "");
}

// A rejected proposal is not evidence that the old value is still current.
// Retain uncertainty across turns until that particular field is verified.
export function withSceneVerification(previous, scene, decisions = []) {
  const pending = new Set(pendingSceneFields(previous));
  const omitted = new Set(previous.verification?.omitted?.filter(field => optionalSceneFields.includes(field)) || []);
  for (const decision of decisions) {
    if (!sceneStateFields.includes(decision.field) || decision.scope === "user") continue;
    if (decision.status === "accepted") { pending.delete(decision.field); omitted.delete(decision.field); }
    else if (!["user_state_not_character_state", "user_move_not_character_staging", "invalid_presence", "invalid_posture", "conditional_outfit"].includes(decision.reason)) pending.add(decision.field);
  }
  return { ...scene, verification: { version: 1, status: pending.size ? "needs_review" : "verified", pending: sceneStateFields.filter(field => pending.has(field)), ...(omitted.size ? { omitted: [...omitted] } : {}) } };
}
