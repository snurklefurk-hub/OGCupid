import React,{useEffect,useMemo,useState} from "react";
import {NavLink} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {shuffledMembers} from "./member-directory.mjs";

// Decisions are private to the authenticated member and persisted in Neon.
// A missing backend must never look like a successful Like/Dislike.
export default function QuickmatchView({Photo}) {
  const {discovery,discoveryUnavailable,loadQuickmatchDecisions,saveQuickmatchDecision} = useMemberSession();
  const [decisions,setDecisions] = useState(null);
  const [skipped,setSkipped] = useState(()=>new Set());
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const queue=useMemo(()=>shuffledMembers(discovery),[discovery]);
  const remaining=useMemo(()=>queue.filter(member=>
    !decisions?.has(member.userId) && !skipped.has(member.userId)),[queue,decisions,skipped]);
  const candidate=decisions ? remaining[0]||null : null;

  useEffect(()=>{
    let active=true;
    setLoading(true);setDecisions(null);setError("");setMessage("");setSkipped(new Set());
    void loadQuickmatchDecisions().then(saved=>{
      if(!active)return;
      setDecisions(saved);setLoading(false);
    }).catch(()=>{
      if(!active)return;
      setError("Quickmatch voting is unavailable. No choices have been recorded.");
      setLoading(false);
    });
    return ()=>{active=false;};
  },[loadQuickmatchDecisions]);

  async function rate(decision) {
    if(!candidate || busy || (decision!=="like" && decision!=="dislike"))return;
    setBusy(true);setError("");setMessage("");
    try {
      const confirmed=await saveQuickmatchDecision(candidate.userId,decision);
      setDecisions(previous=>new Map(previous).set(confirmed.targetUserId,confirmed.decision));
      setMessage(decision==="like"?"Like saved.":"Dislike saved.");
    } catch {
      setError("Your choice wasn't saved. You can try again without losing your place.");
    } finally {setBusy(false);}
  }

  return <section className="ogcl-view" aria-labelledby="ogcl-quickmatch-heading">
    <header className="ogcl-view-head">
      <h1 id="ogcl-quickmatch-heading">Quickmatch</h1>
      <p>One real member at a time. Your choices stay private.</p>
    </header>
    <div className="ogcl-content-panel">
      <p className="ogcl-note">Compatibility percentages are provisional, based only on saved match-question answers.
        A Like is not a mutual match, a message or a notification.</p>
      {loading && <p role="status">Loading your saved decisions…</p>}
      {discoveryUnavailable && <p role="alert" className="ogcl-error">Member discovery is unavailable.</p>}
      {error && <p role="alert" className="ogcl-error">{error}</p>}
      {message && <p role="status" className="ogcl-save-confirmation">{message}</p>}
      {!loading && decisions && !discoveryUnavailable && (candidate ? <>
        <article className="ogcl-quickmatch-view" aria-label="Quickmatch member">
          <div className="ogcl-member-link ogcl-quickmatch-member">
            <Photo member={candidate} />
            <span className="ogcl-member-copy">
              <strong>{candidate.displayName}</strong>
              <small>{candidate.matchPercent===null ? "Not enough shared answers"
                : candidate.matchPercent+"% question match · "+candidate.commonQuestions+" shared"}</small>
            </span>
          </div>
          <div className="ogcl-quickmatch-actions">
            <button type="button" className="ogcl-button ogcl-quickmatch-dislike"
              disabled={busy} onClick={()=>void rate("dislike")}>Dislike</button>
            <button type="button" className="ogcl-button ogcl-quickmatch-like"
              disabled={busy} onClick={()=>void rate("like")}>Like</button>
            {remaining.length>1 && <button type="button" className="ogcl-button ogcl-quickmatch-next"
              disabled={busy} onClick={()=>setSkipped(previous=>new Set(previous).add(candidate.userId))}>
              See another
            </button>}
          </div>
        </article>
      </> : <>
        <p>No new discoverable profiles in your Quickmatch queue right now.</p>
        {skipped.size>0 && <button type="button" className="ogcl-button" onClick={()=>setSkipped(new Set())}>
          Revisit skipped members
        </button>}
      </>)}
      <p className="ogcl-quiet">See full member profiles in <NavLink to="/matches">MATCHES</NavLink>.
        Your saved Like/Dislike choices are not visible to other members.</p>
    </div>
  </section>;
}
