import React,{useEffect,useMemo,useState} from "react";
import {NavLink,useSearchParams} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {shuffledMembers,pageMembers} from "./member-directory.mjs";
import {HeartDecision,HeartIcon} from "./QuickmatchHearts.jsx";
import QuickmatchRestrictedProfile from "./QuickmatchRestrictedProfile.jsx";

// The backend owns bilateral cooldowns, permanent exclusions and which Likes
// may be disclosed. Client-side state is presentation only, never authority.
const VIEWS=[["matches","Matches"],["outgoing","Who You Like"],["incoming","Who Likes You"]];
function score(member){
  return member.matchPercent===null ? "Not enough shared answers" :
    member.matchPercent+"% question match · "+member.commonQuestions+" shared";
}
export default function QuickmatchView({Photo}) {
  const {discovery,discoveryLoading,discoveryUnavailable,loadQuickmatchDecisions,saveQuickmatchDecision}=useMemberSession();
  const [quickState,setQuickState]=useState(null);
  const [queueOrder,setQueueOrder]=useState([]);
  // URL-backed tabs ensure browser Back returns to the same Like list.
  const [searchParams,setSearchParams]=useSearchParams();
  const requestedTab=searchParams.get("tab");
  const tab=VIEWS.some(([key])=>key===requestedTab)?requestedTab:"matches";
  const [page,setPage]=useState(1);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const byId=useMemo(()=>new Map((discovery||[]).map(member=>[member.userId,member])),[discovery]);
  const eligible=useMemo(()=>quickState ?
    (discovery||[]).filter(member=>quickState.eligibleUserIds.has(member.userId)):[],
    [discovery,quickState]);
  useEffect(()=>{
    let active=true;
    setLoading(true);setQuickState(null);setError("");setNotice("");setQueueOrder([]);
    void loadQuickmatchDecisions().then(state=>{
      if(active){setQuickState(state);setLoading(false);}
    }).catch(()=>{
      if(active){setError("Quickmatch cannot load your saved decisions. Voting is disabled.");setLoading(false);}
    });
    return()=>{active=false;};
  },[loadQuickmatchDecisions]);
  // Preserve all existing in-page positions including skipped entries.
  // Randomize only genuinely newly eligible candidates being appended.
  useEffect(()=>{
    const ids=new Set(eligible.map(member=>member.userId));
    setQueueOrder(previous=>{
      const kept=previous.filter(id=>ids.has(id));
      const known=new Set(kept);
      const arrivals=shuffledMembers(eligible.filter(member=>!known.has(member.userId)))
        .map(member=>member.userId);
      const next=[...kept,...arrivals];
      return next.length===previous.length && next.every((id,i)=>id===previous[i])?previous:next;
    });
  },[eligible]);
  useEffect(()=>{setPage(1);},[tab]);
  const candidate=queueOrder.length?byId.get(queueOrder[0])||null:null;

  async function vote(targetUserId,decision) {
    if(!quickState||busy||!["like","dislike"].includes(decision))return;
    setBusy(true);setError("");setNotice("");
    let saved=false;
    try{
      await saveQuickmatchDecision(targetUserId,decision);
      saved=true;
      const latest=await loadQuickmatchDecisions();
      setQuickState(latest);
      setQueueOrder(current=>current.filter(id=>id!==targetUserId));
      setNotice(decision==="like"?"Like saved.":"Dislike saved.");
    }catch{
      if(saved){
        // A successful Dislike may change a pair-wide counter. Do not invite
        // a second click if refreshing the private state failed.
        setQuickState(null);
        setError("Your choice saved, but the queue couldn't refresh. Reload before voting again.");
      }else setError("The decision was not saved. This pair may be in its cooldown or unavailable.");
    }finally{setBusy(false);}
  }
  async function rate(decision){
    if(!candidate||busy)return;
    await vote(candidate.userId,decision);
  }
  const listIds=tab==="outgoing"?quickState?.outgoingLikes:quickState?.incomingLikes;
  const visible=useMemo(()=>{
    if(!listIds||!quickState)return [];
    return listIds.map(id=>byId.get(id)).filter(Boolean);
  },[listIds,quickState,byId]);
  const paged=pageMembers(visible,page,24);

  return <section className="ogcl-view" aria-labelledby="ogcl-quickmatch-heading">
    <div className="ogcl-period-stage">
    <header className="ogcl-view-head">
      <h1 id="ogcl-quickmatch-heading">Quickmatch</h1>
      <p>Meet somebody interesting. Your choices are saved privately.</p>
    </header>
      <nav className="ogcl-quickmatch-tabs ogcl-period-tabs" aria-label="Quickmatch lists">
        {VIEWS.map(([key,label])=><button key={key} type="button"
          aria-current={tab===key?"page":undefined} disabled={busy}
          onClick={()=>{setSearchParams(key==="matches"?{}:{tab:key});setError("");setNotice("");}}>
          <span data-ogc-edit-text={"copy.quickmatch.tab-"+key}>{label}</span>{key==="incoming"&&quickState?" ("+quickState.incomingLikes.length+")":""}
        </button>)}
      </nav>
    </div>
    <div className="ogcl-content-panel">
      <p className="ogcl-note">Match percentages are based on real saved question answers.
        Friend and Enemy percentages aren't calculated yet.</p>
      {loading&&<p role="status">Loading your saved Quickmatch decisions…</p>}
      {discoveryLoading&&<p role="status">Loading Quickmatch profiles…</p>}
      {discoveryUnavailable&&<p role="alert" className="ogcl-error"><span data-ogc-edit-text="copy.quickmatch.member-discovery-is-unavailable">Member discovery is unavailable.</span></p>}
      {error&&<p role="alert" className="ogcl-error">{error}</p>}
      {notice&&<p role="status" className="ogcl-save-confirmation">{notice}</p>}
      {!loading&&quickState&&!discoveryLoading&&!discoveryUnavailable&&tab==="matches"&&
        (candidate?<article className="ogcl-quickmatch-view" aria-label="Quickmatch candidate">
          <QuickmatchRestrictedProfile member={candidate}>
            <div className="ogcl-quickmatch-actions" aria-label="Choose Like or Dislike">
              <HeartDecision kind="dislike" disabled={busy} onClick={()=>void rate("dislike")}/>
              <HeartDecision kind="like" disabled={busy} onClick={()=>void rate("like")}/>
            </div>
            {queueOrder.length>=5&&<button type="button" className="ogcl-quickmatch-skip"
              disabled={busy} onClick={()=>setQueueOrder(current=>
                current.length>=5?[...current.slice(1),current[0]]:current)}>
              Skip for now
            </button>}
          </QuickmatchRestrictedProfile>
        </article>:<p><span data-ogc-edit-text="copy.quickmatch.no-new-eligible-quickmatch-profiles-right-now">No new eligible Quickmatch profiles right now.</span></p>)}
      {!loading&&quickState&&!discoveryLoading&&!discoveryUnavailable&&tab!=="matches"&&<>
        <p className="ogcl-quiet">{visible.length} currently visible member{visible.length===1?"":"s"}.
          Mutual Likes are saved in MATCHES → Quiver. Other members' Dislikes aren't disclosed.</p>
        {paged.items.length?<div className="ogcl-directory ogcl-quickmatch-list">
          {paged.items.map(member=>{
            const canLikeBack=tab==="incoming"&&!quickState.mutualUserIds.has(member.userId)&&
              quickState.eligibleUserIds.has(member.userId);
            return <article key={member.userId} className="ogcl-quickmatch-list-entry">
              <NavLink className="ogcl-member-link"
                aria-label={"View "+member.displayName+"'s full profile"}
                to={"/profiles/"+encodeURIComponent(member.slug)}>
                <div className="ogcl-quickmatch-thumb">
                  <Photo member={member}/>
                </div>
                <span className="ogcl-member-copy">
                  <strong>{member.displayName}</strong>
                  <small>{member.age?member.age+" · ":""}{member.cityRegion||""}</small>
                  <small>{score(member)}</small>
                </span>
              </NavLink>
              {canLikeBack&&<button type="button" className="ogcl-like-back"
                disabled={busy} onClick={()=>void vote(member.userId,"like")}>
                <HeartIcon kind="like"/><span>Like Back</span>
              </button>}
            </article>;
          })}
        </div>:<p><span data-ogc-edit-text="copy.quickmatch.no-currently-visible-members-in-this-list">No currently visible members in this list.</span></p>}
        {paged.totalPages>1&&<nav className="ogcl-pages" aria-label="Quickmatch list pages">
          {Array.from({length:paged.totalPages},(_,i)=><button key={i} type="button"
            aria-current={paged.page===i+1?"page":undefined}
            onClick={()=>setPage(i+1)}>{i+1}</button>)}
        </nav>}
      </>}
    </div>
  </section>;
}
