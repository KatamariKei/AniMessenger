import { CHARACTER_PHOTO_NEGATIVE, mergePromptTags, normalizeCharacterPhotoBrief } from "./identity.mjs";
import { effectiveVisual } from "./visual-overrides.mjs";
import { normalizeWardrobePrompt } from "./wardrobe.mjs";

export function findRetryableImageMessage(thread, messageId) {
  const message = thread?.messages?.find((candidate) => candidate.id === messageId);
  if (!message || message.from !== "character" || !message.generated || !message.image) {
    throw new Error("That generated image is no longer available to retry.");
  }
  return message;
}

function removeSavedGlobal(prompt, savedGlobal) {
  const value = String(prompt || "").trim();
  const prefix = String(savedGlobal || "").trim();
  if (!prefix || !value.toLowerCase().startsWith(prefix.toLowerCase())) return value;
  return value.slice(prefix.length).replace(/^\s*[,;]\s*/, "").trim();
}

function prependLatestGlobal(latestGlobal, preservedPrompt, separator = "\n\n") {
  const latest = String(latestGlobal || "").trim();
  const preserved = String(preservedPrompt || "").trim();
  if (!latest) return preserved;
  if (preserved.toLowerCase().startsWith(latest.toLowerCase())) return preserved;
  return [latest, preserved].filter(Boolean).join(separator);
}

function refreshVisualPrompt(prompt, savedVisual = [], currentVisual = []) {
  const saved = new Set(savedVisual.map((item) => String(item).trim().toLowerCase()).filter(Boolean));
  const sections = String(prompt || "").split(/\n\s*\n/).map((section) => section.split(",").map((item) => item.trim()).filter(Boolean));
  if (!sections.length) sections.push([]);
  const preservedSections = sections.map((parts) => parts.filter((item) => !saved.has(item.toLowerCase())));
  const present = new Set(preservedSections.flat().map((item) => item.toLowerCase()));
  for (const item of currentVisual) {
    const clean = String(item || "").trim();
    if (clean && !present.has(clean.toLowerCase())) {
      preservedSections[0].push(clean);
      present.add(clean.toLowerCase());
    }
  }
  return preservedSections.map((parts) => parts.join(", ")).filter(Boolean).join("\n\n");
}

function wardrobeParts(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function promptContainsWardrobe(prompt, wardrobe) {
  const saved = wardrobeParts(wardrobe).map((item) => item.toLowerCase());
  if (!saved.length) return false;
  const present = new Set(
    String(prompt || "")
      .split(/\n\s*\n/)
      .flatMap((section) => section.split(","))
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
  const matches = saved.filter((item) => present.has(item)).length;
  return saved.length <= 2 ? matches === saved.length : matches >= 2;
}

function inferRecordedSceneOutfit(prompt, savedVisual = []) {
  const parts = String(prompt || "")
    .split(/\n\s*\n/)[0]
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) || [];
  const saved = new Set(savedVisual.map((item) => String(item).trim().toLowerCase()).filter(Boolean));
  if (!saved.size) return "";
  let lastVisualIndex = -1;
  for (let index = 0; index < parts.length; index += 1) {
    if (saved.has(parts[index].toLowerCase())) lastVisualIndex = index;
  }
  return lastVisualIndex >= 0 ? String(parts[lastVisualIndex + 1] || "").trim() : "";
}

export function retryPromptOverrides(message, character, config = {}, profile, currentOutfit) {
  const savedPositive = String(message?.generation?.positive || "").trim();
  const savedNegative = String(message?.generation?.negative || "").trim();
  if (!savedPositive) return {};
  const visual = effectiveVisual(profile);
  const currentIdentity = [...visual.identity, ...visual.signature];
  const savedScene = String(message?.generation?.scenePrompt || "").trim();
  const recordedSceneOutfit = String(message?.generation?.sceneOutfit || "").trim()
    || inferRecordedSceneOutfit(savedScene, message?.generation?.visualIdentity);
  let preservedPositive = refreshVisualPrompt(
    savedScene || removeSavedGlobal(savedPositive, message?.generation?.globalPositive),
    message?.generation?.visualIdentity,
    currentIdentity,
  );
  const hasRecordedWardrobe = Object.prototype.hasOwnProperty.call(message?.generation || {}, "visualDefaultWardrobe");
  const researchedDefault = String(profile?.visual?.defaultWardrobe || "").trim();
  const correctedDefault = String(profile?.visual?.userOverrides?.defaultWardrobe || "").trim();
  const savedDefaultWardrobe = hasRecordedWardrobe
    ? String(message.generation.visualDefaultWardrobe || "").trim()
    : correctedDefault && correctedDefault !== researchedDefault && promptContainsWardrobe(preservedPositive, researchedDefault)
      ? researchedDefault
      : "";
  const requestedCurrentOutfit = normalizeWardrobePrompt(currentOutfit);
  const wardrobeToReplace = requestedCurrentOutfit
    ? (recordedSceneOutfit || savedDefaultWardrobe)
    : savedDefaultWardrobe;
  const replacementWardrobe = requestedCurrentOutfit || visual.defaultWardrobe;
  if (wardrobeToReplace || requestedCurrentOutfit) {
    preservedPositive = refreshVisualPrompt(
      preservedPositive,
      wardrobeParts(wardrobeToReplace),
      wardrobeParts(replacementWardrobe),
    );
  }
  const preservedNegative = refreshVisualPrompt(
    removeSavedGlobal(savedNegative, message?.generation?.globalNegative),
    message?.generation?.visualExceptions,
    visual.exceptions,
  );
  return {
    positivePrompt: prependLatestGlobal(config.globalPositivePrompt, normalizeCharacterPhotoBrief(preservedPositive, character, { userName: config.userName, reduceCharacterNames: false })),
    negativePrompt: mergePromptTags(config.globalNegativePrompt, preservedNegative, CHARACTER_PHOTO_NEGATIVE),
  };
}

export function replaceRetriedImage(thread, messageId, imageUrl, generation) {
  findRetryableImageMessage(thread, messageId);
  return {
    ...thread,
    messages: thread.messages.map((message) => message.id === messageId
      ? { ...message, image: imageUrl, generation }
      : message),
  };
}
