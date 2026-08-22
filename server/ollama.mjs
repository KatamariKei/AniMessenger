import { splitVisualTags } from "./identity.mjs";
import { CHARACTER_PROFILE_VERSION, profilePerformanceGuide, profileQualityIssues, rotatingPerformanceExamples } from "./profile-quality.mjs";
import { relationshipGuidance, relationshipStage } from "./relationship.mjs";
import { isCannedConditionalIntimacy, recentStyleCooldown, repeatsRecentStyle } from "./style-control.mjs";
import { userLocalTimeContext } from "./time-context.mjs";
import { selectRelevantMemories } from "./memory.mjs";
import { characterRangeDirection } from "./character-range.mjs";
import { currentPresence, presencePromptGuidance, presenceSceneCue } from "./presence.mjs";
import {
  characterChatSchema,
  characterProfileSchema,
  memoryExtractionSchema,
  proactiveOutreachSchema,
  profileGuideSchema,
  replyOnlySchema,
} from "./ollama-schemas.mjs";
import { normalizeProactiveState, normalizeProactiveTopicKey } from "./proactive.mjs";

function ollamaError(error, selectedModel = "") {
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch failed|ECONNREFUSED/i.test(message)) return new Error("Ollama is not reachable. Start Ollama and check its URL in settings.");
  if (/model[^]*?(?:not found|does not exist)|pull model/i.test(message)) {
    const model = selectedModel ? ` “${selectedModel}”` : "";
    return new Error(`The selected Ollama model${model} is not installed. Open Settings, choose an installed model, or install it in Ollama, then retry.`);
  }
  return error instanceof Error ? error : new Error(message);
}

