import { useEffect, useState } from "react";
import { api } from "./api";
import { JourneyActivity, journeyActivityFingerprint, updateJourneyActivity } from "../shared/journey-activity.mjs";

export function useJourneyActivity(threadId: string | undefined, viewed: boolean) {
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    if (!threadId) { setUnread(false); return; }
    const key = `animessenger.journey-activity.v1:${threadId}`;
    let previous: JourneyActivity | null = null;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (typeof saved?.seen === "string" && typeof saved?.observed === "string") previous = saved;
    } catch { /* Activity indicators must not prevent access to the app. */ }
    setUnread(Boolean(previous?.unread));
    let current = true;
    let timer: number;
    const poll = async () => {
      try {
        const journey = await api.journey(threadId);
        if (!current) return;
        previous = updateJourneyActivity(previous, journeyActivityFingerprint(journey, previous?.observed), viewed);
        setUnread(previous.unread);
        try { localStorage.setItem(key, JSON.stringify(previous)); } catch { /* In-memory indicator still works. */ }
      } catch { /* Failed loads never acknowledge unseen activity. */ }
      if (current) timer = window.setTimeout(() => void poll(), 5000);
    };
    void poll();
    return () => { current = false; window.clearTimeout(timer); };
  }, [threadId, viewed]);
  return unread;
}
