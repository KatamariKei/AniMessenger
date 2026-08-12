const photoNoun = /\b(?:photos?|pictures?|pics?|self(?:ie|ies)|snapshots?|images?|shots?|captures?)\b/i;
const photoAction = /\b(?:send|show|share|take|see|resend|upload|post)\w*\b/i;
const followUpRequest = /(?:\blet'?s see\b|\bshow me\b|\bsend it\b|\bresend\b|\btry again\b|\bone more\b|\bagain(?:,|\s)+(?:please|pls|plz|pe+z)\b|\bwanna see\b|\bwant to see\b|\bsee your face\b)/i;
const recentPhotoContext = /(?:\b(?:photos?|pictures?|pics?|self(?:ie|ies)|snapshots?|images?|shots?|captures?|uploads?|cameras?)\b|\bsend(?:ing)? it\b|\bsee (?:my|your) face\b)/i;

export function isExplicitPhotoRequest(text, recentMessages = []) {
  const value = String(text || "");
  if (photoNoun.test(value) && photoAction.test(value)) return true;
  if (!followUpRequest.test(value)) return false;
  return recentMessages.slice(-8).some((message) => message.image || recentPhotoContext.test(String(message.text || "")));
}
