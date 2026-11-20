import React,{useEffect,useMemo,useState} from "react";
import {NavLink} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {filterAndSortMembers,pageMembers} from "./member-directory.mjs";
import "./matches.css";

const TABS=[["search","Search"],["quiver","Quiver"],["favorites","Favorites"]];
const emptyConnections={favorites:new Set(),favoriteMembers:[],quiver:[],favoritedByCount:0,blockedByCount:0,blocks:[]};
function score(member){
  return typeof member.matchPercent==="number"
    ? member.matchPercent+"% Match"
    : "Match score not yet available";
}
function MemberResult({member,Photo,favorited,onFavorite,busy}){
  return <article className="ogcl-match-result">
    <NavLink to={"/profiles/"+encodeURIComponent(member.slug)} className="ogcl-match-result-photo"
      aria-label={"View "+member.displayName+"'s profile"}><Photo member={member}/></NavLink>
    <div className="ogcl-match-result-copy">
      <NavLink to={"/profiles/"+encodeURIComponent(member.slug)} className="ogcl-match-result-name">{member.displayName}</NavLink>
      <p className="ogcl-match-result-meta">
        {[member.age?member.age+"":null,member.cityRegion].filter(Boolean).join(" · ")||"Member profile"}
      </p>
      <p className="ogcl-match-result-blurb">Read this member’s complete profile and see what you have in common.</p>
      <button type="button" className="ogcl-match-favorite" disabled={busy}
        onClick={()=>onFavorite(member.userId,!favorited)}>
        {busy?"Saving…":favorited?"Remove from Favorites":"Save to Favorites"}
      </button>
    </div>
    <div className="ogcl-match-result-score">{score(member)}</div>
  </article>;
}
export default function MatchesView({Photo}){
  const {discovery,discoveryUnavailable,refresh,loadConnections,setFavorite}=useMemberSession();
  const [tab,setTab]=useState("search");
  const [search,setSearch]=useState("");
  const [sort,setSort]=useState("match");
  const [page,setPage]=useState(1);
  const [connections,setConnections]=useState(null);
  const [loading,setLoading]=useState(true);
  const [busyId,setBusyId]=useState(null);
  const [error,setError]=useState("");
  async function load(){
    setError("");setLoading(true);
    try{setConnections(await loadConnections());}
    catch{setError("Your Quiver and Favorites couldn't load. Retry to view saved lists.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{
    let active=true;
    setLoading(true);
    void loadConnections().then(data=>{if(active)setConnections(data);})
      .catch(()=>{if(active)setError("Your Quiver and Favorites couldn't load. Retry to view saved lists.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[loadConnections]);
  useEffect(()=>setPage(1),[tab,search,sort]);
  const searchResults=useMemo(()=>filterAndSortMembers(discovery,{search,sort}),[discovery,search,sort]);
  const active=connections||emptyConnections;
  const results=tab==="search"?searchResults:tab==="quiver"?active.quiver:active.favoriteMembers;
  const paged=pageMembers(results,page,24);
  async function favorite(userId,value){
    if(busyId)return;
    setBusyId(userId);setError("");
    try{
      await setFavorite(userId,value);
      setConnections(await loadConnections());
    }catch{setError("That Favorite change wasn't saved. Please retry.");}
    finally{setBusyId(null);}
  }
  return <section className="ogcl-view ogcl-matches-page" aria-labelledby="ogcl-matches-title">
    <header className="ogcl-view-head ogcl-matches-head">
      <h1 id="ogcl-matches-title">Matches</h1>
      <p>Meet people who want more than a swipe.</p>
    </header>
    <nav className="ogcl-matches-tabs" aria-label="Matches sections">
      {TABS.map(([id,label])=><button type="button" key={id}
        aria-current={tab===id?"page":undefined} onClick={()=>setTab(id)}>
        {label}{id==="quiver"&&connections?" ("+connections.quiver.length+")":""}
      </button>)}
    </nav>
    <div className="ogcl-matches-body">
      {tab==="search"&&<div className="ogcl-matches-search">
        <p className="ogcl-matches-prompt">Show me</p>
        <div className="ogcl-match-controls">
          <label>Search by username
            <input type="search" placeholder="Search members" maxLength={80}
              value={search} onChange={e=>setSearch(e.target.value)}/>
          </label>
          <label>Order by
            <select value={sort} onChange={e=>setSort(e.target.value)}>
              <option value="match">Special Blend (Match %)</option>
              <option value="name">Username A–Z</option>
            </select>
          </label>
          <button type="button" className="ogcl-matches-reset"
            onClick={()=>{setSearch("");setSort("match");}}>Reset</button>
        </div>
      </div>}
      {tab==="favorites"&&<p className="ogcl-matches-inbound-count">
        You have been favorited by {active.favoritedByCount} {active.favoritedByCount===1?"person":"people"}.
      </p>}
      {tab==="quiver"&&<p className="ogcl-matches-description">
        People you liked in Quickmatch who liked you back.
      </p>}
      {tab==="favorites"&&<p className="ogcl-matches-description">
        Members you've saved to Favorites. Only you can see this list.
      </p>}
      {loading&&<p role="status">Loading Matches…</p>}
      {error&&<div role="alert" className="ogcl-error"><p>{error}</p>
        <button type="button" onClick={()=>void load()}>Retry</button></div>}
      {tab==="search"&&discoveryUnavailable&&<div role="alert">
        <p>Member search is unavailable right now.</p>
        <button type="button" onClick={refresh}>Try again</button>
      </div>}
      {!loading && !error && !(tab==="search"&&discoveryUnavailable)&&<>
        <p className="ogcl-matches-result-count">{results.length} {results.length===1?"member":"members"}</p>
        {paged.items.length?<div className="ogcl-matches-results">
          {paged.items.map(member=><MemberResult key={member.userId} member={member}
            Photo={Photo} favorited={active.favorites.has(member.userId)}
            onFavorite={(id,value)=>void favorite(id,value)} busy={busyId===member.userId}/>)}
        </div>:<p className="ogcl-matches-empty">
          {tab==="quiver"?"No mutual Quickmatch Likes yet.":
            tab==="favorites"?"You haven't saved anyone to Favorites yet.":
              search?"No members match that username.":"No available members match your search."}
        </p>}
        {paged.totalPages>1&&<nav className="ogcl-pages" aria-label="Matches pages">
          {Array.from({length:paged.totalPages},(_,i)=><button key={i} type="button"
            aria-current={paged.page===i+1?"page":undefined} onClick={()=>setPage(i+1)}>{i+1}</button>)}
        </nav>}
      </>}
    </div>
  </section>;
}
