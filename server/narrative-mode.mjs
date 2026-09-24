import { characterFidelityInstruction } from "./character-fidelity.mjs";

export function normalizeConversationMode(value) {
  return value === "story" ? "story" : "chat";
}

export function storyDialogueRequired(value, presence = "together") {
  const text = String(value || "").trim();
  if (!text) return false;
  // When the characters are apart, AniMessenger is carrying a remote message.
  // The narrative may dramatize the character receiving and composing it, but
  // the actual text they send is still the essential visible response.
  return presence === "apart"
    || /\?/.test(text)
    || /\b(?:answer|reply|respond|say|speak|tell me|explain|describe|let me hear|what do you think)\b/i.test(text);
}

export function storyPassageHasDialogue(value) {
  return /[“"][^”"\n]{2,}[”"]/.test(String(value || ""));
}

export function storyPassageHasDanglingSpeechCue(value) {
  const passage = String(value || "").trim();
  if (!passage || storyPassageHasDialogue(passage)) return false;
  const lastSentence = passage.split(/(?<=[.!?])\s+/).at(-1) || passage;
  if (/\bwithout\s+(?:speaking|saying|answering|replying)\b/i.test(lastSentence)) return false;
  return /\b(?:says?|speaks?|begins to speak|replies?|responds?|answers?|asks?|whispers?|murmurs?|adds?|continues),?\s*(?:over|above|into|as|and|$)|\b(?:voice|tone)\b[^.!?]{0,90}\b(?:as she speaks|as he speaks|as they speak|before (?:speaking|answering|replying))\b/i.test(lastSentence);
}

export function ensureNarrativeParagraphs(value) {
  const text = String(value || "").trim();
  if (!text || /\n\s*\n/.test(text) || text.length < 240) return text;
  const sentences = text.match(/[^.!?]+(?:[.!?]+["”']?|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
  if (sentences.length < 3) return text;
  const paragraphs = [];
  let current = [];
  let currentWords = 0;
  const flush = () => {
    if (!current.length) return;
    paragraphs.push(current.join(" "));
    current = [];
    currentWords = 0;
  };
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).length;
    if (words <= 7) {
      flush();
      paragraphs.push(sentence);
      continue;
    }
    current.push(sentence);
    currentWords += words;
    if (current.length >= 2 || currentWords >= 46) flush();
  }
  flush();
  return paragraphs.length > 1 ? paragraphs.join("\n\n") : text;
}

export function normalizeNarration(value, mode) {
  if (normalizeConversationMode(mode) !== "story") return null;
  const narration = String(value || "")
    .replace(/^\*+|\*+$/g, "")
    .replace(/^\s*(?:narration|narrator)\s*:\s*/i, "")
    .replace(/\[action:\s*([^\]]+)\]/gi, "$1")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\s*\n\s*/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Generation already has a token budget. Never apply a raw character slice
  // here: it can turn valid prose into a visibly cropped sentence.
  return narration ? ensureNarrativeParagraphs(narration) : null;
}

export function narrativeModeInstructions(mode, presence = "apart", userText = "") {
  if (normalizeConversationMode(mode) !== "story") {
    return [
      "CHAT MODE: Set narration to null. Keep visible action inside the character reply only as the single optional [action: ...] beat allowed by the current-presence rules.",
    ];
  }
  return [
    "STORY MODE: Turn the latest user contribution and the character's response into one self-contained third-person prose passage in narration. This is immersive fiction, not a chat reply with commentary around it.",
    characterFidelityInstruction,
    "Let tension, loss, ambiguity, and consequences remain unresolved when the scene calls for it. Do not append a hopeful lesson or comforting resolution by default. Preserve the user's agency and distinguish the character's beliefs from narrator assertions.",
    "Narration must be the complete visible response. Reprise or naturally adapt the user's explicitly supplied words or actions inside the passage, then flow into the character's response before, during, and after that moment. The separate visible user message remains in the timeline, but its contribution must still become part of the prose rather than merely receiving an answer. End on a natural opening that invites the user's next choice without directly asking a generic question.",
    "Usually write roughly 70-160 words, varying naturally with the moment. A small exchange may be shorter; an arrival, reveal, emotional turn, or action sequence may breathe longer.",
    "Embed any character dialogue naturally inside narration with quotation marks. Dialogue is optional: expression, movement, silence, or a physical response may carry the moment when words would weaken it.",
    "Give the prose deliberate cadence. Mix short, medium, and long sentences instead of producing one evenly paced paragraph. Vary sentence openings and syntax. Let an occasional very short sentence stand alone when the moment earns emphasis, but do not turn that device into a formula.",
    "Use two to four short paragraphs when focus, time, action, or emotional weight shifts. Paragraph breaks should shape the beat: observation, turn, response, and a resonant handoff—not arbitrarily split equal blocks.",
    "Use concrete sensory detail, spatial continuity, pacing, body language, atmosphere, and the character's emotions or thoughts when appropriate. Prefer a few precise details over exhaustive description. Stay in the established scene and avoid purple prose, summaries, screenplay language, or repetitive stage directions.",
    "Narration is the only response field in Story mode. Put every action, emotion, thought, and spoken line into that one flowing passage. There is no separate reply field where dialogue can go. Never announce that the character speaks, answers, replies, whispers, or lowers their voice and then end before writing what they actually say.",
    storyDialogueRequired(userText, presence)
      ? "VERBAL RESPONSE REQUIRED THIS TURN: The user asked a question or explicitly requested words. The character must give a natural, quoted spoken answer inside the prose. Action, expression, or silence alone is not a sufficient response."
      : "Dialogue may be omitted only when a nonverbal response is genuinely more natural and the user did not ask for words or an answer.",
    "You may faithfully adapt dialogue and actions the user explicitly supplied, preserving their meaning. Never invent additional user dialogue, choices, facial expression, gaze, thoughts, feelings, bodily reactions, consent, or success.",
    presence === "together"
      ? "The character and user share a physical scene. The passage may describe the character acting around the user and the environment responding, while leaving the user's next move genuinely open."
      : "The character and user are physically apart. Keep the prose on the character's side of the connection and do not place or physically direct the user. This is a remote exchange: include the complete message the character sends back as quoted dialogue naturally inside the passage. Never merely say that they type, reply, hit Send, delay replying, or react to the screen without showing the actual words delivered to the user.",
    "Do not use asterisks, [action: ...] tags, bullet points, screenplay labels, headings, or a 'Narrator:' prefix in narration.",
  ];
}

export function narrativeTurnText(result = {}) {
  return String(result.narration || result.reply || "").trim();
}

export function storyTurnHasUsablePassage(result = {}) {
  const passage = narrativeTurnText(result);
  return Boolean(passage) && !/^(?:\.{1,}|…+)$/u.test(passage);
}

export function storyTurnMeetsRequirements(result = {}, dialogueRequired = false, requiredMinimumWords = 0) {
  const passage = narrativeTurnText(result);
  const minimumWords = Math.max(0, Number(requiredMinimumWords) || 0);
  const wordCount = passage.trim().split(/\s+/).filter(Boolean).length;
  return storyTurnHasUsablePassage(result)
    && !storyPassageHasDanglingSpeechCue(passage)
    && (!dialogueRequired || storyPassageHasDialogue(passage))
    && (!minimumWords || storyPassageHasDialogue(passage) || wordCount >= minimumWords);
}

export function storyMinimumWords(userText = "", dialogueRequired = false) {
  if (dialogueRequired) return 0;
  const spokenContribution = String(userText || "")
    .replace(/\[(?:action|thought)\s*:[^\]]*\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return spokenContribution ? 60 : 0;
}

function actionToNarration(action, characterName) {
  const clean = String(action || "").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  if (!clean) return "";
  const name = String(characterName || "The character").replace(/\s+/g, " ").trim();
  if (/^(?:she|he|they)\b/i.test(clean)) return clean.replace(/^(?:she|he|they)\b/i, name) + ".";
  if (/^(?:her|his|their)\b/i.test(clean)) return clean.replace(/^(?:her|his|their)\b/i, name + "'s") + ".";
  if (clean.toLowerCase().startsWith(name.toLowerCase())) return clean + ".";
  return name + " " + clean.charAt(0).toLowerCase() + clean.slice(1) + ".";
}

export function normalizeStoryTurn({ reply, narration, mode, characterName } = {}) {
  const conversationMode = normalizeConversationMode(mode);
  const originalReply = String(reply || "").trim();
  if (conversationMode !== "story") return { reply: originalReply, narration: null };
  const actions = [...originalReply.matchAll(/\[action:\s*([^\]]+)\]/gi)]
    .map((match) => actionToNarration(match[1], characterName))
    .filter(Boolean);
  const cleanReply = originalReply
    .replace(/\[action:\s*[^\]]+\]/gi, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedNarration = normalizeNarration([narration, ...actions].filter(Boolean).join(" "), conversationMode)
    || normalizeNarration(cleanReply || originalReply, conversationMode);
  return {
    reply: cleanReply,
    narration: normalizedNarration,
  };
}
