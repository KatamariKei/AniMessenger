import { useImmersiveNoticeOwner } from "./immersive-notice-owner";
import { ReactNode, useEffect, useRef, useState } from "react";
import { api, AppConfig, DiscoveryUnlock, Thread } from "./api";
import { playSound } from "./sound";
import { discoveryNotificationPoller as notificationPoller } from "../shared/polling.mjs";
import { createDiscoveryDismissals } from "../shared/discovery-dismissals.mjs";
import { createDiscoveryDiagnostics } from "../shared/discovery-diagnostics.mjs";

const diagnostics = createDiscoveryDiagnostics({ storage: (() => {
  try { return window.sessionStorage; } catch { return undefined; }
})() });
let nextInstance = 0;

const refreshedUnlocks = new Set<string>();
const heardUnlocks = new Set<string>();
export const discoveryDismissalReceipts = createDiscoveryDismissals({ storage: (() => {
  try { return window.localStorage; } catch { return undefined; }
})() });
const dismissalReceipts = discoveryDismissalReceipts;
const lastDismissed = new Map<string, number>();
export function discoveryQuietUntil(threadId: string) { return (lastDismissed.get(threadId) || 0) + 2000; }

export function DiscoveryNotification({ thread, characterName, portrait, config, paused, onThreadUpdated, onPendingChange }: {
  thread: Thread; characterName: string; portrait: ReactNode; config: AppConfig | null;
  paused: boolean; onThreadUpdated: (thread: Thread) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  paused = useImmersiveNoticeOwner(thread.id) || paused;
  const [unlock, setUnlock] = useState<DiscoveryUnlock | null>(null);
  const instance = useRef(0);
  if (!instance.current) instance.current = ++nextInstance;
  const popup = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!document.hidden);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const refreshThread = useRef(onThreadUpdated);
  refreshThread.current = onThreadUpdated;
  useEffect(() => { onPendingChange?.(Boolean(unlock)); }, [unlock?.id, onPendingChange]);
  useEffect(() => () => onPendingChange?.(false), [thread.id, onPendingChange]);

  useEffect(() => {
    diagnostics.record("mount", { instance: instance.current, threadId: thread.id });
    return () => diagnostics.record("unmount", { instance: instance.current, threadId: thread.id });
  }, [thread.id]);

  useEffect(() => {
    diagnostics.record("commit", { instance: instance.current, unlockId: unlock?.id || null,
      paused, visible, nodes: document.querySelectorAll(".discovery-unlocked").length });
  }, [unlock, paused, visible]);

  useEffect(() => {
    let current = true;
    const poll = async () => {
      void dismissalReceipts.flush(thread.id, acknowledge);
      if (document.hidden || pausedRef.current) return;
      const result = await notificationPoller.run(`discovery:${thread.id}`, () => api.discoveryUnlocks(thread.id));
      if (result.status === "success") {
        diagnostics.record("poll", { instance: instance.current, current,
          returned: result.value.unlocks.length,
          pending: result.value.unlocks.filter(item => !dismissalReceipts.has(item.id)).length });
        if (current) {
          setUnlock(value => {
            // Read receipts when React applies the update, not before it queues
            // it: a late poll must never restore a just-dismissed notification.
            const pending = result.value.unlocks.filter(item => !dismissalReceipts.has(item.id));
            return value && pending.some(item => item.id === value.id) ? value : pending[0] || null;
          });
        }
      }
      // Failures retain unread UI; the shared gate backs off to at most one request/minute.
    };
    const visibility = () => setVisible(!document.hidden);
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    document.addEventListener("visibilitychange", visibility);
    return () => { current = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [thread.id]);

  const acknowledge = async (threadId: string, id: string) => {
    diagnostics.record("ack-start", { instance: instance.current, unlockId: id });
    try {
      await api.acknowledgeDiscoveryUnlock(threadId, id);
      diagnostics.record("ack-success", { instance: instance.current, unlockId: id });
    } catch (error) {
      diagnostics.record("ack-failure", { instance: instance.current, unlockId: id });
      throw error;
    }
  };

  useEffect(() => {
    if (!unlock || paused || !visible || heardUnlocks.has(unlock.id)) return;
    const played = playSound("discovery-unlock",
      { enabled: config?.soundEnabled ?? false, volume: config?.soundVolume ?? 0.35 });
    if (played) heardUnlocks.add(unlock.id);
  }, [unlock?.id, paused, visible, config?.soundEnabled, config?.soundVolume, thread.id]);

  useEffect(() => {
    if (!unlock || paused || !visible || refreshedUnlocks.has(unlock.id)) return;
    refreshedUnlocks.add(unlock.id);
    void api.thread(thread.id).then(result => refreshThread.current(result.thread)).catch(() => undefined);
  }, [unlock?.id, paused, visible, thread.id]);

  const dismiss = () => {
    if (!unlock) return;
    diagnostics.record("dismiss", { instance: instance.current, unlockId: unlock.id,
      nodes: document.querySelectorAll(".discovery-unlocked").length });
    dismissalReceipts.dismiss(thread.id, unlock.id);
    setUnlock(null);
    lastDismissed.set(thread.id, Date.now());
    onPendingChange?.(false);
    void dismissalReceipts.flush(thread.id, acknowledge);
    window.requestAnimationFrame(() => diagnostics.record("dismiss-frame", {
      instance: instance.current, nodes: document.querySelectorAll(".discovery-unlocked").length,
      connected: popup.current?.isConnected || false,
    }));
  };

  if (!unlock || paused || !visible) return null;
  return <div ref={popup} data-discovery-instance={instance.current} className="discovery-unlocked" role="status" aria-live="polite" style={{ "--bond-color": "#72dcd0" } as React.CSSProperties}>
    {portrait}
    <span><small>Discovery unlocked</small><strong>{unlock.title}</strong><b>{characterName} · +{unlock.bondReward} bond</b></span>
    <button type="button" aria-label="Dismiss discovery notification"
      onPointerDown={() => diagnostics.record("close-pointer", { instance: instance.current, unlockId: unlock.id })}
      onClick={event => { diagnostics.record("close-click", { instance: instance.current, unlockId: unlock.id }); event.stopPropagation(); dismiss(); }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </div>;
}
