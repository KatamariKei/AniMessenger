import { useEffect, useState } from "react";
import { api, MemoryHealth } from "./api";

const categories = [
  ["possible_resolution", "Possibly fulfilled commitments"],
  ["similar", "Similar memories"],
  ["low_priority", "Lower-priority episodes"],
] as const;

export function MemoryHealthPanel({ threadId }: { threadId: string }) {
  const [health, setHealth] = useState<MemoryHealth | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setHealth(null); setError(""); setLoading(true);
    api.memoryHealth(threadId).then(result => { if (!cancelled) setHealth(result.health); })
      .catch(() => { if (!cancelled) setError("The report couldn't load. Your memories haven't changed."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [threadId, refresh]);
  return <div className="memory-health" aria-busy={loading}>
    <div className="memory-health-heading"><div><strong>Memory health</strong><small>Read-only review. Nothing is deleted, merged, or resolved.</small></div>
      <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>{loading ? "Checking…" : "Refresh report"}</button></div>
    {error ? <p role="status">{error}</p> : null}
    {health ? <>
      <p>{health.total} saved memories · {health.active} active · {health.archived} archived</p>
      <small>{health.capacityTarget} active-memory target. Archived memories stay saved, searchable, and available for relevant recall. Live reviews and rescans use the same retention rules.</small>
      {health.metrics.startedAt ? <div className="memory-health-metrics"><span><strong>{health.metrics.added}</strong> Added</span><span><strong>{health.metrics.updated}</strong> Updated</span><span><strong>{health.metrics.resolved}</strong> Resolved</span></div> : null}
      <small>{health.metrics.startedAt ? `Recorded background reviews since ${new Date(health.metrics.startedAt).toLocaleDateString()}. Showing up to the last 100 reviews within seven days (${health.metrics.reviews} recorded).` : "Growth tracking starts with the next background review. Historical update and resolution counts are unavailable."}</small>
      {categories.map(([type, label]) => <details key={type} className="memory-health-category"><summary>{label}<span>{health.counts[type]}</span></summary>
        <p className="memory-health-caution">Review candidates, not confirmed errors.</p>
        {health.flags.filter(flag => flag.type === type).map((flag, index) => <div className="memory-health-candidate" key={flag.memoryIds.join(":") + index}>
          {flag.texts.map((text, textIndex) => <p key={textIndex}>{text}</p>)}<small>{flag.reason}</small>
          {flag.evidence ? <details><summary>Source evidence</summary><blockquote>{flag.evidence.quote}</blockquote></details> : null}
        </div>)}
        {!health.counts[type] ? <small>No candidates found by this check.</small> : null}
      </details>)}
      {health.truncated ? <small>The report displays the first 40 candidates. Counts include all candidates.</small> : null}
    </> : null}
  </div>;
}
