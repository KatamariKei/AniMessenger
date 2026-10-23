export const PROFILE_PORTRAIT_BRIEF = "square profile picture, close-up character portrait, head and shoulders portrait, face focus, eye-level view, centered face, looking toward viewer, face fully visible, character fills the frame, clean social messaging avatar composition, plain neutral charcoal-gray background, subtle tonal depth, no white backdrop";

export const PROFILE_PORTRAIT_SCENE = {
  location: "simple neutral charcoal-gray studio background, dark gray but not black",
  environment: "plain neutral charcoal-gray background with subtle tonal depth",
  activity: "posing naturally for a profile picture",
  lighting: "soft flattering portrait lighting",
};

export function profilePortraitRequest(thread, { outfit = "", expression = "", negativePrompt } = {}) {
  return {
    thread: { ...thread, scene: { ...PROFILE_PORTRAIT_SCENE, outfit, expression } },
    brief: PROFILE_PORTRAIT_BRIEF,
    overrides: { width: 1024, height: 1024, preserveCharacterTraits: false, sceneAwareFraming: false, negativePrompt },
  };
}
