const stringSchema = { type: "string" };
const stringArraySchema = { type: "array", items: stringSchema };
export const nullableStringSchema = { anyOf: [stringSchema, { type: "null" }] };

export const sceneSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    location: nullableStringSchema,
    environment: nullableStringSchema,
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
  required: ["location", "environment", "activity", "outfit", "expression", "lighting", "presence"],
};

export const firstContactScenarioSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: stringSchema,
    premise: stringSchema,
    contactMode: { type: "string", enum: ["remote", "in_person", "world_link"] },
    connection: stringSchema,
    scene: sceneSchema,
    openingLine: stringSchema,
  },
  required: ["title", "premise", "contactMode", "connection", "scene", "openingLine"],
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
    characterTensions: stringArraySchema,
  },
  required: [
    "baselineVoice", "emotionalVariations", "signatureAccents", "avoidPatterns", "exampleLines",
    "selfConcept", "competencies", "vulnerabilityMap", "relationshipProgression", "conversationHabits",
    "mischaracterizations", "initiativeSeeds", "deepeningPaths", "characterTensions",
  ],
};

export const profileRepairSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: stringSchema,
    traits: stringArraySchema,
    mannerisms: stringArraySchema,
    speechStyle: stringSchema,
    emotionalRules: stringArraySchema,
    ...profileGuideSchema.properties,
  },
  required: [
    "summary", "traits", "mannerisms", "speechStyle", "emotionalRules",
    ...profileGuideSchema.required,
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
    memories: {
      type: "array",
      maxItems: 8,
      items: {
        ...memoryCandidateSchema,
        properties: {
          ...memoryCandidateSchema.properties,
          sourceMessageIds: stringArraySchema,
          eventAt: nullableStringSchema,
        },
        required: [...memoryCandidateSchema.required, "sourceMessageIds", "eventAt"],
      },
    },
  },
  required: ["memories"],
};

export const checkpointMemoryExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    memories: {
      type: "array",
      maxItems: 6,
      items: {
        ...memoryCandidateSchema,
        properties: {
          ...memoryCandidateSchema.properties,
          sourceMessageIds: stringArraySchema,
          eventAt: nullableStringSchema,
          action: { type: "string", enum: ["add", "update", "resolve"] },
          targetMemoryId: nullableStringSchema,
          evidenceMessageId: { type: "string" },
          evidenceQuote: { type: "string", minLength: 8, maxLength: 500 },
        },
        required: [...memoryCandidateSchema.required, "sourceMessageIds", "eventAt", "action", "targetMemoryId", "evidenceMessageId", "evidenceQuote"],
      },
    },
  },
  required: ["memories"],
};

export const memoryRecallSelectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    memoryIds: { type: "array", maxItems: 8, items: stringSchema },
  },
  required: ["memoryIds"],
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

const sceneEvidenceItemSchema = {
  anyOf: [{
    type: "object",
    additionalProperties: false,
    properties: {
      quote: stringSchema,
      source: { type: "string", enum: ["user", "character"] },
      phase: { type: "string", enum: ["current", "planned", "negated"] },
      actor: { type: "string", enum: ["user", "character", "shared"] },
    },
    required: ["quote", "source", "phase", "actor"],
  }, { type: "null" }],
};

export const sceneEvidenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: Object.fromEntries(["location", "environment", "activity", "outfit", "expression", "lighting", "presence", "posture"].map((field) => [field, sceneEvidenceItemSchema])),
  required: ["location", "environment", "activity", "outfit", "expression", "lighting", "presence", "posture"],
};

const finalChatSceneSchema = {
  ...sceneSchema,
  properties: {
    ...sceneSchema.properties,
    posture: { anyOf: [{ type: "string", enum: ["standing", "seated", "lying", "kneeling", "crouching", "unknown"] }, { type: "null" }] },
  },
  required: [...sceneSchema.required, "posture"],
};

export const characterChatSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    narration: nullableStringSchema,
    reply: stringSchema,
    relationshipDelta: { type: "integer", minimum: -2, maximum: 2 },
    scene: finalChatSceneSchema,
    sceneEvidence: sceneEvidenceSchema,
    shouldSendPhoto: { type: "boolean" },
    photoBrief: nullableStringSchema,
    photoOutfit: nullableStringSchema,
    photoMessage: nullableStringSchema,
    memoryCandidates: { type: "array", items: memoryCandidateSchema },
    achievementSignals: {
      type: "array", maxItems: 5,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          id: { type: "string", enum: ["shared-laughter", "new-horizons", "time-well-spent", "heartfelt"] },
          event: { type: "string", enum: ["laughter", "arrival", "shared_activity", "feelings"] },
          subject: nullableStringSchema,
          occasion: nullableStringSchema,
          actor: { type: "string", enum: ["shared"] },
          phase: { type: "string", enum: ["completed"] },
          evidence: { type: "array", minItems: 1, maxItems: 3, items: {
            type: "object", additionalProperties: false,
            properties: { source: { type: "string", enum: ["user", "character"] }, quote: { type: "string", minLength: 8, maxLength: 400 } },
            required: ["source", "quote"],
          } },
        },
        required: ["id", "event", "subject", "occasion", "actor", "phase", "evidence"],
      },
    },
    followUp: softFollowUpSchema,
    resolvesPendingFollowUp: { type: "boolean" },
    otherShouldRespond: { type: "boolean" },
  },
  required: [
    "narration", "reply", "relationshipDelta", "scene", "sceneEvidence", "shouldSendPhoto", "photoBrief", "photoOutfit", "photoMessage",
    "memoryCandidates", "achievementSignals", "followUp", "resolvesPendingFollowUp", "otherShouldRespond",
  ],
};

const { reply: _storyReply, ...storyChatProperties } = characterChatSchema.properties;
export const storyCharacterChatSchema = {
  ...characterChatSchema,
  properties: { ...storyChatProperties, narration: stringSchema },
  required: characterChatSchema.required.filter((field) => field !== "reply"),
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
    photoOutfit: nullableStringSchema,
  },
  required: ["message", "intent", "topicKey", "scenePatch", "resolvesFollowUp", "visualCandidate", "photoBrief", "photoOutfit"],
};
