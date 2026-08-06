const stringSchema = { type: "string" };
const stringArraySchema = { type: "array", items: stringSchema };
export const nullableStringSchema = { anyOf: [stringSchema, { type: "null" }] };

export const sceneSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    location: nullableStringSchema,
    activity: nullableStringSchema,
    outfit: nullableStringSchema,
    expression: nullableStringSchema,
    lighting: nullableStringSchema,
    presence: {
      anyOf: [
        { type: "string", enum: ["apart", "together", "uncertain"] },
        { type: "null" },
      ],
    },
  },
  required: ["location", "activity", "outfit", "expression", "lighting", "presence"],
};

export const memoryCandidateSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: ["user_fact", "preference", "shared_event", "shared_creation", "promise", "boundary", "open_loop"],
    },
    text: stringSchema,
    keywords: stringArraySchema,
    importance: { type: "integer", minimum: 1, maximum: 5 },
  },
  required: ["kind", "text", "keywords", "importance"],
};

export const replyOnlySchema = {
  type: "object",
  additionalProperties: false,
  properties: { reply: stringSchema },
  required: ["reply"],
};

export const profileGuideSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    baselineVoice: stringSchema,
    emotionalVariations: stringArraySchema,
    signatureAccents: stringArraySchema,
    avoidPatterns: stringArraySchema,
    exampleLines: stringArraySchema,
    selfConcept: stringArraySchema,
    competencies: stringArraySchema,
    vulnerabilityMap: stringArraySchema,
    relationshipProgression: stringArraySchema,
    conversationHabits: stringArraySchema,
    mischaracterizations: stringArraySchema,
    initiativeSeeds: stringArraySchema,
    deepeningPaths: stringArraySchema,
  },
  required: [
    "baselineVoice", "emotionalVariations", "signatureAccents", "avoidPatterns", "exampleLines",
    "selfConcept", "competencies", "vulnerabilityMap", "relationshipProgression", "conversationHabits",
    "mischaracterizations", "initiativeSeeds", "deepeningPaths",
  ],
};

export const characterProfileSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    age: { type: "integer", minimum: 18 },
    status: stringSchema,
    summary: stringSchema,
    openingLine: stringSchema,
    socialIdentity: {
      type: "object",
      additionalProperties: false,
      properties: { gender: stringSchema, pronouns: stringSchema, selfReference: stringSchema },
      required: ["gender", "pronouns", "selfReference"],
    },
    visual: {
      type: "object",
      additionalProperties: false,
      properties: {
        identity: stringArraySchema,
        signature: stringArraySchema,
        defaultWardrobe: stringSchema,
        wardrobePreferences: stringArraySchema,
      },
      required: ["identity", "signature", "defaultWardrobe", "wardrobePreferences"],
    },
    persona: {
      type: "object",
      additionalProperties: false,
      properties: {
        traits: stringArraySchema,
        mannerisms: stringArraySchema,
        speechStyle: stringSchema,
        ...profileGuideSchema.properties,
        emotionalRules: stringArraySchema,
      },
      required: [
        "traits", "mannerisms", "speechStyle", "emotionalRules",
        ...profileGuideSchema.required,
      ],
    },
    canon: {
      type: "object",
      additionalProperties: false,
      properties: {
        overview: stringSchema,
        history: stringArraySchema,
        relationships: stringArraySchema,
        knowledge: stringArraySchema,
        boundaries: stringArraySchema,
      },
      required: ["overview", "history", "relationships", "knowledge", "boundaries"],
    },
  },
  required: ["age", "status", "summary", "openingLine", "socialIdentity", "visual", "persona", "canon"],
};

export const memoryExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    memories: { type: "array", maxItems: 8, items: memoryCandidateSchema },
  },
  required: ["memories"],
};

const softFollowUpSchema = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        subject: stringSchema,
        earliestMinutes: { type: "integer", minimum: 15, maximum: 1440 },
      },
      required: ["subject", "earliestMinutes"],
    },
    { type: "null" },
  ],
};

export const characterChatSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: stringSchema,
    relationshipDelta: { type: "integer", minimum: -2, maximum: 2 },
    scene: sceneSchema,
    shouldSendPhoto: { type: "boolean" },
    photoBrief: nullableStringSchema,
    photoMessage: nullableStringSchema,
    memoryCandidates: { type: "array", items: memoryCandidateSchema },
    followUp: softFollowUpSchema,
    resolvesPendingFollowUp: { type: "boolean" },
  },
  required: [
    "reply", "relationshipDelta", "scene", "shouldSendPhoto", "photoBrief", "photoMessage",
    "memoryCandidates", "followUp", "resolvesPendingFollowUp",
  ],
};

export const proactiveOutreachSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    message: stringSchema,
    intent: {
      type: "string",
      enum: ["follow_up", "callback", "observation", "activity_update", "question", "invitation"],
    },
    topicKey: stringSchema,
    scenePatch: sceneSchema,
    resolvesFollowUp: { type: "boolean" },
    visualCandidate: { type: "boolean" },
    photoBrief: nullableStringSchema,
  },
  required: ["message", "intent", "topicKey", "scenePatch", "resolvesFollowUp", "visualCandidate", "photoBrief"],
};
