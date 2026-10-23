export const discoveryClueInstructions = "CLUE STYLE CONTRACT: clue is a short third-person observation, not dialogue for the user to say. Write one natural sentence, normally 8-28 words, pointing to one concrete topic the user can explore without revealing the answer. Use the character's name, third-person pronouns, or a neutral subject. Never address the user as you/your, speak as I/we, ask a question, give an instruction, or predict model behavior ('she might mention', 'he will reveal'). Avoid vague mysteries, melodrama, and claims beyond the supported truth. Keep directQuestion and paths separate: those may suggest conversational questions, but clue must not. Example clue: 'An old keepsake carries more meaning for this character than its appearance suggests.'";

export function isDiscoveryClue(value) {
  if (typeof value !== "string") return false;
  const clue = value.trim();
  return clue.length >= 12 && clue.length <= 200 && !/[?\n\r]/.test(clue)
    && !/\b(?:i|i['’]m|i['’]ve|me|my|mine|we|our|ours|you|you['’]ve|your|yours)\b/i.test(clue)
    && !/^(?:ask|try|talk|discuss|bring up|find out|explore|consider)\b/i.test(clue)
    && !/\b(?:might|may|could|will|would)\s+(?:mention|reveal|share|tell|discuss|confess)\b/i.test(clue)
    && !/\b(?:unlock|discovery trigger|background review|relationship points)\b/i.test(clue);
}

export function safeClueUpdates(definitions, updates) {
  const byId = new Map(definitions.map(item => [item.id, item]));
  const seen = new Set();
  return (Array.isArray(updates) ? updates : []).filter(item => {
    const definition = byId.get(item?.id);
    if (!definition || seen.has(item.id) || !isDiscoveryClue(item.clue)
      || item.clue.toLowerCase().includes(definition.truth.toLowerCase())) return false;
    seen.add(item.id);
    return true;
  }).map(item => ({ id: item.id, clue: item.clue.trim() }));
}
