import readline from "node:readline/promises";
import process from "node:process";
import { readConfig } from "../server/config.mjs";
import { appendCameoMessage, beginCameoSession, cameoPromptContext, routeCameoSpeakers, threadForCameoSpeaker } from "../server/guest-cameo.mjs";
import { chatAsCharacter } from "../server/ollama.mjs";
import { loadProfile, loadThread } from "../server/store.mjs";

function argument(name, fallback = "") {
  const index = process.argv.indexOf("--" + name);
  return index >= 0 ? String(process.argv[index + 1] || "") : fallback;
}

const hostId = argument("host", "misty_(pokemon)");
const guestId = argument("guest", "jessie_(pokemon)");
const location = argument("location", "a casual ramen restaurant");
const activity = argument("activity", "sharing a table and talking");

const [config, hostThread, guestThread, guestProfile] = await Promise.all([
  readConfig(),
  loadThread(hostId),
  loadThread(guestId),
  loadProfile(guestId),
]);

if (!hostThread?.profile) throw new Error("Cached host thread/profile not found: " + hostId);
if (!guestThread?.character || !guestProfile) throw new Error("Cached guest character/profile not found: " + guestId);
if (!config.chatModel) throw new Error("Choose a chat model in AniMessenger Settings first.");

let session = beginCameoSession({
  hostThread,
  guestCharacter: guestThread.character,
  guestProfile,
  location,
  activity,
});

const speakers = new Map([
  [session.host.character.id, session.host],
  [session.guest.character.id, session.guest],
]);

console.log("\nAniMessenger guest cameo prototype");
console.log("Host: " + session.host.profile.name + " | Guest: " + session.guest.profile.name);
console.log("Scene: " + location + " — " + activity);
console.log("This harness does not save chats, memories, relationships, images, or proactive state.");
console.log("Type /exit to finish.\n");

const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
try {
  while (true) {
    const userText = (await terminal.question("You: ")).trim();
    if (!userText) continue;
    if (["/exit", "/quit"].includes(userText.toLowerCase())) break;

    const routed = routeCameoSpeakers({
      text: userText,
      host: session.host.character,
      guest: session.guest.character,
      lastSpeakerId: session.lastSpeakerId,
    });
    const turnSession = appendCameoMessage(session, { from: "user", text: userText });
    let working = turnSession;
    for (const speakerId of routed) {
      const speaker = speakers.get(speakerId);
      const contextThread = threadForCameoSpeaker(working, speakerId);
      const startedAt = performance.now();
      const result = await chatAsCharacter(config, contextThread, userText, null, {
        currentTurnAlreadyInHistory: true,
        extraSystemContext: cameoPromptContext(working, speakerId),
        photoOpportunity: false,
      });
      const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
      working = appendCameoMessage(working, { from: "character", speakerId, text: result.reply });
      console.log((speaker?.profile?.name || speaker?.character?.name || speakerId) + " [" + elapsed + "s]: " + result.reply);
    }
    session = working;
    console.log();
  }
} finally {
  terminal.close();
}

console.log("Prototype ended. Nothing was written to your AniMessenger chats.");
