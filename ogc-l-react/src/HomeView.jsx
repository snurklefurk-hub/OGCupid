import React,{useEffect,useState} from "react";
import {NavLink,useSearchParams} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {homeProgress,AWARD_DEFINITIONS} from "./home-contract.mjs";
import {archetypes} from "./persona-content.mjs";
import "./home.css";

const kinds={profile:"created a profile.",essay:"answered or edited a profile essay.",match:"reached a new high match with you.",dealbreaker:"answered one of your dealbreaker questions correctly.",persona:"received a compatible Dating Persona result.",award:"earned a personality award."};
function Event({event,Photo}){
  const member=Boolean(event.userId&&event.slug&&event.displayName);
  const href=member?"/profiles/"+encodeURIComponent(event.slug):typeof event.href==="string"&&/^\/(?!\/)/.test(event.href)?event.href:null;
  const date=new Date(event.happenedAt);
  return <article className="ogcl-home-event">
    {member&&<NavLink to={href} aria-label={"Open "+event.displayName+"'s profile"}><Photo member={event}/></NavLink>}
    <div className="ogcl-home-event-copy">
      {member?<p><NavLink to={href}><strong>{event.displayName}</strong></NavLink>{" "}
        {kinds[event.kind]||"has an update."}
        {event.kind==="match"&&Number.isFinite(event.matchPercent)&&<> <strong>{event.matchPercent}% match</strong></>}
        {event.kind==="essay"&&Number.isFinite(event.matchPercent)&&<> · {event.matchPercent}% match</>}
        {event.kind==="award"&&<> <strong>{event.award}</strong></>}
        {event.kind==="persona"&&event.persona&&<> · {event.persona}</>}
      </p>:<><strong>{event.kind==="admin"?"A word from Admin":event.kind==="article"?"New OG Trends article":event.kind==="question"?"New match question":event.kind==="award-available"?"New personality award":"Site update"}</strong>
        <p>{href?<NavLink to={href}>{event.body}</NavLink>:event.body}</p></>}
      {Number.isFinite(date.getTime())&&<time dateTime={date.toISOString()}>{date.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})} · {date.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})}</time>}
    </div>
  </article>;
}
function Progress({progress}){
  const rows=homeProgress(progress);
  const awards=Array.isArray(progress.awards)?progress.awards:[];
  const persona=archetypes[progress.persona];
  return <>
    <div className="ogcl-home-todo">
      {rows.map(row=><article key={row.id} className="ogcl-home-task">
        <div><NavLink to={row.href}><strong>{row.label}</strong></NavLink>
          {row.id==="persona"?<small>{row.result?(persona?persona.m[0]+" / "+persona.f[0]+" ("+row.result+")":row.result):"Take the Dating Persona Test"}</small>:<small>{row.detail}</small>}
        </div>
        {row.id!=="persona"&&<div className="ogcl-home-progress">
          <strong>{row.percent}%</strong><progress aria-label={row.label} value={row.percent} max={100}/>
        </div>}
      </article>)}
    </div>
    <section className="ogcl-home-awards">
      <h2>Personality awards</h2>
      {Object.entries(AWARD_DEFINITIONS).map(([code,award])=>{
        const earned=awards.find(a=>a.code===code);
        return <article className="ogcl-home-award" key={code}><strong>{award.label}</strong><span className="ogcl-home-award-state">{earned?"Earned":code==="explorer"?progress.pagesVisited+" / "+progress.pageTotal+" pages":"Not yet earned"}</span>
          <small>{award.description}</small></article>;
      })}
    </section>
  </>;
}
export default function HomeView({Photo}){
  const {user,accountRequest}=useMemberSession();
  const [params,setParams]=useSearchParams();
  const tab=params.get("tab")==="todo"?"todo":"feed";
  const [data,setData]=useState(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!user?.id)return;
    let active=true;setLoading(true);setError("");
    (async()=>{
      await accountRequest("/home","POST",{event:"visit",path:"/home"}).catch(()=>{});
      const next=await accountRequest("/home");
      if(!Array.isArray(next?.feed)||!next.progress)throw Error("Invalid Home response");
      if(active)setData(next);
    })().catch(()=>{if(active)setError("Couldn't load your Home activity. Please retry.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[user?.id,accountRequest,retry]);
  return <section className="ogcl-view ogcl-home" aria-labelledby="ogcl-home-heading">
    <div className="ogcl-period-stage">
      <header className="ogcl-view-head"><h1 id="ogcl-home-heading" data-ogc-edit-text="site.home.heading">Welcome to OG Cupid</h1></header>
      <nav className="ogcl-period-tabs" aria-label="Home sections">
        {[["feed","what's going on"],["todo","What to do"]].map(([id,label])=><button key={id} type="button" className={tab===id?"selected":""} aria-current={tab===id?"page":undefined} onClick={()=>setParams(id==="todo"?{tab:"todo"}:{})}>{label}</button>)}
      </nav>
    </div>
    <div className="ogcl-content-panel">
      {loading&&!data&&<p role="status">Loading your activity…</p>}
      {error&&<p role="alert" className="ogcl-error">{error} <button type="button" onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}
      {data&&<><div className="ogcl-home-refresh"><button type="button" className="ogcl-button ogcl-secondary" disabled={loading} onClick={()=>setRetry(n=>n+1)}>{loading?"Refreshing…":"Refresh"}</button></div>
      {tab==="feed"?<div className="ogcl-home-feed" aria-label="Recent activity">
        {data.feed.length?data.feed.slice(0,20).map(event=><Event key={event.id} event={event} Photo={Photo}/>):<p>No recent activity matches your preferences yet.</p>}
        {data.truncated&&<p className="ogcl-home-muted">Activity is limited to the most recent {data.candidateLimit} eligible profiles.</p>}
      </div>:<Progress progress={data.progress}/>}</>}
    </div>
  </section>;
}
