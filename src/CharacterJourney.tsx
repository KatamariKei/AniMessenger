import { useEffect, useState } from "react";
import { api, CharacterJourney as JourneyData, Thread } from "./api";

function AchievementEmblem({ id }: { id: string }) {
  if (id === "shared-laughter") return <svg viewBox="0 0 240 240" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="70 76.3 100 96.3 70 116.3" strokeWidth="10" />
    <polyline points="170 76.3 140 96.3 170 116.3" strokeWidth="10" />
    <path d="M70,139.5h100c0,60-100,60-100,0Z" fill="currentColor" stroke="none" />
    <path d="M210,120c0,49.7-40.3,90-90,90S30,169.7,30,120,70.3,30,120,30s90,40.3,90,90" strokeWidth="16" />
  </svg>;
  const paths: Record<string, string> = {
    "new-horizons": "M12 3l3 6 6 3-6 3-3 6-3-6-6-3 6-3zM12 9v6M9 12h6",
    "time-well-spent": "M6 3h12M6 21h12M7 3v4c0 2 3 4 5 5-2 1-5 3-5 5v4M17 3v4c0 2-3 4-5 5 2 1 5 3 5 5v4M9 7h6M9 18h6",
    "heartfelt": "M12 20l-8-8C-2 6 7 0 12 7c5-7 14-1 8 5l-8 8z",
    "getting-to-know-you": "M12 21V10M12 10C9 8 5 8 2 9v10c3-1 7-1 10 2 3-3 7-3 10-2V9c-1-.3-2-.5-3-.5M15 2l1.2 3.8L20 7l-3.8 1.2L15 12l-1.2-3.8L10 7l3.8-1.2L15 2z",
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[id] || paths["new-horizons"]} /></svg>;
}

