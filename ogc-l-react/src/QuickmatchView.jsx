import React,{useEffect,useMemo,useState} from "react";
import {NavLink} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {pageMembers,shuffledMembers} from "./member-directory.mjs";

// The server decides bilateral suppression and eligibility. Neither a target's
// private Dislikes nor another member's answer data enter frontend state.
const VIEWS=[["matches","Matches"],["outgoing","Who You Like"],["incoming","Who Likes You"]];
const score=member=>member.matchPercent===null?"Not enough shared answers":
  member.matchPercent+"% question match · "+member.commonQuestions+" shared";

export default function QuickmatchView({Photo}) {
  const {discovery,discoveryUnavailable,loadQuickmatchDecisions,saveQuickmatchDecision}=useMemberSession();
  const [quickState,setQuickState]=useState(null);
  const [skipped,setSkipped]=useState(()=>new Set());
  const [tab,setTab]=useState("matches");
  const [page,setPage]=useState(1);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const queue=useMemo(()=>shuffledMembers(discovery),[discovery]);
  const byId=useMemo(()=>new Map(discovery.map(member=>[member.userId,member])),[discovery]);
  const eligible=useMemo(()=>quickState?
    queue.filter(m=>quickState.eligibleUserIds.has(m.userId)):[],[queue,quickState]);
  const remaining=useMemo(()=>eligible.filter(m=>!skipped.has(m.userId)),[eligible,skipped]);
  const candidate=remaining[0]||null;

  useEffect(()=>{
    let mounted=true;
    setQuickState(null);setLoading(true);setError("");setNotice("");setSkipped(new Set());
    void loadQuickmatchDecisions().then(state=>{
      if(mounted){setQuickState(state);setLoading(false);}
    }).catch(()=>{
      if(mounted){setError("Quickmatch cannot load your private decisions. Voting is disabled.");setLoading(false);}
    });
    return ()=>{mounted=false;};
  },[loadQuickmatchDecisions]);

  useEffect(()=>{
    if(eligible.length>0 && remaining.length===0 && skipped.size>0)setSkipped(new Set());
  },[eligible.length,remaining.length,skipped]);
  useEffect(()=>{setPage(1);},[tab]);

  async function vote(targetUserId,decision) {
    if(!quickState || busy || !["like","dislike"].includes(decision))return;
    setBusy(true);setError("");setNotice("");
    let saved=false;
    try {
      await saveQuickmatchDecision(targetUserId,decision);
      saved=true;
      const latest=await loadQuickmatchDecisions();
      setQuickState(latest);
      setSkipped(new Set());
      setNotice(decision==="like"?"Like saved.":"Dislike saved.");
    } catch {
      if(saved){
        // Never invite the member to repeat a potentially counted Dislike.
        setQuickState(null);
        setError("Your decision saved, but the queue could not refresh. Reload the page.");
      } else setError("No decision was saved. This pair may be in its cooldown or unavailable.");
    } finally {setBusy(false);}
  }

  const listIds=tab==="outgoing"?quickState?.outgoingLikes:quickState?.incomingLikes;
  const visible=useMemo(()=>{
    if(!listIds || !quickState)return [];
    const items=listIds.map(id=>byId.get(id)).filter(Boolean);
    return items.sort((a,b)=>Number(quickState.mutualUserIds.has(b.userId))-
      Number(quickState.mutualUserIds.has(a.userId)));
  },[listIds,quickState,byId]);
  const paged=pageMembers(visible,page);

  return <section className="ogcl-view" aria-labelledby="ogcl-quickmatch-heading">
    <header className="ogcl-view-head">
      <h1 id="ogcl-quickmatch-heading">Quickmatch</h1>
      <p>Get to know someone. Your decisions are saved privately.</p>
    </header>
    <div className="ogcl-content-panel">
      <nav className="ogcl-quickmatch-tabs" aria-label="Quickmatch lists">
        {VIEWS.map(([key,title])=><button type="button" key={key}
          aria-current={tab===key?"page":undefined} disabled={busy}
          onClick={()=>{setTab(key);setError("");setNotice("");}}>
          {title}{key==="incoming" && quickState ? " ("+quickState.incomingLikes.length+")" : ""}
        </button>)}
      </nav>
      <p className="ogcl-note">Match % is a real but provisional question-based score.
        Dislikes have pair-specific consequences; Friend and Enemy scores are not yet calculated.</p>
      {loading && <p role="status">Checking your private Quickmatch state…</p>}
      {discoveryUnavailable && <p role="alert" className="ogcl-error">Member discovery is unavailable.</p>}
      {error && <p role="alert" className="ogcl-error">{error}</p>}
      {notice && <p role="status" className="ogcl-save-confirmation">{notice}</p>}

      {!loading && quickState && !discoveryUnavailable && tab==="matches" && (candidate?<>
        <article className="ogcl-quickmatch-view" aria-label="Restricted Quickmatch member preview">
          <div className="ogcl-member-link ogcl-quickmatch-member">
            <Photo member={candidate}/>
            <span className="ogcl-member-copy">
              <strong>{candidate.displayName}</strong><small>{score(candidate)}</small>
            </span>
          </div>
          <div className="ogcl-quickmatch-actions">
            <button type="button" className="ogcl-button ogcl-quickmatch-dislike"
              disabled={busy} onClick={()=>void vote(candidate.userId,"dislike")}>Dislike</button>
            <button type="button" className="ogcl-button ogcl-quickmatch-like"
              disabled={busy} onClick={()=>void vote(candidate.userId,"like")}>Like</button>
          </div>
          {remaining.length>=5 && <button type="button" className="ogcl-quickmatch-skip"
            disabled={busy} onClick={()=>setSkipped(previous=>new Set(previous).add(candidate.userId))}>
            Skip for now
          </button>}
        </article>
      </>:<p>No new eligible Quickmatch profiles at this time.</p>)}

      {!loading && quickState && !discoveryUnavailable && tab!=="matches" && <>
        <p className="ogcl-quiet">{listIds.length} saved {tab==="outgoing"?"outgoing":"incoming"} Like{listIds.length===1?"":"s"}.
          Mutual Likes appear first. Member names and photos are only shown for profiles currently discoverable to you.</p>
        {paged.items.length ? <div className="ogcl-directory ogcl-quickmatch-list">
          {paged.items.map(member=>{
            const mutual=quickState.mutualUserIds.has(member.userId);
            return <article className="ogcl-member-link" key={member.userId}>
              {mutual ?
                <NavLink to={"/profiles/"+encodeURIComponent(member.slug)}
                  aria-label={"Open mutual Like profile: "+member.displayName}><Photo member={member}/></NavLink> :
                <div aria-label={"Restricted Quickmatch photo: "+member.displayName}><Photo member={member}/></div>}
              <span className="ogcl-member-copy">
                <strong>{member.displayName}</strong><small>{score(member)}</small>
                {mutual && <small className="ogcl-mutual-label">♥ Mutual Like</small>}
              </span>
              {tab==="incoming" && !mutual && <button className="ogcl-button" type="button"
                disabled={busy || !quickState.eligibleUserIds.has(member.userId)}
                onClick={()=>void vote(member.userId,"like")}>Like Back</button>}
            </article>;
          })}
        </div> : <p>No currently visible members in this list.</p>}
        {paged.totalPages>1 && <nav className="ogcl-pages" aria-label="Quickmatch list pages">
          {Array.from({length:paged.totalPages},(_,i)=>i+1).map(n=>
            <button type="button" key={n} aria-current={n===paged.page?"page":undefined}
              onClick={()=>setPage(n)}>{n}</button>)}
        </nav>}
      </>}
      <p className="ogcl-quiet">Other members' Dislikes are never disclosed.
        See ordinary full profiles in <NavLink to="/matches">MATCHES</NavLink>.
        Messages are not enabled in this React staging build.</p>
    </div>
  </section>;
}
