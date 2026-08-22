const photoNoun = /\b(?:photos?|pictures?|pics?|self(?:ie|ies)|snapshots?|images?|shots?|captures?)\b/i;
const photoAction = /\b(?:send|show|share|take|see|resend|upload|post)\w*\b/i;
const followUpRequest = /(?:\blet'?s see\b|\bshow me\b|\bsend it\b|\bresend\b|\btry again\b|\bone more\b|\bagain(?:,|\s)+(?:please|pls|plz|pe+z)\b|\bwanna see\b|\bwant to see\b|\bsee your face\b)/i;
const recentPhotoContext = /(?:\b(?:photos?|pictures?|pics?|self(?:ie|ies)|snapshots?|images?|shots?|captures?|uploads?|cameras?)\b|\bsend(?:ing)? it\b|\bsee (?:my|your) face\b)/i;
const abstractSeeRequest = /\b(?:let me|let's|want to|wanna|can i|could i) see\s+(?:if|whether|what happens|how (?:it|that|this) (?:goes|works|turns out)|what you mean|where|why|when)\b/i;
const bareVisualRequest = /^\s*(?:(?:okay|ok|well|then|now|please)[,!.?]*\s+)*(?:let me see|show me|let me (?:get|have) (?:a )?(?:better|closer|proper|good) look|can i (?:get|have) (?:a )?(?:better|closer|proper|good) look)[.!?]*\s*$/i;
const visualTarget = "(?:you|it|that|this|them|your\\b|the\\b|what you(?:'re| are) wearing|what (?:it|that|this) looks? like)";
const targetedVisualRequest = new RegExp("\\b(?:let me|i (?:want|would like) to|i wanna|can i|could i)\\s+(?:see|get (?:a )?(?:better|closer|proper|good) look at)\\s+" + visualTarget + "\\b", "i");
const targetedShowRequest = new RegExp("\\bshow me\\s+" + visualTarget + "\\b", "i");

export function isExplicitPhotoRequest(text, recentMessages = []) {
  const value = String(text || "");
  if (photoNoun.test(value) && photoAction.test(value)) return true;
  if (abstractSeeRequest.test(value)) return false;
  if (bareVisualRequest.test(value) || targetedVisualRequest.test(value) || targetedShowRequest.test(value)) return true;
  if (!followUpRequest.test(value)) return false;
  return recentMessages.slice(-8).some((message) => message.image || recentPhotoContext.test(String(message.text || "")));
}