export function CharacterJourney({ thread }: { thread: Thread }) {
  const [journey, setJourney] = useState<JourneyData | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [findingLeads, setFindingLeads] = useState(false);
  const [discoveryError, setDiscoveryError] = useState("");
  const [artRequest, setArtRequest] = useState<string | null>(null);
  const [openArt, setOpenArt] = useState<{ title: string; imageUrl: string } | null>(null);
  const makeArtwork = async (id: string, regenerate = false) => {
    setArtRequest(id); setDiscoveryError("");
    try { await api.discoveryArtwork(thread.id, id, regenerate); setJourney(await api.journey(thread.id)); }
    catch { setDiscoveryError("Artwork couldn't start. Check Image setup and try again; your discovery is safe."); }
    finally { setArtRequest(null); }
  };
  useEffect(() => {
    let current = true;
    setJourney(null);
    setError("");
    api.journey(thread.id).then(async result => {
      if (!current) return;
      setJourney(result);
      // Only an actual Journey visit starts legacy preparation, not the
      // activity badge's background polling. Never scan conversations here.
      if (!result.discoveries?.status || ["unprepared", "queued", "preparing"].includes(result.discoveries.status)) {
        try {
          await api.prepareDiscoveries(thread.id, false, true);
          const refreshed = await api.journey(thread.id);
          if (current) setJourney(refreshed);
        } catch { if (current) setDiscoveryError("Discovery preparation couldn't start. You can retry below; your chat is safe."); }
      }
    })
      .catch(() => { if (current) setError("Your journey couldn't be loaded. Nothing has been changed."); });
    return () => { current = false; };
  }, [thread.id, thread.progressionRevision, retry]);

  const discoveryStatus = journey?.discoveries?.status || "unprepared";
  const discoveryBusy = preparing || discoveryStatus === "queued" || discoveryStatus === "preparing";
  const history = journey?.discoveries?.history;
  const historyBusy = history?.status === "queued" || history?.status === "checking";
  const discoveriesComplete = new Set(journey?.discoveries?.revealed?.map(item => item.id) || []).size >= 3;
  useEffect(() => {
    if (discoveryStatus !== "queued" && discoveryStatus !== "preparing" && !historyBusy && !journey?.discoveries?.discoveryEnabled) return;
    let current = true;
    const timer = window.setInterval(() => {
      api.journey(thread.id).then(result => { if (current) setJourney(result); })
        .catch(() => { if (current) setDiscoveryError("Preparation status couldn't be refreshed. Try reopening Journey."); });
    }, 4000);
    return () => { current = false; window.clearInterval(timer); };
  }, [thread.id, discoveryStatus, historyBusy, journey?.discoveries?.discoveryEnabled]);

  const findLeads = async (leadId?: string) => {
    if (findingLeads) return;
    setFindingLeads(true);
    setDiscoveryError("");
    try {
      const discoveries = await api.discoveryLeads(thread.id, leadId);
      setJourney(value => value?.discoveries ? { ...value, discoveries: { ...value.discoveries, ...discoveries } } : value);
    } catch { setDiscoveryError("Leads couldn't be updated. Your discoveries are unchanged."); }
    finally { setFindingLeads(false); }
  };

  const checkEarlierChat = async () => {
    setDiscoveryError("");
    setPreparing(true);
    try {
      const history = await api.checkDiscoveryHistory(thread.id);
      setJourney(value => value?.discoveries ? { ...value, discoveries: { ...value.discoveries, history } } : value);
    } catch { setDiscoveryError("Earlier chat couldn't be checked. Existing discoveries are unchanged."); }
    finally { setPreparing(false); }
  };

  const prepareDiscoveries = async () => {
    setPreparing(true);
    setDiscoveryError("");
    try {
      const discoveries = await api.prepareDiscoveries(thread.id, discoveryStatus === "ready");
      setJourney(value => value ? { ...value, discoveries } : value);
    } catch { setDiscoveryError("Preparation couldn't start. Your character hasn't been changed."); }
    finally { setPreparing(false); }
  };

  return <div className="profile-journey" id="profile-panel" role="tabpanel" aria-labelledby="profile-tab-journey" aria-busy={!journey && !error}>
    <header className="journey-heading"><div><small>Your journey</small><h3>Shared experiences</h3></div>{journey && (journey.mode === "active" || journey.characterPoints > 0) ? <span className="journey-points"><strong>{journey.characterPoints}</strong> Achievement points<small>With this character</small></span> : null}</header>
    {error ? <div role="alert" className="journey-status"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div>
      : !journey ? <p role="status" className="journey-status">Loading your journey…</p>
      : <>
        <section className="journey-section journey-achievement-section" aria-labelledby="journey-achievements-title">
        <header className="journey-section-heading"><div><small>Shared experiences</small><h4 id="journey-achievements-title">Achievements</h4></div><span>{journey.mode === "preview" ? `${journey.achievements.filter(item => item.progress >= item.target).length} targets reached` : `${journey.achievements.filter(item => item.earned).length} / ${journey.achievements.length} earned`}</span></header>
        {journey.mode === "preview" ? <p className="journey-preview" role="note">Verified progress · rewards are still being tested. Reaching a target here does not award points yet.</p> : <p className="journey-intro">Meaningful moments, at your own pace. No daily streaks or deadlines.</p>}
        <ol className="journey-achievements">
          {journey.achievements.map(achievement => <li key={achievement.id} className={"journey-achievement" + (achievement.earned ? " is-earned" : "")}>
            <span className="journey-emblem" aria-hidden="true"><AchievementEmblem id={achievement.id} /></span>
            <div><header><h4>{achievement.title}</h4><small>{achievement.earned ? "Earned" : `${achievement.progress} / ${achievement.target}`}</small></header>
              <p>{achievement.criteria}</p><span className="journey-reward">{achievement.earned ? `${achievement.points} points earned` : journey.mode === "preview" ? achievement.progress >= achievement.target ? "Target reached · awaiting reward activation" : "Progress confirmed after background review" : `${achievement.points} points on completion`}</span>
              <progress max={achievement.target} value={achievement.progress} aria-label={achievement.title + " progress"} />
            </div>
          </li>)}
        </ol>
        </section>
        <section className="journey-section journey-discoveries" aria-labelledby="journey-discovery-title">
          <header className="journey-section-heading"><div><small>Get to know them</small><h4 id="journey-discovery-title">Discoveries</h4></div><span>{discoveriesComplete ? "3 / 3 discovered" : `${journey.discoveries?.revealed?.length || 0} discovered · ${journey.discoveries?.leadAvailability?.prepared || 0} / 3 prepared`}</span></header>
          {discoveriesComplete ? <p className="journey-discovery-guide" role="status">All 3 discoveries uncovered.</p> : <>
          <p className="journey-discovery-guide">Follow a clue, then ask in your own words in the story. When they share the discovery, it unlocks automatically and earns +5 bond once. You don't need to press a check button.</p>
          {discoveryStatus !== "ready" ? <div className="journey-discovery-setup">
            <button type="button" onClick={prepareDiscoveries} disabled={discoveryBusy || historyBusy}>{discoveryBusy ? "Preparing discoveries…" : discoveryStatus === "failed" || discoveryStatus === "limited" ? "Retry discovery research" : "Find character discoveries"}</button>
            <p role="status">{discoveryBusy ? "Research is running in the background. You can keep chatting." : "Research prepares up to three source-supported discoveries without changing the character or your story."}</p>
          </div> : null}
          <details className="journey-tools"><summary>Discovery research & past conversations</summary>
          {discoveryStatus === "ready" && journey.discoveries?.canResearchMore ? <><p>{journey.discoveries?.leadAvailability?.prepared || 0} of up to 3 discoveries prepared. Research can look for more reliable source material; it may not find another discovery.</p><button type="button" onClick={prepareDiscoveries} disabled={discoveryBusy || historyBusy}>{discoveryBusy ? "Researching…" : "Research additional discoveries"}</button></> : null}
          <p role={discoveryBusy ? "status" : undefined} aria-live="polite">{discoveryStatus === "ready"
            ? "Follow a lead or ask naturally. Clearly shared discoveries are recognized after the background review and earn +5 bond once. No exact phrases or deadlines."
            : discoveryStatus === "queued" ? "Queued behind active chat and image work. You can keep using AniMessenger."
            : discoveryStatus === "preparing" ? "Researching and checking discoveries with your local model. Your profile stays unchanged."
            : discoveryStatus === "limited" ? "There wasn't enough grounded source detail to prepare a reliable discovery. Nothing was invented."
            : discoveryStatus === "failed" ? "Preparation couldn't finish, or was interrupted. Your character is unchanged; you can retry."
            : "Optional preparation for up to three grounded discoveries. Uses character research and your local model, without rewriting the profile or chat."}</p>
          {discoveryStatus === "ready" ? <div className="journey-history-check">
            <button type="button" onClick={checkEarlierChat} disabled={discoveryBusy || historyBusy}>{historyBusy ? "Checking past conversations…" : "Scan past conversations"}</button>
            <p role="status" aria-live="polite">{historyBusy ? `Checking earlier conversations in small batches (${history?.checkedBatches || 0} / ${history?.totalBatches || 0}). You can keep chatting.`
              : history?.status === "complete" ? `${history.confirmed} ${history.confirmed === 1 ? "discovery was" : "discoveries were"} confirmed from earlier chat. Earlier-chat checks do not award points; unmatched discoveries remain unresolved.`
              : history?.status === "failed" || history?.status === "interrupted" ? "The check didn't finish. Confirmed discoveries are saved; retry when convenient."
              : "Already talked about it? Check this conversation for discoveries clearly shared before. Unconfirmed answers stay hidden, and uncertain matches don't count."}</p>
          </div> : null}
          </details>
          </>}
          {discoveryError ? <p role="alert">{discoveryError}</p> : null}
          {!discoveriesComplete && discoveryStatus === "ready" ? <section className="journey-leads" aria-label="Discovery leads">
            <header><h4>Clues to explore</h4>{(journey.discoveries?.leadAvailability?.newAvailable || 0) > 0 ? <button type="button" disabled={findingLeads || discoveryBusy} onClick={() => findLeads()}>{findingLeads ? "Finding clues…" : `Reveal ${journey.discoveries!.leadAvailability!.newAvailable} ${journey.discoveries!.leadAvailability!.newAvailable === 1 ? "new clue" : "new clues"}`}</button> : null}</header>
            {journey.discoveries?.leads?.length ? <ul>{journey.discoveries.leads.map(lead => <li key={lead.id}>
              <p>{lead.clue}</p>{lead.active ? <span className="journey-active-clue">Exploring this clue</span> : <button type="button" onClick={() => findLeads(lead.id)} disabled={findingLeads}>{findingLeads ? "Selecting…" : "Focus on this clue"}</button>}
              {lead.active ? <small>Return to the story and ask about it in your own words.</small> : null}
            </li>)}</ul> : <p>{(journey.discoveries?.leadAvailability?.newAvailable || 0) > 0 ? "New clues are ready to reveal." : journey.discoveries?.leadAvailability?.locked ? "No clues are available at your current bond yet." : "No unexplored clues remain from the discoveries currently prepared."}</p>}
            {journey.discoveries?.leadAvailability?.locked ? <p className="journey-clue-status">{journey.discoveries.leadAvailability.locked} more {journey.discoveries.leadAvailability.locked === 1 ? "clue becomes" : "clues become"} available as your bond grows. Next clue at {journey.discoveries.leadAvailability.nextTrust}% bond. You can still ask naturally about any topic.</p> : null}
          </section> : null}
          {journey.discoveries?.revealed?.length ? <section className="journey-revealed" aria-label="Revealed discoveries"><ul>{journey.discoveries.revealed.map(item => <li key={item.id} className="discovery-art-card">
            {item.artwork?.imageUrl ? <button className="discovery-art-image" type="button" aria-label={`View ${item.title} artwork`} onClick={() => setOpenArt({ title: item.title, imageUrl: item.artwork!.imageUrl! })}><img src={item.artwork.imageUrl} alt={`Illustration of ${item.title}`} loading="lazy" /></button> : <div className="discovery-art-placeholder" aria-hidden="true">◇<span>Character moment</span></div>}
            <div className="discovery-art-content"><header><h4>{item.title}</h4><small>{item.earlier ? "Already shared" : item.bondReward ? "+5 bond" : "Discovered"}</small></header><p>{item.truth}</p>
            <footer><small>{item.artwork?.status === "error" ? "Artwork interrupted — your previous image is safe. You can retry." : "Discovery illustration · separate from your story"}</small><button type="button" disabled={artRequest === item.id || ["queued", "preparing", "generating"].includes(item.artwork?.status || "")} onClick={() => void makeArtwork(item.id, Boolean(item.artwork?.imageUrl))}>{artRequest === item.id || item.artwork?.status === "queued" ? "Queued…" : item.artwork?.status === "preparing" ? "Composing…" : item.artwork?.status === "generating" ? "Creating artwork…" : item.artwork?.status === "error" ? "Retry artwork" : item.artwork?.imageUrl ? "Regenerate" : "Create artwork"}</button></footer></div>
          </li>)}</ul></section> : null}
        </section>
        <section className="journey-section journey-milestones" aria-labelledby="journey-milestone-title"><header className="journey-section-heading"><div><small>Growing closer</small><h4 id="journey-milestone-title">Bond milestones</h4></div><span>{journey.milestones.length} reached</span></header>
          <ul>{journey.milestones.slice(-3).reverse().map(item => <li key={item.id}><span aria-hidden="true" style={{ color: item.color }}>◆</span>{item.label}</li>)}</ul>
          {journey.milestones.length > 3 ? <details className="journey-tools"><summary>View all bond milestones</summary><ol>{journey.milestones.map(item => <li key={item.id}><span aria-hidden="true" style={{ color: item.color }}>◆</span>{item.label}</li>)}</ol></details> : null}
          {!journey.milestones.length ? <p>Your bond milestones will appear here as you grow closer.</p> : null}
        </section>
      </>}
      {openArt ? <dialog className="journey-art-lightbox" ref={element => { if (element && !element.open) element.showModal(); }} aria-label={openArt.title} onCancel={() => setOpenArt(null)} onClick={event => { if (event.target === event.currentTarget) setOpenArt(null); }}><button autoFocus type="button" aria-label="Close discovery artwork" onClick={() => setOpenArt(null)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg></button><img src={openArt.imageUrl} alt={`Illustration of ${openArt.title}`} /></dialog> : null}
  </div>;
}
