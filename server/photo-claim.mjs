const photoNoun = /\b(?:photo|photograph|picture|pic|selfie|image|snapshot)\b/i;
const transferVerb = /\b(?:send|sends|sending|sent|share|shares|sharing|shared|attach|attaches|attaching|attached|text|texts|texting|texted)\b/i;
const directPresentation = /\b(?:here(?:'s| is)|check (?:this|it|your phone)|look at this)\b/i;
const deniedTransfer = /\b(?:did(?:n't| not)|do(?:n't| not)|have(?:n't| not)|was(?:n't| not)|won(?:'t| not)|can(?:'t| not)|could(?:n't| not)|not)\b.{0,28}\b(?:send|share|attach|text)\b/i;
const deferredTransfer = /\b(?:maybe|might|could|would|if|later|someday|eventually|yesterday|last night|earlier|already)\b.{0,55}\b(?:send|share|attach|text|photo|picture|pic|selfie|image)\b/i;
const historicalTransfer = /\b(?:yesterday|last night|earlier|previously|already)\b/i;

function candidateSegments(value) {
  return String(value || "")
    .replace(/[’]/g, "'")
    .match(/\[[^\]]+\]|[^.!?]+[.!?]?/g) || [];
}

export function claimsCurrentPhotoTransfer(value) {
  return candidateSegments(value).some((segment) => {
    if (!photoNoun.test(segment) || deniedTransfer.test(segment) || deferredTransfer.test(segment) || historicalTransfer.test(segment)) return false;
    return transferVerb.test(segment) || directPresentation.test(segment);
  });
}

export function removeCurrentPhotoClaim(value) {
  const withoutClaimedActions = String(value || "").replace(/\[[^\]]+\]/g, (segment) => claimsCurrentPhotoTransfer(segment) ? " " : segment);
  const kept = candidateSegments(withoutClaimedActions)
    .filter((segment) => !claimsCurrentPhotoTransfer(segment))
    .join(" ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return kept || "I wanted to show you, but the picture didn't go through.";
}

export function pendingOutfitReveal(reply = "") {
  const value = String(reply).replace(/[’]/g, "'");
  const preparation = /\b(?:give me (?:a |an |some |a few )?(?:moment|minute|second)s? to change|(?:getting ready|going|about|need|want) to (?:change|get dressed|try on)|(?:i'll|i will|let me) (?:go )?(?:change|get dressed)|(?:goes|heads|leaves|steps|slips)\b[^.!?\]]{0,60}\bto change)\b/ig;
  const matches = [...value.matchAll(preparation)];
  if (!matches.length) return false;
  const after = value.slice(matches.at(-1).index + matches.at(-1)[0].length);
  // A single reply may include both preparation and the completed reveal.
  return !/\b(?:now (?:wearing|dressed)|(?:comes?|came|steps?|stepped|returns?|returned) (?:back |out )?(?:from|wearing|in|into)|changed into|finished (?:changing|dressing)|here(?:'s| is) my (?:new )?outfit)\b/i.test(after);
}

export function shouldQueueCharacterPhoto({ hasUserImage = false, explicitRequest = false, modelRequested = false, visualEvent = null, reply = "" } = {}) {
  const claimedTransfer = claimsCurrentPhotoTransfer(reply);
  if (!claimedTransfer && pendingOutfitReveal(reply)) return false;
  return claimedTransfer || (!hasUserImage && Boolean(explicitRequest || modelRequested || visualEvent));
}
