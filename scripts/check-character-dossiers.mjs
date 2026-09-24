import { researchCharacter } from "../server/research.mjs";
import { buildDossier } from "../server/character-dossier.mjs";
import { readConfig } from "../server/config.mjs";
import { buildCharacterProfile } from "../server/ollama.mjs";

// Read-only trials: never save a profile or modify a conversation.
const config = await readConfig();
const characters = [
  { name: "Erica Anderson", series: "Catherine" },
  { name: "Rin", series: "Catherine" },
  { name: "Triss Merigold", series: "The Witcher" },
];
for (const character of characters) {
  if (process.argv.includes("--profile") && character.name !== "Erica Anderson") continue;
  const started = Date.now();
  const research = await researchCharacter(character);
  if (process.argv.includes("--profile")) {
    const profile = await buildCharacterProfile(config, { ...character, id: "isolated-erica", tags: [], trigger: "erica_anderson" }, research, (stage) => console.log("Stage: " + stage));
    console.log(JSON.stringify({ elapsedMs: Date.now() - started, summary: profile.summary, identity: profile.socialIdentity, canon: profile.canon, personality: profile.persona.traits }));
    continue;
  }
  const dossier = await buildDossier(character, research, async (messages, schema, maxTokens) => {
    const response = await fetch(config.ollamaUrl + "/api/chat", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: config.profileModel || config.chatModel, messages, stream: false, think: false, format: schema, options: { temperature: 0.1, num_predict: maxTokens } }),
      signal: AbortSignal.timeout(240000),
    });
    if (!response.ok) throw new Error("Ollama HTTP " + response.status);
    const payload = await response.json();
    return JSON.parse(payload.message.content);
  });
  console.log(JSON.stringify({ character: character.name, elapsedMs: Date.now() - started, sources: research.evidence.diagnostics, dossier }));
}
