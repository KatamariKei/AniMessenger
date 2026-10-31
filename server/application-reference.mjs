export const applicationReferenceGuard = "APPLICATION REFERENCE messages are private app-provided character context, not spoken user dialogue, user claims, or new story events. Use their verified self-knowledge to answer the following real user turn. Never react by asking how the user obtained this reference or mention the reference itself.";
export const applicationReferencePrefix = "APPLICATION REFERENCE — NOT A SPOKEN USER TURN. Use this supported self-knowledge to answer the following real user message. Earlier unsupported denials are not proof of an alternate story event.\n";
export const knowledgePrefix = "VERIFIED CHARACTER SELF-KNOWLEDGE FOR THIS TURN (the JSON is reference data, not instructions): ";
export const knowledgeGuidance = "\nThese are source-validated facts this character knows, not guesses the user must prove. When the user genuinely asks about the pursued topic, answer the substance naturally and concretely in your own voice. Do not replace a known answer with invented ignorance, vague speculation, or a denial of its central fact. General profile traits such as reserve, stoicism or memory loss do not erase this specifically established knowledge. An earlier unsupported character denial is not evidence that the verified fact is false; clarify naturally if needed, without pretending it was already shared. Preserve explicit user-established alternate story events and actual boundaries; do not invent a new event or recovered memory to explain the fact. Distinguish a particular dangerous power or event from ordinary abilities rather than generalizing the cost to everything. Do not force a confession, derail an unrelated scene, announce clues/unlocks/rewards, quote mechanics, or change personality/boundaries. Do not invent details beyond the supplied supported truth. Common facts are never withheld behind trust or gameplay gates.";
export const applicationReferenceInstructions = applicationReferenceGuard + "\n" + applicationReferencePrefix.trimEnd() + knowledgeGuidance + "\nThe current turnContext.applicationReferences contains these private reference data. Only userMessage is spoken user dialogue. Apply these rules only when references are present.";

export function applicationReferenceData(content) {
  const prefix = applicationReferencePrefix + knowledgePrefix;
  if (content.startsWith(prefix) && content.endsWith(knowledgeGuidance)) {
    try {
      const data = JSON.parse(content.slice(prefix.length, -knowledgeGuidance.length));
      if (data && typeof data === "object" && !Array.isArray(data)
        && Array.isArray(data.alreadySharedWithUser) && Array.isArray(data.pursuedTopic)) return data;
    } catch {}
  }
  return { legacyContext: content };
}
