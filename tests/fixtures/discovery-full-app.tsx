import React from "react";
import { createRoot } from "react-dom/client";
import { AniMessengerApp } from "../../src/App";
import { api, Thread, AppConfig } from "../../src/api";
import "../../app/globals.css";
import "../../src/local.css";
import "../../src/character-dossier.css";

// The real App, with every transport disabled before rendering. No saved chats,
// discovery awards, image jobs or production acknowledgements can be touched.
for (const key of Object.keys(api)) (api as any)[key] = async () => { throw Error(`Fixture blocks ${key}`); };
window.fetch = async () => { throw Error("Fixture blocks network requests"); };
const run = Date.now();
const thread = {
  id: `full-app-fixture-${run}`, character: { id: "fixture", name: "Test character", series: "Test only", tags: [], trigger: "fixture" },
  profile: { id: "fixture", name: "Test character", series: "Test only", age: 25, status: "ready", summary: "A simulated character for notification testing.",
    visual: { identity: [], signature: [], defaultWardrobe: "casual clothes", wardrobePreferences: [] },
    persona: { traits: ["Bright", "Cheerful", "Sociable"], mannerisms: [], speechStyle: "Friendly", emotionalRules: [], exampleLines: [] },
    canon: { overview: "Test only", history: [], relationships: [], knowledge: [], boundaries: [] }, sources: [] },
  messages: Array.from({ length: 25 }, (_, i) => ({ id: `message-${i}`, role: i % 2 ? "assistant" : "user", text: `Simulated story paragraph ${i}. This exercises the real scrolling chat layout.`, createdAt: new Date().toISOString() })),
  memories: [], relationship: 95, conversationMode: "story", scene: { location: "test room", activity: "talking", outfit: "casual clothes", expression: "smiling", lighting: "daylight" }, updatedAt: new Date().toISOString(),
} as Thread;
let pending = [{ id: `full-app-unlock-${run}`, discoveryId: "test", title: "Simulated discovery", bondReward: 5 }];
let slow = false;
let offline = false;
api.threads = async () => ({ threads: [thread] });
api.thread = async () => ({ thread: { ...thread } });
api.markRead = api.thread;
api.config = async () => ({ chatModel: "fixture", soundEnabled: false, proactiveEnabled: false } as AppConfig);
api.health = async () => ({ ok: true, ollama: true, comfy: true, animadex: true });
api.discoveryUnlocks = async () => {
  const snapshot = [...pending];
  if (slow) await new Promise(resolve => window.setTimeout(resolve, 3500));
  return { unlocks: snapshot };
};
api.acknowledgeDiscoveryUnlock = async (_, id) => {
  if (offline) throw Error("Simulated offline acknowledgement");
  pending = pending.filter(item => item.id !== id);
  return { unlocks: pending };
};
function Controls() {
  const [status, setStatus] = React.useState("No test run yet");
  return <aside style={{ position: "fixed", bottom: 0, left: 0, zIndex: 9999, background: "#20282b", padding: 8 }}>
    <button onClick={() => { slow = !slow; setStatus(`Slow poll: ${slow}`); }}>Toggle delayed poll</button>
    <button onClick={() => { offline = !offline; setStatus(`Offline acknowledgement: ${offline}`); }}>Toggle offline acknowledgement</button>
    <button onClick={async () => {
      const button = document.querySelector<HTMLButtonElement>('[aria-label="Dismiss discovery notification"]');
      if (!button) { setStatus("Open the test chat and wait for the popup first"); return; }
      button.click();
      await new Promise(resolve => window.setTimeout(resolve, 100));
      const immediate = document.querySelectorAll(".discovery-unlocked").length;
      await new Promise(resolve => window.setTimeout(resolve, 7000));
      const late = document.querySelectorAll(".discovery-unlocked").length;
      setStatus(immediate === 0 && late === 0 ? "PASS: gone immediately and after polling" : `FAIL: immediate=${immediate}, after polling=${late}`);
    }}>Run dismissal regression</button>
    <button onClick={() => {
      pending = [{ id: `full-app-unlock-${Date.now()}`, discoveryId: "test", title: "Simulated discovery", bondReward: 5 }];
      setStatus("New simulated notification queued");
    }}>Queue simulated unlock</button>
    <output style={{ display: "block", color: "white" }}>{status}</output>
  </aside>;
}
createRoot(document.getElementById("fixture-controls")!).render(<Controls />);
createRoot(document.getElementById("root")!).render(<React.StrictMode><AniMessengerApp /></React.StrictMode>);