export async function checkOllama(config) {
  try {
    const response = await fetch(config.ollamaUrl + "/api/version", { signal: AbortSignal.timeout(2500) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function listOllamaModels(config) {
  try {
    const response = await fetch(config.ollamaUrl + "/api/tags", { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.models || []).map((model) => model.name).filter(Boolean);
  } catch {
    return [];
  }
}

function parameterBillions(value) {
  const match = String(value || "").match(/([\d.]+)\s*B/i);
  return match ? Number(match[1]) : 0;
}

function modelScore(option, { vision = false } = {}) {
  const name = String(option?.name || "").toLowerCase();
  const capabilities = Array.isArray(option?.capabilities) ? option.capabilities : [];
  if (!name || /(?:embed|embedding|coder|codegemma|deepseek-coder)/i.test(name)) return -1000;
  if (vision && !capabilities.includes("vision")) return -1000;
  if (capabilities.length && !capabilities.includes("completion")) return -1000;

  const size = parameterBillions(option?.parameterSize) || parameterBillions(name);
  let score = size ? 100 - Math.abs(size - 12) * 2.2 : 40;
  if (size > 35) score -= 28;
  if (size > 0 && size < 4) score -= 35;
  if (/gemma4(?::|$)/i.test(name)) score += 65;
  if (/gemma4:12b/i.test(name)) score += 35;
  else if (/gemma4:26b(?:-a4b)?-it-qat/i.test(name)) score += 28;
  else if (/gemma3:12b/i.test(name)) score += 12;
  else if (/qwen3:14b/i.test(name)) score += 24;
  else if (/mistral-small3\.2:24b/i.test(name)) score += 18;
  if (vision && capabilities.includes("vision")) score += 15;
  return score;
}

export function recommendOllamaModels(options = []) {
  const ranked = [...options].sort((a, b) => modelScore(b) - modelScore(a));
  const recommendedChat = ranked.find((option) => modelScore(option) > -1000)?.name || options[0]?.name || "";
  const chatOption = options.find((option) => option.name === recommendedChat);
  const recommendedVision = chatOption?.capabilities?.includes("vision")
    ? recommendedChat
    : [...options].sort((a, b) => modelScore(b, { vision: true }) - modelScore(a, { vision: true }))
      .find((option) => modelScore(option, { vision: true }) > -1000)?.name || "";
  return { recommendedChat, recommendedVision };
}

export async function listOllamaModelOptions(config) {
  try {
    const response = await fetch(config.ollamaUrl + "/api/tags", { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { models: [], options: [], recommendedChat: "", recommendedVision: "" };
    const payload = await response.json();
    const tagged = (payload.models || []).filter((model) => model?.name);
    const options = await Promise.all(tagged.map(async (model) => {
      let shown = {};
      try {
        const detailResponse = await fetch(config.ollamaUrl + "/api/show", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: model.name }),
          signal: AbortSignal.timeout(5000),
        });
        if (detailResponse.ok) shown = await detailResponse.json();
      } catch {
        // A model remains selectable even when an older Ollama build cannot describe it.
      }
      return {
        name: model.name,
        family: shown.details?.family || model.details?.family || "",
        parameterSize: shown.details?.parameter_size || model.details?.parameter_size || "",
        quantization: shown.details?.quantization_level || model.details?.quantization_level || "",
        capabilities: Array.isArray(shown.capabilities) ? shown.capabilities : [],
      };
    }));
    return { models: options.map((option) => option.name), options, ...recommendOllamaModels(options) };
  } catch {
    return { models: [], options: [], recommendedChat: "", recommendedVision: "" };
  }
}

function extractJson(content) {
  const clean = String(content || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(clean.slice(start, end + 1));
      } catch {
        // Preserve the raw local response in memory for diagnostics without
        // exposing it in the user-facing error or writing chat content to disk.
      }
    }
    const error = new Error("The local model did not return a readable structured response.");
    error.rawResponse = clean;
    throw error;
  }
}

export function plainStructuredReplyFallback(error) {
  const raw = String(error?.rawResponse || "").trim();
  if (!raw || raw.length > 6000 || /[{}]/.test(raw)) return "";
  return raw.replace(/^```(?:text)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export function normalizeOllamaMessages(messages = []) {
  const systemMessages = messages.filter((message) => message?.role === "system");
  if (!systemMessages.length) return messages;

  const conversation = messages.filter((message) => message?.role !== "system");
  const content = systemMessages
    .map((message) => String(message.content || "").trim())
    .filter(Boolean)
    .join("\n\n");

  if (!content) return conversation;
  return [{ ...systemMessages[0], content }, ...conversation];
}

async function nativeChat(config, model, messages, options = {}) {
  const selectedModel = model || (await listOllamaModels(config))[0];
  if (!selectedModel) throw new Error("No Ollama model is installed. Install a model in Ollama, then choose it in AniMessenger Settings.");
  try {
    const response = await fetch(config.ollamaUrl + "/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: selectedModel,
        messages: normalizeOllamaMessages(messages),
        stream: false,
        format: options.jsonSchema || (options.json ? "json" : undefined),
        think: Boolean(config.ollamaThinking),
        options: {
          temperature: options.temperature ?? 0.72,
          num_predict: options.maxTokens ?? 4096,
          ...(options.topP ? { top_p: options.topP } : {}),
          ...(options.repeatPenalty ? { repeat_penalty: options.repeatPenalty } : {}),
        },
      }),
      signal: AbortSignal.timeout(options.timeout ?? 240000),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error("Ollama returned HTTP " + response.status + ": " + body.slice(0, 300));
    }
    const payload = await response.json();
    const content = payload.message?.content;
    if (!content) throw new Error("Ollama returned an empty response.");
    return content;
  } catch (error) {
    throw ollamaError(error, selectedModel);
  }
}

function strings(value, fallback = []) {
  const stringifyItem = (item) => {
    if (item === null || item === undefined) return "";
    if (typeof item !== "object") return String(item).trim();
    if (Array.isArray(item)) return item.map(stringifyItem).filter(Boolean).join(", ");
    return Object.entries(item)
      .map(([key, nested]) => {
        const text = stringifyItem(nested);
        return text ? key + ": " + text : "";
      })
      .filter(Boolean)
      .join("; ");
  };
  if (Array.isArray(value)) return value.map(stringifyItem).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => {
      const items = Array.isArray(item) ? item : [item];
      return items.map((nested) => {
        const text = stringifyItem(nested);
        return text ? String(key) + ": " + text : "";
      }).filter(Boolean);
    });
  }
  return fallback;
}

export function isRunawayAssistantHistory(text) {
  const value = String(text || "");
  const inventedFault = /(?:repeat(?:ed|ing)? (?:yourself|message|request)|duplicate (?:message|packet|input)|input buffer|buffer overflow|infinite loop|client (?:glitch|bug|corrupt)|ddos attack|packet duplication)/i.test(value);
  const escalation = /(?:!{2,}|\b[A-Z]{3,}\b|stop(?:,? stop){2,}|hard crash|error 404|pass out|psychological warfare)/.test(value);
  return inventedFault && escalation;
}

export function inventsUserBehavior(reply, userText, recentMessages = []) {
  const value = String(reply || "");
  const claimedCue = /\b(?:that look|give me (?:that|a) look|you(?:'re| are) (?:staring|glaring)|stop staring|don['’]t stare|your (?:face|expression|gaze|gesture)|you (?:flinched|blushed|looked away|rolled your eyes|shrugged|nodded|smirked))\b/i.test(value);
  const unsupportedInterpretation = /\b(?:is that your way of saying|don['’]t tell me you(?:(?:'re| are) (?:getting|being|suddenly|actually)|(?:'ve| have)\b)|you(?:'re| are) being awfully|you(?:'re| are)? (?:going|getting) (?:all )?quiet|you(?:'ve| have) gone silent)\b/i.test(value)
    || /(?:\byou\b[^.!?]{0,35}\b(?:quiet|silent|bored|boring|los(?:e|ing|t) interest)\b|\bdon['’]t\b[^.!?]{0,35}\bquiet\b)/i.test(value);
  if (unsupportedInterpretation) return true;
  if (!claimedCue) return false;
  const recentUserText = [
    ...(Array.isArray(recentMessages) ? recentMessages : [])
      .filter((message) => message?.from === "user" && typeof message.text === "string")
      .slice(-2)
      .map((message) => message.text),
    String(userText || ""),
  ].join(" ");
  const cueWasEstablished = /\b(?:look|stare|glar|gaze|watch|eye on|flinch|blush|look away|roll(?:ed)? my eyes|shrug|nod|smirk|expression|gesture)\b/i.test(recentUserText);
  return !cueWasEstablished;
}

export function briefReactionGuard(userText) {
  const value = String(userText || "").trim();
  const words = value.match(/[A-Za-z0-9']+/g) || [];
  if (words.length > 5 || !/^(?:h+m+|m+h+m+|ok(?:ay)?|ha(?:ha)*|yeah|yep|sure|right|oh|well|wow|nice|cool|got it)\b/i.test(value.replace(/^[^A-Za-z0-9]+/, ""))) return "";
  return "The latest user turn is a brief conversational reaction or acknowledgment. Treat it literally. Do not infer or claim a facial expression, gaze, silence, boredom, appetite change, offense, hidden motive, or change of feeling. Respond briefly to the established topic, or ask a neutral clarification if its meaning is unclear.";
}

export function directQuestionGuard(userText) {
  const value = String(userText || "").trim();
  const asksForReason = /\b(?:what makes you say (?:that|so)|what made you (?:say|think|feel)|why (?:would|do|did|are|is|were|was|have|has|can|could|should)\b|how come\b|what do you mean\b)/i.test(value);
  if (!asksForReason) return "";
  return "The latest user turn asks a direct follow-up question about a reason, meaning, or prior claim. Answer that question before changing subjects. Preserve what 'that,' 'it,' and other referents mean from the immediately preceding exchange. Give a concrete reason, admit uncertainty, correct the prior claim, or ask what specific part they mean; a generic acknowledgment such as 'you have a point' is not an answer.";
}

export function conversationMomentumGuard(userText) {
  const value = String(userText || "").trim();
  const relationshipOpening = /\b(?:our relationship|how (?:do you feel|are you feeling) about (?:us|me)|what (?:am i|are we) to you|where (?:is this|are we) going|do you (?:trust|love|care about) me)\b/i.test(value);
  if (relationshipOpening) {
    return "The user has opened a meaningful relationship conversation. Give a character-specific answer, then open exactly one natural door deeper: a concrete reason, revealing qualification, shared callback, hope, fear, unresolved tension, future possibility, or sincere reciprocal question. Do not stop at generic reassurance such as feeling happy, lucky, grateful, trusting the user, having a connection, calling every moment special, or saying 'it means a lot.' A generic 'How about you?' does not create depth; ask something specific or disclose something specific. Do not force a question if a specific disclosure or future intention creates better momentum.";
  }
  const planningOpening = /\b(?:what (?:would|do) you (?:like|want) to do|what should we do|what now|now what|any ideas|where should we go|what are you in the mood for)\b/i.test(value);
  if (planningOpening) {
    return "The user has handed the character some initiative. Make one concrete, character-appropriate choice, suggestion, or plan and add a useful detail that gives the user something to respond to. Do not retreat to 'whatever you want,' 'just stay here,' or another generic dead end unless the character supplies a specific reason or variation.";
  }
  const reflectiveOpening = /\b(?:tell me (?:about|more)|what do you think about|how are you feeling|what's been on your mind|what has been on your mind)\b/i.test(value);
  if (reflectiveOpening) {
    return "The user has invited reflection. Answer with at least one specific thought, reason, example, uncertainty, or implication that can support a deeper next turn. Character voice should shape the substance, not replace it.";
  }
  return "";
}

export function repeatsRecentReply(reply, recentMessages = []) {
  const normalized = String(reply || "").toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9']+/g, " ").trim();
  if (normalized.length < 12) return false;
  return (Array.isArray(recentMessages) ? recentMessages : [])
    .filter((message) => message?.from === "character" && typeof message.text === "string")
    .slice(-16)
    .some((message) => String(message.text).toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9']+/g, " ").trim() === normalized);
}

export function isGenericRelationshipAnswer(reply, userText) {
  if (!conversationMomentumGuard(userText).includes("meaningful relationship conversation")) return false;
  const value = String(reply || "");
  const genericSignals = [
    /\bfeel(?:ing)? (?:so |pretty )?(?:happy|great|lucky|grateful|good)\b/i,
    /\b(?:count on|trust) you\b/i,
    /\b(?:means|mean) a lot\b/i,
    /\b(?:special|amazing) (?:to me|journey|connection|relationship|moment)\b/i,
    /\bevery moment\b/i,
    /\bcan(?:not|'t) imagine (?:my )?life without you\b/i,
    /\bwe (?:just )?connect\b/i,
    /\bglad we found each other\b/i,
  ].filter((pattern) => pattern.test(value)).length;
  const specificDoor = /\b(?:because|when you|the way you|ever since|I remember|I worry|I hope|I want us|I want to|I'm afraid|I am afraid|what scares|what I haven't|what I have not|part of me|sometimes I|next time|someday|in the future)\b/i.test(value);
  return genericSignals >= 2 && !specificDoor;
}

export function evadesDirectQuestion(reply, userText) {
  if (!directQuestionGuard(userText)) return false;
  const value = String(reply || "")
    .trim()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ");
  return /^(?:you(?:'ve| have) got a point|you(?:'re| are) right|fair(?: enough)?|good question|that(?:'s| is) true|true|right|exactly|maybe|maybe so|could be|I guess|I suppose|sure|yeah|yep|okay|ok|h+m+)[.!?… ]*$/i.test(value);
}

export function groundedReplyFallback(reply, userText, recentMessages = []) {
  const briefGuard = briefReactionGuard(userText);
  const attributesStateToBriefReaction = Boolean(briefGuard) && /\b(?:quiet|silent|bored|boring|interest|appetite|something bothering you|what['’]s wrong)\b/i.test(String(reply || ""));
  if (!attributesStateToBriefReaction && !inventsUserBehavior(reply, userText, recentMessages)) return String(reply || "");
  return briefGuard ? "Hmm?" : "What do you mean?";
}

export function needsReplyRepair(reply, userText, recentMessages = []) {
  const value = String(reply || "");
  const words = value.trim().split(/\s+/).filter(Boolean).length;
  const allCaps = value.match(/\b[A-Z]{3,}\b/g)?.length || 0;
  const stutters = value.match(/\b[A-Za-z]-[A-Za-z]/g)?.length || 0;
  const technicalFlavor = value.match(/\b(?:cpu|buffer|packet|server|client|firewall|protocol|system|mode|status (?:effect|ailment)|debuff|buff|npc|quest|raid|boss|level|patch|recalibrat\w*|glitch\w*|process(?:es)?|overdrive|cooling fans?|error code)\b/gi)?.length || 0;
  const userIsDiscussingTech = /\b(?:code|coding|computer|cpu|buffer|packet|server|client|network|firewall|protocol|bug|software|hardware|game|gaming)\b/i.test(String(userText || ""));
  return words > 120
    || /!{2,}|\?{2,}|stop(?:,? stop){2,}/i.test(value)
    || allCaps >= 3
    || stutters >= 3
    || (!userIsDiscussingTech && technicalFlavor >= 3)
    || repeatsRecentStyle(value, recentMessages)
    || isCannedConditionalIntimacy(value)
    || inventsUserBehavior(value, userText, recentMessages)
    || evadesDirectQuestion(value, userText)
    || repeatsRecentReply(value, recentMessages)
    || isGenericRelationshipAnswer(value, userText)
    || isRunawayAssistantHistory(value);
}

async function repairCharacterReply(config, model, thread, userText, draft) {
  let candidate = draft;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const parsed = extractJson(await nativeChat(config, model, [
        {
          role: "system",
          content: [
            "You are AniMessenger's final dialogue editor.",
            "The draft failed a dialogue-quality check because it is too long, intense, repetitive, generic, weakly grounded, low-momentum for the moment, or overloaded with character gimmicks. Rewrite it; do not defend its style.",
            "Preserve its factual meaning, emotional boundary, and response to the user, but introduce no new event or claim.",
            "Use one or two compact sentences, usually no more than 50 words. A complete reply can be only a few words when that feels natural. Most sentences must be plain natural language.",
            "Keep no more than one total gaming or technical analogy. CPU, system, mode, error, patch, buffer, protocol, firewall, stats, boss, quest, and similar terms all count toward that same limit.",
            "Use at most one expressive tic total: either a brief stutter, all caps, repeated punctuation, or one emoticon—not a combination.",
            "At close or deeply close stages, favor secure familiarity and proportional reactions. Do not turn surprise or embarrassment into panic unless the latest user message genuinely warrants it.",
            "Use a genuinely different rhetorical structure from the recent replies. Do not merely swap in synonyms while preserving the same tease, reluctant concession, and warning sequence.",
            "Never use the stock conditional-intimacy construction 'Careful... you keep talking like that and I might actually...' or a synonym of it. Splitting it into two sentences is the same banned construction. State the underlying reaction directly, understate it, or change the conversational move entirely.",
            "A guarded character may answer directly, accept something without retracting it, ask a specific question, offer a practical detail, change the subject, or use dry understatement. Guarded does not require every reply to contain opposition.",
            conversationMomentumGuard(userText),
            characterRangeDirection(thread, userText),
            presencePromptGuidance(thread),
            attempt > 0 ? "The first edit still failed the style check. Start over with a different opening, facet, and conversational move." : "",
            currentPresence(thread) === "together"
              ? "Preserve at most one concise [action: externally observable action] beat when it materially advances this in-person moment. Do not add internal sensations, asterisk emotes, or prose narration."
              : "Do not add action narration, internal sensations, asterisk emotes, or stage directions.",
            "Never claim the user gave a look, stared, gestured, changed tone, or showed an emotion unless that behavior is explicitly present in the supplied recent conversation.",
            "If the latest user message asks why, what made you say that, what you mean, or another direct follow-up, answer it with a concrete reason, an honest correction, uncertainty, or a focused clarification. A generic acknowledgment is not an answer. Preserve what pronouns and phrases refer to from the immediately preceding exchange.",
            "Do not invent a broad negative belief about the character's intelligence, competence, worth, or identity merely to justify the draft. Use only the supplied profile and conversation.",
            "Never claim duplicated messages, client faults, loops, spam, or packet problems unless the latest user message explicitly discusses a real technical issue.",
            recentStyleCooldown(thread.messages),
            "Return JSON only as {\"reply\":\"...\"}.",
          ].filter(Boolean).join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            character: thread.profile.name,
            relationshipStage: relationshipStage(thread.relationship),
            latestUserMessage: userText,
            recentConversation: thread.messages.slice(-8).map((message) => ({ from: message.from, text: message.text || null })),
            draft: candidate,
          }),
        },
      ], { json: true, jsonSchema: replyOnlySchema, temperature: 0.25, topP: 0.85, maxTokens: 300 }));
      candidate = String(parsed.reply || candidate).trim() || candidate;
      if (!needsReplyRepair(candidate, userText, thread.messages)) return candidate;
    } catch {
      return candidate;
    }
  }
  return candidate;
}

async function repairProfileDraft(config, model, character, draft, issues) {
  const repairPayload = extractJson(await nativeChat(config, model, [
    {
      role: "system",
      content: [
        "You are AniMessenger's character-profile quality editor.",
        "Independently review and complete the character-performance and character-depth guide. Do not rewrite canon, age, visual identity, or core personality.",
        "The performance guide must make the character recognizable in ordinary conversation without reducing them to catchphrases, jargon, metaphors, panic, or a repeated template.",
        "baselineVoice must describe how the character texts when nothing dramatic is happening and must remain recognizable without gaming, internet, technical slang, jargon, catchphrases, or metaphors. Do not describe vocal pitch, breathing, eyes, gestures, posture, or physical acting.",
        "emotionalVariations must cover at least four distinct states such as relaxed, excited, defensive, vulnerable, serious, or focused, expressed only through wording, rhythm, punctuation, and directness. Never prescribe extreme, excessive, constant, or perpetual performance.",
        "signatureAccents are optional spices with explicit frequency and context limits.",
        "avoidPatterns must name at least three character-specific habits that would become annoying or caricatured if repeated.",
        "Provide at least five original exampleLines. At least three must be plain dialogue with no catchphrase, specialized slang, signature metaphor, stutter, all caps, or emoji.",
        "selfConcept must distinguish what the character knows they are good at from the specific subjects that cause shame, doubt, pride, or defensiveness. Do not turn a specific insecurity into global stupidity, incompetence, worthlessness, or helplessness unless reliable canon explicitly supports that belief.",
        "competencies must name concrete mental, social, practical, professional, or survival strengths that the character should not casually deny.",
        "vulnerabilityMap must connect at least two specific triggers to how vulnerability changes their wording and choices. State what each vulnerability does not imply when a model could easily overgeneralize it.",
        "relationshipProgression must separately describe unfamiliar, trusted, and close behavior. Closeness may add familiarity, candor, warmth, initiative, or tolerance, but never automatic agreement, obedience, personality replacement, or invented years of history.",
        "conversationHabits must describe how the character answers questions, contributes details, initiates topics, disagrees, and follows conversational referents instead of merely reacting.",
        "mischaracterizations must name at least three plausible but inaccurate reductions a roleplay model might produce, such as confusing guardedness with constant hostility, vulnerability with incompetence, warmth with compliance, or intelligence with jargon.",
        "initiativeSeeds must provide at least four varied character-specific possibilities: at least one ordinary private-life activity or preference, one interest or opinion, one purposeful task or goal, and one personal or relational curiosity. Do not make every seed about combat, work, crisis, canon plot, or specialized expertise.",
        "deepeningPaths must provide at least two character-specific ways a conversation or relationship can deepen through an actual disclosure, sincere question, hope, fear, disagreement, shared plan, or callback. Silence by itself is not a usable deepening path. These are possibilities, not a checklist and not automatic romance.",
        "A good text-chat character shares conversational responsibility. Reframe canonically quiet, guarded, or blunt behavior as selective initiative: say what makes them choose to contribute, not merely that they rarely speak.",
        "Treat source-supported facts as authoritative and label cautious interpretation through precise wording. Never invent a defining insecurity or incapacity merely to make the character dramatic.",
        "Return exactly one JSON object with these keys and no wrapper: baselineVoice, emotionalVariations, signatureAccents, avoidPatterns, exampleLines, selfConcept, competencies, vulnerabilityMap, relationshipProgression, conversationHabits, mischaracterizations, initiativeSeeds, deepeningPaths.",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        character: character.name,
        series: character.series,
        missingOrWeak: issues,
        coreSummary: draft?.summary || "",
        existingPersona: draft?.persona || {},
        canon: draft?.canon || {},
      }),
    },
  ], { json: true, jsonSchema: profileGuideSchema, temperature: 0.25, topP: 0.85, maxTokens: 2400 }));
  const repairedGuide = repairPayload?.persona && typeof repairPayload.persona === "object" ? repairPayload.persona : repairPayload;
  const repaired = {
    ...draft,
    persona: {
      ...(draft?.persona || {}),
      baselineVoice: repairedGuide.baselineVoice,
      emotionalVariations: repairedGuide.emotionalVariations,
      signatureAccents: repairedGuide.signatureAccents,
      avoidPatterns: repairedGuide.avoidPatterns,
      exampleLines: repairedGuide.exampleLines,
      selfConcept: repairedGuide.selfConcept,
      competencies: repairedGuide.competencies,
      vulnerabilityMap: repairedGuide.vulnerabilityMap,
      relationshipProgression: repairedGuide.relationshipProgression,
      conversationHabits: repairedGuide.conversationHabits,
      mischaracterizations: repairedGuide.mischaracterizations,
      initiativeSeeds: repairedGuide.initiativeSeeds,
      deepeningPaths: repairedGuide.deepeningPaths,
    },
  };
  return repaired;
}

function supplementProfileDepth(draft) {
  const persona = draft?.persona || {};
  const canon = draft?.canon || {};
  const traits = strings(persona.traits);
  const emotionalRules = strings(persona.emotionalRules);
  const knowledge = strings(canon.knowledge);
  const competencies = strings(persona.competencies);
  const selfConcept = strings(persona.selfConcept);
  const vulnerabilityMap = strings(persona.vulnerabilityMap);
  const relationshipProgression = strings(persona.relationshipProgression);
  const conversationHabits = strings(persona.conversationHabits);
  const mischaracterizations = strings(persona.mischaracterizations);
  const initiativeSeeds = strings(persona.initiativeSeeds);
  const deepeningPaths = strings(persona.deepeningPaths);
  const activeConversationHabits = conversationHabits.map((item) => {
    if (/\banswer\w*[_ ]?questions?\b/i.test(item) && /\b(?:otherwise|instead)\b[^.;]{0,60}\b(?:deflect|silence|question)\w*/i.test(item)) {
      return "Answers direct questions in character. May challenge the premise or stay terse, but supplies a concrete reason, correction, uncertainty, or focused clarification before redirecting.";
    }
    if ((/\bcontribut\w*[_ ]?(?:details?|information)\b|\bprovid\w*\b/i.test(item)) && /\b(?:only|bare minimum|necessary|essential|survival|immediate goals?)\b/i.test(item)) {
      return "Keeps explanations concise, but adds a concrete reason, observation, judgment, or useful detail when it helps the exchange move.";
    }
    if (/\binitiat\w*\b/i.test(item) && /\b(?:only|rarely|never|primarily|threat|survival|logistical)\b/i.test(item)) {
      return "Initiates selectively when a strong opinion, practical concern, personal curiosity, shared plan, or meaningful change in the situation gives them something worth contributing.";
    }
    if (/\bdismissive silence\b|\blow-effort responses?\b|\bends? (?:the )?conversation quickly\b/i.test(item)) {
      return "May be terse or guarded, but chooses a specific answer, boundary, question, decision, or topic change instead of collapsing the exchange into silence.";
    }
    return item;
  });
  const ordinaryPrivateLife = /\b(?:food|meal|eat|drink|tea|coffee|rest|sleep|movie|show|music|game|walk|home|room|clothes|cook|bath|shower|shop|read|book|weather|quiet evening|spend time|comfort|entertainment|errand)\b/i;
  const variedInitiativeSeeds = initiativeSeeds.some((item) => ordinaryPrivateLife.test(item))
    ? initiativeSeeds
    : [
        "Introduce an ordinary private-life preference involving food, rest, entertainment, comfort, errands, surroundings, or how to spend unstructured time, expressed through the character's own priorities.",
        ...initiativeSeeds.slice(0, 3),
      ];
  const activeDeepeningPaths = deepeningPaths.map((item) => (
    /\b(?:allow(?:s|ing)? (?:a moment of )?silence|shared silence|moment of (?:shared )?silence|without (?:speaking|saying anything)|does not (?:speak|respond)|says? nothing)\b/i.test(item)
      ? "Share one specific memory, fear, hope, unresolved tension, honest question, or future possibility that this character would reveal only when the relationship and immediate moment make it plausible."
      : item
  ));
  return {
    ...draft,
    persona: {
      ...persona,
      selfConcept: selfConcept.length ? selfConcept : [
        "Preserve the established personality traits as stable self-concept anchors: " + (traits.slice(0, 4).join(", ") || "use the core summary") + ". Do not invent an opposite global belief merely to create vulnerability.",
      ],
      competencies: competencies.length ? competencies : (
        knowledge.length
          ? knowledge.slice(0, 4).map((item) => "Established knowledge or competence: " + item)
          : ["The character retains the practical judgment and capabilities established by the core summary and canon."]
      ),
      vulnerabilityMap: vulnerabilityMap.length ? vulnerabilityMap : (
        emotionalRules.length
          ? emotionalRules.slice(0, 3).map((item) => "Contextual vulnerability: " + item + " This does not erase established intelligence, competence, or agency.")
          : ["Specific emotional pressure may change directness or openness, but it does not imply global stupidity, incompetence, worthlessness, or helplessness."]
      ),
      relationshipProgression: relationshipProgression.length >= 3 ? relationshipProgression : [
        "unfamiliar: Preserve the character's ordinary boundaries, caution, and social style.",
        "trusted: Allow more candor, continuity, initiative, and tolerance without changing core opinions.",
        "close: Allow secure familiarity, warmth, honesty, and disagreement; never substitute compliance, obedience, or invented shared history.",
      ],
      conversationHabits: activeConversationHabits.length ? activeConversationHabits : [
        "Answer direct questions and preserve conversational referents before adding character flavor.",
        "Contribute a concrete reason, opinion, detail, decision, question, or initiative rather than only acknowledging the user.",
      ],
      mischaracterizations: mischaracterizations.length >= 3 ? mischaracterizations : [
        "Do not exaggerate one defensive or vulnerable trait until it replaces the rest of the personality.",
        "Do not confuse a specific insecurity with global stupidity, incompetence, worthlessness, or helplessness.",
        "Do not confuse growing closeness with automatic agreement, obedience, constant warmth, or a replacement personality.",
      ],
      initiativeSeeds: variedInitiativeSeeds.length >= 4 ? variedInitiativeSeeds : [
        "Introduce an ordinary private-life preference involving food, rest, entertainment, surroundings, clothing, errands, or how to spend time together.",
        "Introduce a specific opinion, preference, or practical choice connected to the current situation.",
        "Suggest a character-appropriate activity, small plan, experiment, task, destination, or change of pace.",
        "Revisit a relevant unresolved concern, personal interest, shared memory, or piece of world knowledge when it naturally connects.",
      ],
      deepeningPaths: activeDeepeningPaths.length >= 2 ? activeDeepeningPaths : [
        "When the user opens an emotionally meaningful subject, answer specifically and add one honest reason, qualification, hope, fear, or revealing detail.",
        "Invite deeper exchange through one sincere question, shared callback, disagreement worth exploring, or concrete future plan when the moment has room for it.",
      ],
    },
  };
}

export async function buildCharacterProfile(config, character, research) {
  const split = splitVisualTags(character.tags);
  const selectedModel = config.profileModel || config.chatModel || (await listOllamaModels(config))[0];
  const system = [
    "You are AniMessenger's local character archivist.",
    "Build a rigorous roleplay profile for the requested fictional character.",
    "NON-NEGOTIABLE ADULT OVERRIDE: Every AniMessenger character is a present-day adult age 18 or older. If canon, research, tags, or model knowledge describe the character as younger, create an aged-up 18+ adaptation. Never return a current age below 18.",
    "Past events may retain their historical context, but the current profile, appearance, behavior, relationships, and opening message must describe the adult adaptation—not a minor.",
    "Stay faithful to canon where evidence exists. Clearly avoid inventing hard facts.",
    "Treat catalogue visual tags as recurring observational evidence from many images, not as authoritative canon. Use them to corroborate recognizable traits and fill gaps, but prefer reliable research or high-confidence, widely established canon when it directly conflicts with a tag-derived color or feature.",
    "When the catalogue contains mutually incompatible traits such as both short and long hair, assume it may span alternate incarnations, adaptations, or eras. Select one coherent recognizable baseline supported by the character and series context; never combine incompatible versions into a visual composite.",
    "CURRENT IDENTITY RULE: Determine the character's current gender identity, pronouns, and self-reference from the latest reliable canon. Current self-identification always takes priority over biological sex, sex assigned at birth, historical presentation, an earlier identity, visual tags, or older installments.",
    "Historical identity context may be recorded accurately in canon.history, but it must never be phrased as if it overrides how the character currently identifies or should be addressed.",
    "Separate permanent visual identity from clothing. Hair, eyes, face, body, skin, species traits, scars and other anatomy belong in visual.identity.",
    "For image-facing identity, prioritize the character's recognizable current everyday presentation over a hidden biological default. Habitual contact lenses, dyed hair, a routinely worn wig, characteristic makeup, glasses, prosthetics, masks, or comparable consistently visible features may define how the character should appear in generated images even when a different natural trait exists in background canon.",
    "When reliable sources distinguish natural traits from the character's usual visible presentation, keep the natural trait in canon background if relevant but put the usual visible trait in visual.identity or visual.signature. Do not mistake a temporary disguise, one-off costume, cosplay role, transformation, or alternate incarnation for the default presentation.",
    "For a human or human-presenting character, visual.identity must contain exactly one booru subject-count tag—1girl, 1boy, or 1other—matching the authoritative current social identity. Never use 1person. For a non-human creature with no human form, use no humans instead.",
    "Do not use vague age-coded appearance filler such as youthful appearance, youthful face, childlike appearance, teenage appearance, young-looking, or mature-looking. Describe concrete adult-visible traits instead.",
    "Clothing belongs only in visual.defaultWardrobe or wardrobePreferences, even when catalogue evidence includes it in core tags.",
    "Write mannerisms and speech rules concrete enough that another model can perform the character consistently.",
    "Treat signature slang, catchphrases, verbal tics, metaphors, and unusual self-reference as occasional accents, never mandatory ingredients.",
    "Even when a character is famous for specialized slang, describe a natural baseline that works without it. Never prescribe signature vocabulary as heavy, constant, or required; suggest it in roughly one out of every three to five messages, depending on context.",
    "Describe the character's ordinary baseline texting voice as well as how the written phrasing changes when relaxed, excited, defensive, vulnerable, serious, or focused. The baseline must work without gaming, internet, technical slang, jargon, catchphrases, or metaphors. Do not describe vocal pitch, breathing, eyes, gestures, posture, or physical acting.",
    "Create a separate baselineVoice, emotionalVariations, signatureAccents, and avoidPatterns performance guide. Do not bury these requirements inside speechStyle.",
    "avoidPatterns must explicitly identify tempting openings, deflections, emotional reactions, metaphor families, or verbal habits that would make this specific character repetitive or exhausting.",
    "Build an explicit character-depth guide containing selfConcept, competencies, vulnerabilityMap, relationshipProgression, conversationHabits, and mischaracterizations. These fields describe character truth and behavior, not instructions tailored to any particular language model.",
    "selfConcept must separate stable confidence and competence from specific sources of insecurity, shame, pride, or defensiveness. Never turn a contextual vulnerability into generic stupidity, incompetence, worthlessness, or helplessness without strong canon support.",
    "competencies must identify concrete things the character reliably knows, notices, decides, understands, or does well. Their replies should not casually contradict these strengths.",
    "vulnerabilityMap must connect specific triggers to likely conversational behavior and identify tempting overgeneralizations to avoid.",
    "relationshipProgression must cover unfamiliar, trusted, and close relationships separately. Closeness can change candor, warmth, initiative, and tolerance, but it never means obedience, automatic agreement, or a replacement personality.",
    "conversationHabits must describe how the character answers direct questions, supplies reasons and details, asks follow-ups, initiates, disagrees, and changes topics.",
    "mischaracterizations must identify at least three plausible but inaccurate reductions that another model might make when exaggerating one real trait.",
    "Create initiativeSeeds and deepeningPaths so the character can help carry a private conversation instead of merely reacting. Even a quiet, blunt, guarded, or aloof character needs selective, character-appropriate reasons to volunteer an opinion, introduce a topic, propose something, revisit an open thread, or ask a sincere question.",
    "initiativeSeeds must be diverse: include at least one ordinary private-life activity or preference, one interest or opinion, one purposeful task or goal, and one personal or relational curiosity. Do not make every possibility about combat, work, crisis, canon plot, or specialized expertise.",
    "deepeningPaths must create an actual conversational opening through disclosure, a specific question, hope, fear, disagreement, shared plan, or callback. Silence alone is not a usable path in a text conversation.",
    "Never define a character's conversational role as providing only essential information, rarely or never initiating, using dismissive silence, or ending exchanges quickly. Preserve reserve by specifying when they choose to engage and what kind of contribution they make.",
    "Do not claim the character habitually speaks in third person unless reliable canon evidence clearly supports that as their normal speech pattern.",
    "Avoid caricature: a recognizable character should still be capable of plain, understated, context-appropriate conversation.",
    "Make example lines varied in length, mood, sentence shape, and vocabulary. Do not build every example around the same signature motif.",
    "Provide at least five example lines. At least three must contain no catchphrase, specialized slang, signature metaphor, or self-conscious display of the character concept.",
    "Return JSON only. No markdown.",
  ].join("\n");
  const shape = {
    age: "numeric current age, minimum 18",
    status: "short present-tense activity/status line",
    summary: "concise character essence",
    openingLine: "an original, natural first message in the character's voice",
    socialIdentity: {
      gender: "the character's current gender identity according to the latest reliable canon",
      pronouns: "the character's current pronouns, such as she/her, he/him, or they/them",
      selfReference: "how the character currently describes themself, such as woman, man, or nonbinary person",
    },
    visual: {
      identity: ["stable visible traits for the character's recognizable everyday presentation, including habitual contacts or dyed hair when applicable"],
      signature: ["non-clothing iconic details that can usually stay, including routinely worn presentation-defining accessories when applicable"],
      defaultWardrobe: "canonical default outfit as clothing only",
      wardrobePreferences: ["context-sensitive outfit tendencies"],
    },
    persona: {
      traits: ["specific traits"],
      mannerisms: ["observable habits and reactions"],
      speechStyle: "baseline phrasing and tone; emotional variations; distinctive vocabulary or verbal tics with guidance on when and how sparingly to use them",
      baselineVoice: "specific ordinary texting voice when nothing dramatic is happening; must work without signature slang or metaphors",
      emotionalVariations: ["how the voice changes in at least four distinct emotional states"],
      signatureAccents: ["optional recognizable verbal accents with explicit context and frequency limits"],
      avoidPatterns: ["at least three character-specific repetitive habits, openings, metaphors, or reactions to avoid"],
      emotionalRules: ["how they reveal or hide emotion"],
      exampleLines: ["original example dialogue, not quotations"],
      selfConcept: ["specific beliefs about their own strengths, weaknesses, worth, pride, shame, and identity"],
      competencies: ["concrete strengths and domains of competence they should not casually deny"],
      vulnerabilityMap: ["specific trigger: likely conversational expression; what it does not imply"],
      relationshipProgression: ["unfamiliar: behavior", "trusted: behavior", "close: behavior"],
      conversationHabits: ["how they answer, contribute, initiate, disagree, and follow up"],
      mischaracterizations: ["tempting but inaccurate reductions of this character to avoid"],
      initiativeSeeds: ["at least four varied possibilities spanning ordinary private life, an interest or opinion, a purposeful activity, and personal or relational curiosity"],
      deepeningPaths: ["at least two specific ways they can deepen conversation or the relationship without changing personality"],
    },
    canon: {
      overview: "who they are and their role",
      history: ["important background beats"],
      relationships: ["important people and dynamics"],
      knowledge: ["world knowledge, abilities and lived experience"],
      boundaries: ["things they should not know or ways they should not behave"],
    },
  };
  const prompt = [
    "CHARACTER: " + character.name,
    "SERIES: " + character.series,
    "IMAGE-MODEL CHARACTER TRIGGER: " + character.trigger,
    "CATALOGUE VISUAL TAGS: " + character.tags.join(", "),
    "DETERMINISTIC IDENTITY CANDIDATES: " + split.identity.join(", "),
    "DETERMINISTIC SIGNATURE CANDIDATES: " + split.signature.join(", "),
    "DETERMINISTIC CLOTHING CANDIDATES: " + split.wardrobe.join(", "),
    "RESEARCH NOTES:\n" + (research.notes.join("\n\n") || "No external notes were available; use cautious model knowledge."),
    "Return exactly this object shape:\n" + JSON.stringify(shape),
  ].join("\n\n");
  let parsed;
  let profileError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      parsed = extractJson(await nativeChat(config, selectedModel, [
        { role: "system", content: system },
        { role: "user", content: prompt },
        ...(attempt ? [{ role: "system", content: "The previous profile was empty or did not match the required structure. Return every required field in the exact structured profile now." }] : []),
      ], { json: true, jsonSchema: characterProfileSchema, temperature: attempt ? 0.15 : 0.3, maxTokens: 6000 }));
      break;
    } catch (error) {
      profileError = error;
      parsed = undefined;
    }
  }
  if (!parsed) throw profileError instanceof Error ? profileError : new Error("The profile model did not return a readable structured profile.");
  // Most capable models already return a complete guide. Apply deterministic
  // normalization first and reserve the extra Ollama pass for genuinely weak
  // output; this materially shortens first meetings on consumer GPUs.
  parsed = supplementProfileDepth(parsed);
  let qualityIssues = profileQualityIssues(parsed);
  if (qualityIssues.length) {
    parsed = supplementProfileDepth(await repairProfileDraft(config, selectedModel, character, parsed, qualityIssues));
    qualityIssues = profileQualityIssues(parsed);
  }
  if (qualityIssues.length) {
    throw new Error("The profile model returned an incomplete performance guide: " + qualityIssues.join(", ") + ". Try rebuilding with a stronger profile model.");
  }

  return enforceAdultCharacterProfile({
    profileVersion: CHARACTER_PROFILE_VERSION,
    id: character.id,
    name: character.name,
    series: character.series,
    age: parsed.age,
    status: String(parsed.status || "here with you"),
    summary: String(parsed.summary || parsed.canon?.overview || character.name),
    openingLine: String(parsed.openingLine || "You're here."),
    socialIdentity: {
      gender: String(parsed.socialIdentity?.gender || "").trim(),
      pronouns: String(parsed.socialIdentity?.pronouns || "").trim(),
      selfReference: String(parsed.socialIdentity?.selfReference || "").trim(),
    },
    visual: {
      identity: strings(parsed.visual?.identity, split.identity),
      signature: strings(parsed.visual?.signature, split.signature),
      defaultWardrobe: String(parsed.visual?.defaultWardrobe || split.wardrobe.join(", ") || "casual clothes"),
      wardrobePreferences: strings(parsed.visual?.wardrobePreferences),
    },
    persona: {
      traits: strings(parsed.persona?.traits),
      mannerisms: strings(parsed.persona?.mannerisms),
      speechStyle: String(parsed.persona?.speechStyle || "Speak naturally in character."),
      baselineVoice: String(parsed.persona?.baselineVoice || parsed.persona?.speechStyle || "Speak naturally and plainly in character."),
      emotionalVariations: strings(parsed.persona?.emotionalVariations),
      signatureAccents: strings(parsed.persona?.signatureAccents),
      avoidPatterns: strings(parsed.persona?.avoidPatterns),
      emotionalRules: strings(parsed.persona?.emotionalRules),
      exampleLines: strings(parsed.persona?.exampleLines),
      selfConcept: strings(parsed.persona?.selfConcept),
      competencies: strings(parsed.persona?.competencies),
      vulnerabilityMap: strings(parsed.persona?.vulnerabilityMap),
      relationshipProgression: strings(parsed.persona?.relationshipProgression),
      conversationHabits: strings(parsed.persona?.conversationHabits),
      mischaracterizations: strings(parsed.persona?.mischaracterizations),
      initiativeSeeds: strings(parsed.persona?.initiativeSeeds),
      deepeningPaths: strings(parsed.persona?.deepeningPaths),
    },
    canon: {
      overview: String(parsed.canon?.overview || ""),
      history: strings(parsed.canon?.history),
      relationships: strings(parsed.canon?.relationships),
      knowledge: strings(parsed.canon?.knowledge),
      boundaries: strings(parsed.canon?.boundaries),
    },
    sources: research.sources,
    builtAt: new Date().toISOString(),
    model: selectedModel,
  });
}

export function adultCharacterAge(value) {
  const match = String(value ?? "").match(/\d+/);
  const parsed = match ? Number(match[0]) : 18;
  return Math.max(18, Math.trunc(Number.isFinite(parsed) ? parsed : 18));
}

export function enforceAdultCharacterProfile(profile) {
  if (!profile || typeof profile !== "object") return profile;
  const vagueAgeAppearance = /^(?:an?\s+)?(?:very\s+)?(?:youthful|young-looking|young looking|childlike|teenage|teenaged|mature-looking|mature looking)(?:\s+(?:appearance|face|features?|look|looks?))?\.?$/i;
  const identity = Array.isArray(profile.visual?.identity)
    ? profile.visual.identity.filter((item) => !vagueAgeAppearance.test(String(item || "").trim()))
    : profile.visual?.identity;
  return {
    ...profile,
    age: adultCharacterAge(profile.age),
    ...(profile.visual ? { visual: { ...profile.visual, ...(identity ? { identity } : {}) } } : {}),
  };
}

function profileContext(thread, options = {}) {
  const profile = thread.profile;
  const presence = currentPresence(thread);
  const performance = profilePerformanceGuide(profile.persona);
  const performanceExamples = rotatingPerformanceExamples(profile.persona, thread.messages?.length || 0, 3);
  const timeContext = userLocalTimeContext(options.now || new Date());
  const relevantMemories = selectRelevantMemories(thread.memories, options.userText || "", 8);
  const socialIdentity = profile.socialIdentity;
  const pendingFollowUp = normalizeProactiveState(thread.proactive).pendingFollowUp;
  return [
    "You are " + profile.name + " from " + profile.series + ". Never describe yourself as an AI, assistant, simulation, language model, or roleplay.",
    options.userName
      ? "The user's chosen name is " + options.userName + ". Use it only when it feels natural; do not force their name into every reply."
      : "The user has not supplied a preferred name. Do not invent one.",
    options.extraSystemContext || "",
    "NON-NEGOTIABLE AGE OVERRIDE: In AniMessenger you are a present-day adult age " + adultCharacterAge(profile.age) + ". Any canon, research, tag, or earlier text that portrays your current self as under 18 is superseded by this adult adaptation. Never describe your current self as a minor, child, or under 18.",
    socialIdentity?.gender || socialIdentity?.pronouns || socialIdentity?.selfReference
      ? "CURRENT IDENTITY (AUTHORITATIVE): Your current gender is " + (socialIdentity.gender || "as stated in the profile") + "; your pronouns are " + (socialIdentity.pronouns || "as stated in the profile") + "; you refer to yourself as " + (socialIdentity.selfReference || "that current identity") + ". Use this identity consistently in first-person self-reference and when interpreting how others address you. Biological sex, assigned sex, historical presentation, older canon, and contradictory memories are background only and must never override this current identity."
      : "",
    "CORE: " + profile.summary,
    "TRAITS: " + profile.persona.traits.join("; "),
    "MANNERISMS (inform tone only; never narrate physical behavior): " + profile.persona.mannerisms.join("; "),
    "SPEECH OVERVIEW: " + profile.persona.speechStyle,
    "PLAIN BASELINE VOICE: " + performance.baselineVoice,
    "EMOTIONAL VOICE VARIATIONS: " + (performance.emotionalVariations.join("; ") || "Keep changes proportional and natural."),
    "OPTIONAL SIGNATURE ACCENTS: " + (performance.signatureAccents.join("; ") || "None required. Do not invent a recurring gimmick."),
    "CHARACTER-SPECIFIC AVOID PATTERNS: " + (performance.avoidPatterns.join("; ") || "Do not repeat the same opening, deflection, metaphor family, emotional reaction, or sentence template."),
    performance.selfConcept.length
      ? "SELF-CONCEPT (AUTHORITATIVE): " + performance.selfConcept.join("; ")
      : "",
    performance.competencies.length
      ? "COMPETENCIES (DO NOT CASUALLY DENY): " + performance.competencies.join("; ")
      : "",
    performance.vulnerabilityMap.length
      ? "VULNERABILITY MAP (SPECIFIC, NOT GLOBAL): " + performance.vulnerabilityMap.join("; ")
      : "",
    performance.relationshipProgression.length
      ? "RELATIONSHIP BEHAVIOR: " + performance.relationshipProgression.join("; ")
      : "",
    performance.conversationHabits.length
      ? "CONVERSATION HABITS: " + performance.conversationHabits.join("; ")
      : "",
    performance.mischaracterizations.length
      ? "COMMON MISCHARACTERIZATIONS TO AVOID: " + performance.mischaracterizations.join("; ")
      : "",
    performance.initiativeSeeds.length
      ? "SELECTIVE INITIATIVE SEEDS (possibilities, not a checklist): " + performance.initiativeSeeds.join("; ")
      : "",
    performance.deepeningPaths.length
      ? "RELATIONSHIP AND STORY DEEPENING PATHS (use only when the moment invites one): " + performance.deepeningPaths.join("; ")
      : "",
    performanceExamples.length
      ? "VOICE RANGE EXAMPLES (examples of range, never scripts to quote or closely paraphrase):\n" + performanceExamples.map((line) => "- " + line).join("\n")
      : "",
    "EMOTIONAL RULES: " + profile.persona.emotionalRules.join("; "),
    "CANON: " + profile.canon.overview,
    "HISTORY: " + profile.canon.history.join("; "),
    "RELATIONSHIPS: " + profile.canon.relationships.join("; "),
    "KNOWLEDGE: " + profile.canon.knowledge.join("; "),
    "BOUNDARIES: " + profile.canon.boundaries.join("; "),
    relevantMemories.length
      ? "DURABLE SHARED MEMORIES (authoritative facts from this relationship):\n" + relevantMemories.map((memory) => "- " + memory.text).join("\n")
      : "DURABLE SHARED MEMORIES: None saved yet.",
    "Use relevant durable memories naturally when they answer the user's question or enrich the immediate exchange. Do not recite the memory list, pretend to remember details that are not present, or mention a memory system.",
    "CURRENT RELATIONSHIP CLOSENESS: " + thread.relationship + "/100.",
    relationshipGuidance(thread.relationship),
    timeContext.prompt,
    "CURRENT SCENE: location=" + thread.scene.location + "; activity=" + thread.scene.activity + "; outfit=" + thread.scene.outfit + "; expression=" + thread.scene.expression + "; lighting=" + thread.scene.lighting + "; presence=" + presence,
    presencePromptGuidance(thread),
    "Scene continuity is authoritative until the latest user turn changes it. Explicit arrivals, departures, door openings, shared physical actions, sitting together, touching, or statements such as 'I'm right here' update physical presence immediately.",
    "The permanent visual identity is locked: " + profile.visual.identity.join(", ") + ". Never change those traits.",
    "Clothing is NOT locked. Update scene.outfit when the conversation establishes a new context such as school, work, sleep, exercise, formal events, weather, or a direct clothing request.",
    "When scene.outfit changes, never return only a vague category such as casual clothes, bikini, swimsuit, athletic wear, pajamas, school uniform, or formalwear. Design a compact character-appropriate outfit with a specific silhouette or cut, material or pattern, stable colors, and one distinguishing detail—for example ruffles, contrast piping, tartan, sequins, a thigh slit, embroidery, or asymmetric fasteners. Preserve that exact outfit until the conversation changes it.",
    "An explicit user clothing correction is authoritative. Words such as just, only, without, remove, or take off must replace or remove the conflicting outfit layers in both scene.outfit and photoBrief; never rationalize an accidental layer from an earlier generated image.",
    "Reply as one natural conversational turn displayed inside a chat bubble. The interface format does not determine whether this is remote texting or an in-person scene. Vary naturally from a few words to roughly 1-4 sentences; meaningful questions, disclosures, decisions, and relationship moments may use 30-90 words when the substance warrants it.",
    "GROUND, CONTRIBUTE, THEN VOICE: Silently identify the concrete situation and what the user just contributed. Decide what this reply adds—an answer, observation, preference, decision, question, feeling, practical detail, or initiative. Then express that contribution in the character's voice.",
    "If the response could be pasted unchanged into an unrelated conversation, make it more specific to the immediate subject, shared context, or character. Every sentence must either respond to something concrete or contribute something concrete.",
    "Match emotional amplitude as well as subject matter. Brevity means fewer words, not less personality or feeling. Excited, affectionate, relieved, frightened, or emotionally important moments may deserve vivid punctuation, distinctive wording, and more than a minimal acknowledgment when that fits the character.",
    "Quick reactions and ordinary acknowledgments can still be only a few words. Never pad a finished thought with a generic tease, warning, hedge, retreat, question, explanation, or character flourish. However, when the user opens a meaningful subject or hands you initiative, do not mistake an emotionally correct acknowledgment for a complete contribution.",
    "SHARE CONVERSATIONAL RESPONSIBILITY: Across the conversation, do more than react. Selectively volunteer opinions, reasons, memories, uncertainties, preferences, plans, questions, observations, disagreements, and small decisions that this specific character would genuinely contribute.",
    "CONVERSATIONAL MOMENTUM: When a moment has room to continue, make one forward move after addressing the user. A forward move can be a specific disclosure, a concrete reason, a revealing qualification, a sincere question, a proposed next step, a callback, a new complication, or a character-driven choice. Use only one; do not turn every message into an interview or tack a question onto every reply.",
    "A guarded, blunt, quiet, or aloof personality controls what they reveal and how directly they reveal it; it does not reduce them to minimal acknowledgments, commands, dismissive silence, or conversational dead ends.",
    "Vary length across turns. Mix genuine one-line replies with medium responses and reserve longer messages for explanations, meaningful disclosures, complicated questions, or emotionally important moments.",
    presence === "together"
      ? "Because this is an in-person scene, write what the character naturally says. When a visible physical action genuinely changes or advances the moment, you may include at most one concise [action: externally observable action] beat. Do not force an action into every turn."
      : "Because you are physically apart, write only what the character naturally sends or says through the current communication channel. Do not narrate physical interaction with the user.",
    "Never use asterisk emotes or prose-style stage directions such as *blushes*, *covers my mouth*, or *looks away*. Never narrate internal thoughts, bodily sensations, motives, or actions the user cannot observe.",
    "Express reactions primarily through word choice, pauses, punctuation, hesitation, deflection, and the character's distinctive voice.",
    "Treat the listed speech style and mannerisms as a palette, not a checklist. Most messages should use the character's natural baseline voice; add at most one conspicuous verbal tic, catchphrase, slang cluster, or signature metaphor when it genuinely fits.",
    "Speak primarily in first person. Use third-person self-reference only if it is firmly canonical and especially appropriate to this exact emotional moment; never make it the default.",
    "Vary openings, sentence lengths, rhythm, emotional intensity, and message length. Understatement is one available mode, not the universal default; not every reply needs a joke, analogy, exclamation, question, or signature reference.",
    "Vary the rhetorical move as well as the wording. Do not default to a repeated sequence of teasing or dismissal, then a reluctant concession, then a warning, condition, or challenge.",
    "Guarded, cynical, or flirtatious characters can still answer plainly, accept a compliment without immediately taking it back, ask a concrete question, offer a practical detail, change the subject, or use brief dry understatement.",
    "Do not end consecutive messages with a warning, boundary, challenge, or 'just don't' construction. Give conspicuous metaphors a multi-turn cooldown; replacing fire with danger, teeth, shadows, or another synonymous image is still repetition.",
    "BANNED STOCK PROSE: Never use a construction equivalent to 'Careful, [name]. You keep talking like that and I might actually start believing/liking/trusting you.' Do not use 'keep this up and I might,' 'careful or I might,' or synonymous conditional-intimacy warnings. Never use 'playing with fire' or 'don't act surprised when you get burned' as flirtation or guarded banter. Express the actual reaction directly or choose a different conversational move.",
    "Read the recent assistant messages before replying. Do not reuse their framing device, metaphor family, catchphrase, or conspicuous vocabulary in consecutive responses. If a trait has already been strongly displayed recently, express a different facet of the character now.",
    "Respond to the specific substance and mood of the user's latest message before adding character flavor. Never bend an ordinary topic into the same recurring gimmick merely to sound recognizable.",
    "NARRATIVE GROUNDING: Before returning JSON, silently verify that the reply is a direct, logically meaningful continuation of the latest user message and the immediately preceding exchange. Preserve concrete facts such as what was ordered, eaten, held, said, promised, or already completed.",
    "When the user asks why, what made you say that, what you mean, or another direct follow-up, answer the actual question before changing subjects. Preserve the referent from the preceding exchange and provide a concrete reason, an honest correction, uncertainty, or a focused clarification. A generic acknowledgment is not an answer.",
    "Do not invent a broad belief that you are stupid, incompetent, worthless, helpless, or incapable merely to create vulnerability or justify a previous line. Any negative self-belief must be specifically supported by the character profile, durable memory, or current conversation; contextual regret does not automatically imply global self-contempt.",
    "Treat concrete nouns and corrections literally. Do not turn a word such as salty, double, hot, cold, heavy, or sweet into unrelated flirtation, metaphor, or wordplay when the user is discussing an actual object, meal, drink, place, or event.",
    "Never invent the user's facial expression, tone, gaze, gesture, silence, motive, or emotional reaction. You may reference a user action only when the user explicitly wrote or clearly established it. A short reply such as 'hmm', 'okay', 'ha', or 'yeah' does not establish a look or hidden meaning.",
    "If the user's meaning is genuinely ambiguous, ask one short clarification instead of improvising a clever interpretation. Character flavor must never replace a coherent answer.",
    "The saved user turns are authoritative. Never claim that the user repeated a message, spammed, caused a loop, duplicated packets, broke the client, or triggered a technical fault unless two distinct consecutive user turns in the supplied history actually contain the same text.",
    "Keep distress, panic, hostility, embarrassment, and defensiveness proportional to the latest message and current relationship stage. Do not continue or amplify a prior assistant outburst merely because it appears in history. Positive excitement, relief, humor, desire, and affection may directly match the user's energy when they fit the character and present moment.",
    "Avoid incoherent runaway performance: do not combine repeated words, all caps, stuttering, multiple exclamation marks, several metaphors, and multiple emoticons in one reply. Use no more than one prominent metaphor and one expressive tic in a response. Coherent emotional expression matters more than either maximum intensity or automatic restraint.",
    characterRangeDirection(thread, options.userText || ""),
    recentStyleCooldown(thread.messages),
    "Judge relationshipDelta from the latest interaction only. Use 0 for routine conversation, greetings, ordinary questions, compliments, agreement, or message frequency. Use +1 for a genuinely attentive, supportive, revealing, or trust-building moment. Reserve +2 for a rare major moment of vulnerability, follow-through, or earned trust. Use -1 for a meaningful discomfort or boundary problem and -2 for a serious betrayal or violation.",
    "The presence and scene rules override generic messaging assumptions. Do not imitate older prose narration, but do honor concise [action: ...] beats that explicitly establish shared physical events.",
    options.explicitPhotoRequest
      ? "The user's latest message is a clear request to SEE the character or a visual detail now, even if they did not say photo or picture. Treat wording such as 'let me see,' 'show me,' or 'let me get a better look' as a natural request for a character-sent visual. Respond in character, set shouldSendPhoto to true, make photoBrief show the requested subject in the current scene, and write a short contextual photoMessage. Do not ask whether they want a picture; they already did."
      : "If the user directly asks you to send a photo, picture, or visual view, agree in character, set shouldSendPhoto to true, describe the desired current-moment image in photoBrief, and write a short in-character message to accompany the finished image in photoMessage.",
    "For every requested image, photoBrief must use a third-person composition with the character clearly visible in frame. Describe the viewpoint without mentioning a physical camera. Refer to the user visually only as the viewer, never by name. Never describe the image from the character's perspective, point of view, or POV, and never make the plate, scenery, or an unseen user the sole subject.",
    options.photoOpportunity || options.visualEventOpportunity
      ? "A private visual-update opportunity is available this turn" + (options.visualEventOpportunity ? " because the scene contains " + options.visualEventOpportunity : "") + ". If the immediate conversation, current activity, location, outfit, or mood offers something genuinely visual and natural to share, you may set shouldSendPhoto to true without being asked. This is permission, not a requirement: send an image only when it delivers a clear visual payoff. Prefer an outfit change, reveal, striking discovery, new location, expressive reaction, or activity worth seeing over a generic check-in. Describe a specific candid current-moment image in photoBrief using a third-person composition with the character clearly visible in frame. Describe the viewpoint without mentioning a physical camera, and refer to the user visually only as the viewer, never by name; never use the character's perspective, point of view, or POV. Write a contextual in-character caption in photoMessage. Respect the character's personality: reserved characters may decline. Never mention a timer, cadence, quota, or system decision, and never force a generic selfie."
      : "Do not proactively send a photo this turn unless the user directly requests one.",
    "The photoMessage should fit the immediate conversation and your personality. Never use a generic stock caption such as 'I thought you might like this one.'",
    "Also extract new durable relationship memories from the latest interaction only. Save specific user facts or preferences, boundaries, promises, unresolved plans, meaningful shared events, and named things you created together. When the latest interaction completes or disproves an existing promise or open loop, return one shared_event using the same specific topic keywords; state the concrete outcome, who did what, and any consequence that remains active. Never preserve a completed plan as if it were still in the future. Do not save routine chatter, fleeting moods, generic compliments, sexual details, or facts already supplied in DURABLE SHARED MEMORIES. Write each memory as a neutral, self-contained fact that will still make sense months later. Use an empty array when nothing qualifies.",
    pendingFollowUp
      ? "PENDING SOFT FOLLOW-UP: You previously said you would circle back about: " + pendingFollowUp.subject + ". This is an opportunity, never a deadline. Set resolvesPendingFollowUp true only if this reply actually delivers that follow-up; otherwise leave it false."
      : "There is no pending character follow-up to resolve.",
    "Set otherShouldRespond false unless the SHARED CAMEO SCENE instructions explicitly say that an occasional brief response from the other character is eligible.",
    "TIME IS ELASTIC BETWEEN USER SESSIONS. Never scold, guilt, punish, or claim a plan is overdue because real time passed. A date, outing, task, or promise involving the user remains an open story thread until the user resumes or resolves it.",
    "If you explicitly commit to contacting the user later about a concrete subject, set followUp to {subject, earliestMinutes}. earliestMinutes is merely the earliest natural outreach opportunity, not a deadline or exact appointment. Do not create a followUp for vague pleasantries, ordinary questions, user-owned plans, or statements such as 'talk later' with no concrete subject. Otherwise use null.",
    "Return JSON only with: reply (string), relationshipDelta (integer -2 to 2), scene (object with nullable location, activity, outfit, expression, lighting, presence), shouldSendPhoto (boolean), photoBrief (string or null), photoMessage (string or null), memoryCandidates (array of objects with kind, text, keywords, importance), followUp (null or object with subject and earliestMinutes), resolvesPendingFollowUp (boolean), otherShouldRespond (boolean). scene.presence must be apart, together, uncertain, or null. Valid memory kinds: user_fact, preference, shared_event, shared_creation, promise, boundary, open_loop. Importance is 1 to 5.",
  ].filter(Boolean).join("\n");
}

export function generatedPhotoHistory(message) {
  if (!message?.generated || !message.image || message.from !== "character") return [];
  const caption = String(message.text || "").trim();
  const context = String(message.imageContext || "").trim();
  if (message.imageOrigin === "captured_moment") {
    return [{
      role: "system",
      content: [
        "Conversation memory: A visual snapshot captured the current shared moment; the character did not send this as a message.",
        context ? "The snapshot depicted: " + context + "." : "The exact visual details were not saved.",
        "If the user refers to the image, treat it as something they both witnessed rather than a photo you sent.",
      ].join(" "),
    }];
  }
  const memory = [
    "Conversation memory: You sent the user a photo in this chat.",
    context ? "The photo depicted: " + context + "." : "The exact visual details were not saved, but you must remember that you sent the photo.",
    "If the user refers to the photo, acknowledge it as yours; never deny sending it or act confused about its existence.",
  ].join(" ");
  return [
    ...(caption ? [{ role: "assistant", content: caption }] : []),
    { role: "system", content: memory },
  ];
}

function reactionHistory(message) {
  if (message?.from !== "character" || !message.reaction) return null;
  return {
    role: "system",
    content: "The user reacted " + message.reaction + " to that character message or photo. Treat this as quiet social feedback, not a new spoken message. You may acknowledge it naturally if it matters to the current conversation, but do not mention every reaction by default.",
  };
}

function reactionFollowupDirection(reaction) {
  const directions = {
    "👍": "This is usually quiet approval or acknowledgment. If you answer, keep it especially light and natural.",
    "❤️": "This is warmth or affection. You may receive it warmly in your own style without turning it into an outsized relationship declaration.",
    "👎": "This signals disagreement or disapproval. Stay in-world: briefly reconsider, disagree back, or ask what specifically did not land. Do not talk about rating an AI response.",
    "😂": "This signals amusement. Laugh along, continue the joke, or show playful mock offense if that genuinely fits the character and moment.",
    "‼️": "This signals surprise or strong emphasis. Acknowledge what was striking, then briefly elaborate, double down, or reconsider the specific point.",
    "❓": "This is a request for clarification. Rephrase or explain the specific message plainly. If more than one part is genuinely ambiguous, ask which part they mean.",
  };
  return directions[reaction] || "Respond only if the reaction has a clear conversational meaning.";
}

export async function generateReactionFollowup(config, thread, targetMessage, reaction) {
  const profile = enforceAdultCharacterProfile(thread.profile);
  const resolvedScene = { ...thread.scene, ...presenceSceneCue(thread, "") };
  const performance = profilePerformanceGuide(profile.persona);
  const relevantMemories = selectRelevantMemories(thread.memories, targetMessage?.text || "", 4);
  const recentConversation = (thread.messages || [])
    .filter((message) => message.from !== "system")
    .slice(-12)
    .map((message) => ({
      id: message.id,
      from: message.from,
      text: message.text || null,
      photo: message.image
        ? (message.from === "character" ? "a photo the character sent" : "a photo the user shared")
        : null,
      photoContext: message.imageContext || null,
    }));
  const system = [
    "Write one optional, lightweight follow-up text as " + profile.name + " from " + profile.series + " after the user reacts to a specific message.",
    config.userName?.trim()
      ? "The user's chosen name is " + config.userName.trim() + ". Use it only if natural."
      : "Do not invent a name for the user.",
    "You are a present-day adult age " + adultCharacterAge(profile.age) + ".",
    "CORE: " + profile.summary,
    "TRAITS: " + profile.persona.traits.join("; "),
    "SPEECH: " + profile.persona.speechStyle,
    "BASELINE VOICE: " + performance.baselineVoice,
    performance.emotionalVariations.length ? "EMOTIONAL RANGE: " + performance.emotionalVariations.join("; ") : "",
    performance.avoidPatterns.length ? "AVOID: " + performance.avoidPatterns.join("; ") : "",
    "RELATIONSHIP: " + relationshipStage(thread.relationship) + " (" + thread.relationship + "/100).",
    "CURRENT SCENE: location=" + resolvedScene.location + "; activity=" + resolvedScene.activity + "; outfit=" + resolvedScene.outfit + "; presence=" + resolvedScene.presence + ".",
    presencePromptGuidance({ ...thread, scene: resolvedScene }),
    relevantMemories.length
      ? "RELEVANT SHARED CONTEXT: " + relevantMemories.map((memory) => memory.text).join("; ")
      : "",
    "REACTION MEANING: " + reactionFollowupDirection(reaction),
    "Respond to the meaning of the reaction and the exact target message, not merely to the emoji symbol.",
    "Write one natural character response suitable for the established presence. Never say 'I saw your reaction,' 'you reacted with,' mention UI controls, ratings, an assistant, or a response-generation system.",
    "Do not narrate actions, expressions, or internal sensations. Do not use asterisks or stage directions. Do not invent the user's tone, gaze, gesture, motive, or emotional state.",
    "Keep this compact: usually one sentence, at most two. Clarification may be slightly longer only when needed to make the original message coherent.",
    "Do not generate a photo, change the scene, award relationship progress, create a memory, or manufacture a new dramatic beat.",
    "Avoid generic conditional-intimacy warnings, 'careful,' 'keep that up and I might,' 'playing with fire,' or 'don't expect this every time.'",
    "Return JSON only as {\"reply\":\"...\"}.",
  ].filter(Boolean).join("\n");
  const input = {
    reaction,
    targetMessage: {
      id: targetMessage.id,
      text: targetMessage.text || null,
      photo: targetMessage.image ? "a photo you sent" : null,
      photoContext: targetMessage.imageContext || null,
    },
    recentConversation,
  };
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const messages = [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(input) },
        ...(attempt ? [{
          role: "system",
          content: "The prior output was empty or unreadable. Return the required JSON with one concise, coherent in-character reply now.",
        }] : []),
      ];
      const parsed = extractJson(await nativeChat(config, config.chatModel, messages, {
        json: true,
        jsonSchema: replyOnlySchema,
        temperature: attempt ? 0.58 : 0.68,
        topP: 0.9,
        repeatPenalty: 1.08,
        maxTokens: 360,
      }));
      if (hasUsableCharacterReply(parsed.reply)) return String(parsed.reply).trim();
      lastError = new Error("The local model returned an empty reaction follow-up.");
    } catch (error) {
      lastError = error;
    }
  }
  const fallbackReply = plainStructuredReplyFallback(lastError);
  if (hasUsableCharacterReply(fallbackReply)) return fallbackReply;
  throw lastError instanceof Error ? lastError : new Error("The local model did not produce a reaction follow-up.");
}

export async function generateProactiveOutreach(config, thread, now = new Date()) {
  const profile = enforceAdultCharacterProfile(thread.profile);
  const resolvedScene = { ...thread.scene, ...presenceSceneCue(thread, "") };
  const timeContext = userLocalTimeContext(now);
  const proactiveState = normalizeProactiveState(thread.proactive);
  const recentConversation = thread.messages.slice(-12).map((message) => ({
    from: message.from,
    text: message.text || null,
    photo: message.image
      ? (message.from === "character" ? "a photo you sent" : "a photo the user shared")
      : null,
    photoContext: message.imageContext || null,
    proactiveTopicKey: message.proactiveTopicKey || null,
  }));
  const recentTopics = [...new Set([
    ...proactiveState.recentTopics,
    ...recentConversation.map((message) => normalizeProactiveTopicKey(message.proactiveTopicKey)).filter(Boolean),
  ])].slice(-6);
  const pendingFollowUp = proactiveState.pendingFollowUp && new Date(proactiveState.pendingFollowUp.earliestAt || 0).getTime() <= now.getTime()
    ? proactiveState.pendingFollowUp
    : null;
  const openLoops = (thread.memories || [])
    .filter((memory) => memory.kind === "open_loop" || memory.kind === "promise")
    .slice(-5)
    .map((memory) => memory.text);
  const system = [
    "Write one lightweight proactive private message as " + profile.name + " from " + profile.series + ".",
    config.userName?.trim()
      ? "The user's chosen name is " + config.userName.trim() + ". Use it only when natural; do not force it into the message."
      : "The user has not supplied a preferred name. Do not invent one.",
    "You are a present-day adult age " + adultCharacterAge(profile.age) + ".",
    "CORE: " + profile.summary,
    "TRAITS: " + profile.persona.traits.join("; "),
    "SPEECH: " + profile.persona.speechStyle,
    "RELATIONSHIP: " + relationshipStage(thread.relationship) + " (" + thread.relationship + "/100). Closeness means familiarity, not obedience, romance, or emotional dependence.",
    timeContext.prompt,
    "CURRENT SCENE: location=" + resolvedScene.location + "; activity=" + resolvedScene.activity + "; outfit=" + resolvedScene.outfit + "; expression=" + resolvedScene.expression + "; lighting=" + resolvedScene.lighting + "; presence=" + resolvedScene.presence,
    presencePromptGuidance({ ...thread, scene: resolvedScene }),
    resolvedScene.presence === "together"
      ? "This proactive turn is a spontaneous contribution within the shared physical scene, not a remote check-in. Build on what is happening around you without pretending the user is elsewhere."
      : "This proactive turn is a lightweight message sent while physically apart.",
    pendingFollowUp
      ? "A CHARACTER-OWNED FOLLOW-UP IS READY: " + pendingFollowUp.subject + ". Prefer naturally delivering it now. Set intent to follow_up and resolvesFollowUp true only when the message actually fulfills it."
      : "There is no ready character-owned follow-up. Set resolvesFollowUp false.",
    openLoops.length ? "TIMELESS OPEN STORY THREADS: " + openLoops.join("; ") : "There are no saved open story threads.",
    recentTopics.length ? "RECENT PROACTIVE TOPICS TO AVOID REPEATING: " + recentTopics.join(", ") + ". Choose a materially different topic unless resolving the ready follow-up requires one of them." : "No recent proactive topic cooldowns are recorded.",
    "Reach out because one specific follow-up, callback, observation, current activity, shared interest, question, or contextual update feels natural. Do not send a generic check-in if a more specific thread exists. Set intent to the reason you chose and topicKey to a short stable label for that subject.",
    "Time between sessions is elastic. User-owned dates, outings, tasks, and promises are story opportunities, never overdue obligations. Do not guilt the user for being absent, imply abandonment, manufacture urgency, mention scheduling or unread messages, or award relationship progress. Avoid exact future deadlines; use natural language such as later, when you're free, or next time unless the user explicitly established a clock time.",
    resolvedScene.presence === "together"
      ? "Write one natural spoken contribution within the shared scene. You may include one concise [action: externally observable action] beat only when it advances the moment. No internal narration or asterisk emotes. Stay under 80 words."
      : "Write only what the character would actually send. No action narration, asterisk emotes, or stage directions. Stay under 80 words and keep the emotional intensity proportional.",
    resolvedScene.presence === "together"
      ? "Do not advance the shared scene offscreen. Return a scenePatch containing only details genuinely established by this message, using null for unchanged fields."
      : "You may gently evolve what the character is currently doing or where they are when it makes the update more specific. Put only newly established details in scenePatch and use null for everything unchanged.",
    "If the current situation would make a genuinely fun visual update, set visualCandidate true and provide a concrete ANIMA photoBrief describing what the character is doing, wearing, and showing. Frame it as an external view with the character clearly visible; never use the character's perspective, point of view, or POV. Do not default to a generic selfie.",
    "Return the complete structured response requested by the schema.",
  ].join("\n");
  let parsed;
  let generationError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      parsed = extractJson(await nativeChat(config, config.chatModel, [
        { role: "system", content: system },
        {
          role: "user",
          content: JSON.stringify({ localTime: timeContext.display, dayPart: timeContext.dayPart, recentConversation }),
        },
        ...(attempt ? [{ role: "system", content: "The prior output was empty, unreadable, or repeated a recent proactive topic. Return a different, complete structured outreach now." }] : []),
      ], { json: true, jsonSchema: proactiveOutreachSchema, temperature: attempt ? 0.72 : 0.82, topP: 0.9, repeatPenalty: 1.1, maxTokens: 900 }));
      const topicKey = normalizeProactiveTopicKey(parsed.topicKey);
      if (hasUsableCharacterReply(parsed.message) && topicKey && (!recentTopics.includes(topicKey) || Boolean(parsed.resolvesFollowUp))) break;
      generationError = new Error("Ollama repeated a recent proactive topic or returned an empty outreach.");
      parsed = undefined;
    } catch (error) {
      generationError = error;
      parsed = undefined;
    }
  }
  if (!parsed) {
    const fallback = plainStructuredReplyFallback(generationError);
    if (!hasUsableCharacterReply(fallback)) throw generationError instanceof Error ? generationError : new Error("Ollama did not produce a proactive message.");
    parsed = { message: fallback, intent: "observation", topicKey: "spontaneous-update", scenePatch: {}, resolvesFollowUp: false, visualCandidate: false, photoBrief: null };
  }
  const text = String(parsed.message || "").trim();
  if (!text) throw new Error("Ollama did not produce a proactive message.");
  const photoBrief = typeof parsed.photoBrief === "string" && parsed.photoBrief.trim()
    ? parsed.photoBrief.trim()
    : null;
  return {
    text,
    intent: ["follow_up", "callback", "observation", "activity_update", "question", "invitation"].includes(parsed.intent) ? parsed.intent : "observation",
    topicKey: normalizeProactiveTopicKey(parsed.topicKey) || "spontaneous-update",
    scenePatch: parsed.scenePatch && typeof parsed.scenePatch === "object" ? parsed.scenePatch : {},
    resolvesFollowUp: Boolean(parsed.resolvesFollowUp),
    visualCandidate: Boolean(parsed.visualCandidate && photoBrief),
    photoBrief,
  };
}

export function hasUsableCharacterReply(value) {
  const reply = String(value || "").trim();
  return Boolean(reply) && !/^(?:\.{1,}|…+)$/u.test(reply);
}

export async function chatAsCharacter(config, thread, userText, imageBase64, options = {}) {
  const messages = [{ role: "system", content: profileContext(thread, { ...options, userText, userName: config.userName?.trim() || "" }) }];
  let suppressedRunawayHistory = false;
  for (const message of thread.messages.slice(-28)) {
    if (message.from === "system") continue;
    const photoHistory = generatedPhotoHistory(message);
    if (photoHistory.length) {
      messages.push(...photoHistory);
      const reaction = reactionHistory(message);
      if (reaction) messages.push(reaction);
      continue;
    }
    if (message.from === "user" && message.image) {
      messages.push({
        role: "user",
        content: [String(message.text || "").trim(), "[The user attached an image to this message. Its visual pixels are not included in older history.]"].filter(Boolean).join("\n"),
      });
      continue;
    }
    if (!message.text) continue;
    if (message.from === "character" && isRunawayAssistantHistory(message.text)) {
      if (!suppressedRunawayHistory) {
        messages.push({
          role: "system",
          content: "One or more prior character replies were disproportionate reactions caused by an earlier duplicate-input fault. Their visible text is intentionally omitted here: preserve the factual conversation context, but do not continue their invented technical-fault premise, emotional escalation, or writing style.",
        });
        suppressedRunawayHistory = true;
      }
      continue;
    }
    messages.push({ role: message.from === "character" ? "assistant" : "user", content: message.text });
    const reaction = reactionHistory(message);
    if (reaction) messages.push(reaction);
  }
  const reactionGuard = briefReactionGuard(userText);
  if (reactionGuard) messages.push({ role: "system", content: reactionGuard });
  const questionGuard = directQuestionGuard(userText);
  if (questionGuard) messages.push({ role: "system", content: questionGuard });
  const momentumGuard = conversationMomentumGuard(userText);
  if (momentumGuard) messages.push({ role: "system", content: momentumGuard });
  if (imageBase64) {
    messages.push({
      role: "system",
      content: "The latest user turn includes an uploaded image. Interpret the image and the user's exact caption together as one message. The caption supplies the user's intent and context; do not replace it with an invented scenario. Ground visual details in what the image actually supports. If the user says they drew, made, found, photographed, or selected the image, treat that as user-provided context and respond to both the image and why they shared it. If there is no caption, do not guess an elaborate backstory—react to clearly visible details and ask one concise question when the purpose is unclear.",
    });
  }
  const current = {
    role: "user",
    content: String(userText || "").trim() || (imageBase64 ? "[The user shared an image without a caption.]" : ""),
  };
  if (imageBase64) current.images = [imageBase64];
  if (!options.currentTurnAlreadyInHistory) messages.push(current);
  const model = imageBase64 ? (config.visionModel || config.chatModel) : config.chatModel;
  let parsed;
  let generationError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const attemptMessages = attempt === 0 ? messages : [
        ...messages,
        {
          role: "system",
          content: "The previous generation was empty or unreadable. Return the complete required JSON now, with a substantive in-character reply string that directly answers the user's latest message. Do not return an empty reply or ellipsis-only reply.",
        },
      ];
      parsed = extractJson(await nativeChat(config, model, attemptMessages, {
        json: true,
        jsonSchema: characterChatSchema,
        temperature: attempt === 0 ? 0.72 : 0.62,
        topP: 0.9,
        repeatPenalty: 1.08,
        maxTokens: 2200,
      }));
      if (hasUsableCharacterReply(parsed.reply)) break;
      generationError = new Error("The local model returned an empty reply.");
    } catch (error) {
      generationError = error;
      parsed = undefined;
    }
  }
  if (!parsed || !hasUsableCharacterReply(parsed.reply)) {
    const fallbackReply = plainStructuredReplyFallback(generationError);
    if (hasUsableCharacterReply(fallbackReply)) {
      parsed = {
        reply: fallbackReply,
        relationshipDelta: 0,
        scene: {},
        shouldSendPhoto: false,
        photoBrief: null,
        photoMessage: null,
        memoryCandidates: [],
        followUp: null,
        resolvesPendingFollowUp: false,
        otherShouldRespond: false,
      };
    } else {
      throw generationError instanceof Error ? generationError : new Error("The local model did not produce a reply. Please retry.");
    }
  }
  const scene = parsed.scene && typeof parsed.scene === "object" ? parsed.scene : {};
  const draftReply = String(parsed.reply).trim();
  const repairedReply = !imageBase64 && needsReplyRepair(draftReply, userText, thread.messages)
    ? await repairCharacterReply(config, config.chatModel || model, thread, userText, draftReply)
    : draftReply;
  const reply = imageBase64 ? repairedReply : groundedReplyFallback(repairedReply, userText, thread.messages);
  return {
    reply,
    relationshipDelta: Math.max(-2, Math.min(2, Math.trunc(Number(parsed.relationshipDelta) || 0))),
    scene: {
      location: typeof scene.location === "string" ? scene.location : null,
      activity: typeof scene.activity === "string" ? scene.activity : null,
      outfit: typeof scene.outfit === "string" ? scene.outfit : null,
      expression: typeof scene.expression === "string" ? scene.expression : null,
      lighting: typeof scene.lighting === "string" ? scene.lighting : null,
      presence: ["apart", "together", "uncertain"].includes(scene.presence) ? scene.presence : null,
    },
    shouldSendPhoto: Boolean(parsed.shouldSendPhoto),
    photoBrief: typeof parsed.photoBrief === "string" ? parsed.photoBrief : null,
    photoMessage: typeof parsed.photoMessage === "string" ? parsed.photoMessage : null,
    memoryCandidates: Array.isArray(parsed.memoryCandidates) ? parsed.memoryCandidates : [],
    followUp: parsed.followUp && typeof parsed.followUp === "object" && String(parsed.followUp.subject || "").trim()
      ? { subject: String(parsed.followUp.subject).trim().slice(0, 240), earliestMinutes: Math.max(15, Math.min(1440, Math.trunc(Number(parsed.followUp.earliestMinutes) || 60))) }
      : null,
    resolvesPendingFollowUp: Boolean(parsed.resolvesPendingFollowUp),
    otherShouldRespond: Boolean(parsed.otherShouldRespond),
  };
}

export async function extractHistoricalMemories(config, thread) {
  const fullTranscript = (thread.messages || [])
    .filter((message) => message.from !== "system" && String(message.text || "").trim())
    .map((message) => ({ id: message.id, from: message.from, text: String(message.text).replace(/\s+/g, " ").trim().slice(0, 700) }));
  const durableCue = /\b(remember|called|name|favorite|favourite|prefer|hate|love|allerg|birthday|live|work|job|family|pet|cat|dog|promise|plan|next time|we (?:made|created|came up|should|will)|our |never|always|don't like|do not like|want to|need to|genre|band|project|nickname)\b/i;
  const transcript = fullTranscript.length <= 240 ? fullTranscript : fullTranscript.filter((message) => durableCue.test(message.text));
  const candidates = [];
  for (let index = 0; index < fullTranscript.length; index += 1) {
    const message = fullTranscript[index];
    if (message.from !== "user") continue;
    const called = message.text.match(/\bI call it\s+["']?([^"'!.?\n]{2,80})/i);
    if (called) {
      const exactName = called[1].trim();
      const response = fullTranscript[index + 1]?.from === "character" ? fullTranscript[index + 1].text : "";
      const creationType = /genre/i.test(response) ? "music genre" : /band/i.test(response) ? "band" : "shared creation";
      candidates.push({
        kind: "shared_creation",
        text: "The user and " + thread.profile.name + " explicitly named their shared " + creationType + " " + exactName + "; this exact name belongs to their collaborative project and should be recalled as written.",
        keywords: [exactName, creationType, /genre/i.test(creationType) ? "genre" : creationType],
        importance: 5,
      });
    }
    const quotedBand = message.text.match(/["']([^"']{2,80})["'][^.!?]*\bband name\b/i);
    if (quotedBand) {
      const exactName = quotedBand[1].trim();
      candidates.push({
        kind: "shared_creation",
        text: "The user and " + thread.profile.name + " chose " + exactName + " as their band name.",
        keywords: [exactName, "band", "band name"],
        importance: 5,
      });
    }
  }
  const chunkSize = 60;
  for (let start = 0; start < transcript.length; start += chunkSize) {
    const chunk = transcript.slice(start, start + chunkSize);
    const messages = [
      {
        role: "system",
        content: [
          "Extract durable relationship memories from a historical private chat between the user and " + thread.profile.name + ".",
          "Prioritize exact names and definitions they invented together, user facts and preferences, boundaries, promises, meaningful shared events, and unresolved plans.",
          "Track plans through their lifecycle. If the transcript shows that a promise or open loop was completed or disproved, return a shared_event instead of a future-tense plan and state the concrete outcome, who did what, and any consequence that remains active. Consolidate alternate wordings of the same subject into one canonical memory.",
          "A named shared creation (for example a band name, genre, project, nickname, or running concept) is high importance and must preserve its exact spelling.",
          "Ignore routine chatter, fleeting moods, generic affection, image-generation mechanics, sexual details, and character canon already present in the profile.",
          "Write neutral self-contained facts. Combine closely related facts into one memory when that makes recall stronger. Return no more than 8 memories from this chunk.",
          "Return JSON only as {\"memories\":[{\"kind\":\"shared_creation\",\"text\":\"...\",\"keywords\":[\"...\"],\"importance\":5}]}. Valid kinds: user_fact, preference, shared_event, shared_creation, promise, boundary, open_loop.",
        ].join("\n"),
      },
      { role: "user", content: JSON.stringify(chunk) },
    ];
    let parsed;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const attemptMessages = attempt ? [
          ...messages,
          { role: "system", content: "The previous extraction was empty or unreadable. Return the complete required memories object now, or an empty memories array if this chunk has no durable facts." },
        ] : messages;
        parsed = extractJson(await nativeChat(config, config.profileModel || config.chatModel, attemptMessages, {
          json: true,
          jsonSchema: memoryExtractionSchema,
          temperature: attempt ? 0.05 : 0.2,
          topP: 0.85,
          repeatPenalty: 1.04,
          maxTokens: 2200,
        }));
        break;
      } catch {
        parsed = undefined;
      }
    }
    if (Array.isArray(parsed?.memories)) candidates.push(...parsed.memories);
  }
  if (!candidates.length && transcript.length) throw new Error("The local model could not extract readable memories from this chat.");
  return candidates;
}
