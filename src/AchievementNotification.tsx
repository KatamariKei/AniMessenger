import { ReactNode, useEffect, useRef, useState } from "react";
import { api, AppConfig, Thread } from "./api";
import { playSound } from "./sound";
import { discoveryNotificationPoller as poller } from "../shared/polling.mjs";
import { createDiscoveryDismissals } from "../shared/discovery-dismissals.mjs";
import { discoveryDismissalReceipts, discoveryQuietUntil } from "./DiscoveryNotification";

type Unlock = { id: string; title: string; points: number };
const heard = new Set<string>();
const receipts = createDiscoveryDismissals({ key: "animessenger.achievement-dismissals.v1", storage: (() => {
  try { return window.localStorage; } catch { return undefined; }
})() });

export function AchievementNotification({ thread, characterName, portrait, config, paused }: {
  thread: Thread; characterName: string; portrait: ReactNode; config: AppConfig | null;
  paused: boolean;
}) {
  const [unlocks, setUnlocks] = useState<Unlock[]>([]);
  const [visible, setVisible] = useState(!document.hidden);
  const [readyAt, setReadyAt] = useState<number | null>(null);
  const [released, setReleased] = useState(false);
  const awaitingDiscoveries = useRef<string[]>([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const acknowledge = (threadId: string, id: string) => api.acknowledgeAchievement(threadId, id);

  useEffect(() => {
    let current = true;
    const poll = async () => {
      void receipts.flush(thread.id, acknowledge);
      if (document.hidden || pausedRef.current) return;
      const result = await poller.run(`achievement:${thread.id}`, () => api.achievementUnlocks(thread.id));
      if (current && result.status === "success") {
        const pending = result.value.unlocks.filter(item => !receipts.has(item.id));
        // Check discoveries AFTER receiving awards: independent polling must
        // not let the three-discovery award overtake its triggering discovery.
        if (pending.length) {
          try {
            const discoveries = await api.discoveryUnlocks(thread.id);
            if (!current) return;
            const waiting = discoveries.unlocks.filter(item => !discoveryDismissalReceipts.has(item.id));
            if (waiting.length) {
              awaitingDiscoveries.current = waiting.map(item => item.id);
              setUnlocks(pending.filter(item => !receipts.has(item.id)));
              setReadyAt(null);
              setReleased(false);
              return;
            }
          } catch { return; } // No confirmed clear queue, no early celebration.
        }
        if (!current) return;
        awaitingDiscoveries.current = [];
        setUnlocks(() => {
          // Check receipts at commit time so a late request cannot restore a dismissal.
          return result.value.unlocks.filter(item => !receipts.has(item.id));
        });
        setReadyAt(value => pending.length ? value ?? Date.now() + 2000 : null);
      }
    };
    const visibility = () => setVisible(!document.hidden);
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [thread.id]);

  useEffect(() => {
    // Local dismissal can release the queued award immediately after the
    // quiet interval, without waiting for another throttled server poll.
    if (!paused && visible && readyAt === null && unlocks.length && awaitingDiscoveries.current.length
      && awaitingDiscoveries.current.every(id => discoveryDismissalReceipts.has(id))) {
      setReadyAt(Math.max(Date.now(), discoveryQuietUntil(thread.id)));
    }
  }, [paused, visible, readyAt, unlocks, thread.id]);

  useEffect(() => {
    setReleased(false);
    if (paused || !visible || readyAt === null) return;
    const delay = Math.max(0, readyAt - Date.now(), discoveryQuietUntil(thread.id) - Date.now());
    const timer = window.setTimeout(() => setReleased(true), delay);
    return () => window.clearTimeout(timer);
  }, [readyAt, paused, visible, thread.id]);

  useEffect(() => {
    if (paused || !released || !visible || !unlocks.some(item => !heard.has(item.id))) return;
    if (playSound("bond-celebration", { enabled: config?.soundEnabled ?? false, volume: config?.soundVolume ?? 0.35 })) {
      unlocks.forEach(item => heard.add(item.id));
    }
  }, [unlocks, paused, released, visible, config?.soundEnabled, config?.soundVolume]);

  const dismiss = () => {
    unlocks.forEach(item => receipts.dismiss(thread.id, item.id));
    setUnlocks([]);
    setReadyAt(null);
    setReleased(false);
    void receipts.flush(thread.id, acknowledge);
  };
  if (!unlocks.length || paused || !released || !visible) return null;
  return <div className="discovery-unlocked achievement-unlocked" role="status" aria-live="polite" style={{ "--bond-color": "#72dcd0" } as React.CSSProperties}>
    {portrait}
    <span><small>{unlocks.length > 1 ? "Achievements complete" : "Achievement complete"}</small>
      <strong>{unlocks.map(item => item.title).join(" · ")}</strong>
      <b>{characterName} · +{unlocks.reduce((sum, item) => sum + item.points, 0)} achievement points</b>
    </span>
    <button type="button" aria-label="Dismiss achievement notification" onClick={event => { event.stopPropagation(); dismiss(); }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </div>;
}
