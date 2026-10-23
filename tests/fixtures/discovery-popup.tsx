import React from "react";
import { createRoot } from "react-dom/client";
import { DiscoveryNotification } from "../../src/DiscoveryNotification";
import { api, Thread } from "../../src/api";
import "../../app/globals.css";
import "../../src/local.css";

// Isolated UI regression: no real chat, acknowledgement, or server writes.
const run = Date.now();
const thread = { id: `popup-fixture-${run}` } as Thread;
const unlocks = [1, 2].map(index => ({ id: `fixture-${run}-${index}`, discoveryId: `test-${index}`, title: `Test discovery ${index}`, bondReward: 5 }));
api.discoveryUnlocks = async () => ({ unlocks });
api.acknowledgeDiscoveryUnlock = async () => { throw new Error("Simulated offline acknowledgement"); };
api.thread = async () => ({ thread });
createRoot(document.getElementById("root")!).render(<React.StrictMode>
  <main className="chat-panel" style={{ width: "100%", height: "90vh", position: "relative" }}>
    <h1>Discovery dismissal regression</h1><p>The close button must hide each popup despite failed acknowledgements.</p>
    <DiscoveryNotification thread={thread} characterName="Fixture character" portrait={<div className="portrait">★</div>} config={null} paused={false} onThreadUpdated={() => {}} />
  </main>
</React.StrictMode>);
