import React,{useEffect,useMemo,useRef,useState} from "react";
import {NavLink} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {
  SEARCH_ADVANCED_GROUPS,SEARCH_SORTS,savedSearchDefaults,
  filterAndSortMembers,isOnlineNow,pageMembers
} from "./member-directory.mjs";
import {LOOKING_GENDERS,LOOKING_INTENTIONS,LOOKING_RADII,AGE_CHOICES} from "./member-looking-for.mjs";
import "./matches.css";

const TABS=[["search","Search"],["quiver","Quiver"],["favorites","Favorites"]];
const emptyConnections={favorites:new Set(),favoriteMembers:[],quiver:[],favoritedByCount:0,blockedByCount:0,blocks:[]};
function score(member){
  return typeof member.matchPercent==="number"
    ?member.matchPercent+"% Match (provisional)"
    :"Match score not yet available";
}
function lastOnline(date,now){
  if(typeof date!=="string")return null;
  const time=Date.parse(date);
  if(!Number.isFinite(time)||time>now)return null;
  if(isOnlineNow(date,now))return "Online now";
  const minutes=Math.floor((now-time)/60_000);
  if(minutes<60)return "Last online "+Math.max(minutes,3)+" min ago";
  const hours=Math.floor(minutes/60);
  if(hours<24)return "Last online "+hours+" hr ago";
  return "Last online "+Math.floor(hours/24)+" days ago";
}
function MemberResult({member,Photo,favorited,onFavorite,busy,now}){
  const status=lastOnline(member.lastSeenAt,now);
  return <article className="ogcl-match-result">
    <NavLink to={"/profiles/"+encodeURIComponent(member.slug)} className="ogcl-match-result-photo"
      aria-label={"View "+member.displayName+"'s profile"}><Photo member={member}/></NavLink>
    <div className="ogcl-match-result-copy">
      <NavLink to={"/profiles/"+encodeURIComponent(member.slug)} className="ogcl-match-result-name">{member.displayName}</NavLink>
      <p className="ogcl-match-result-meta">
        {[
          Number.isInteger(member.age)?member.age+"":null,
          member.cityRegion||null,
          Number.isInteger(member.distanceMiles)?member.distanceMiles+" miles away":null
        ].filter(Boolean).join(" · ")||"Member profile"}
      </p>
      {status&&<p className={"ogcl-match-result-presence"+(isOnlineNow(member.lastSeenAt,now)?" is-online":"")}>
        {status}</p>}
      {member.aboutMe&&<p className="ogcl-match-result-blurb">{member.aboutMe}</p>}
      <button type="button" className="ogcl-match-favorite" disabled={busy}
        onClick={()=>onFavorite(member.userId,!favorited)}>
        {busy?"Saving…":favorited?"Remove from Favorites":"Save to Favorites"}
      </button>
    </div>
    <div className="ogcl-match-result-score">
      {score(member)}
      {member.commonQuestions>0&&<small>{member.commonQuestions} shared questions</small>}
    </div>
  </article>;
}
function Checks({title,options,selected,toggle}){
  return <fieldset className="ogcl-search-checks">
    <legend>{title}</legend>
    <div className="ogcl-search-check-options">
      {options.map(({value,label})=><label key={value}>
        <input type="checkbox" checked={selected.includes(value)}
          onChange={event=>toggle(value,event.target.checked)}/> {label}
      </label>)}
    </div>
  </fieldset>;
}
function SearchControls({filters,update,toggleChoice,reset,expanded,setExpanded,hasLocation}){
  return <div className="ogcl-matches-search">
    <p className="ogcl-matches-prompt">Show me</p>
    <div className="ogcl-search-primary">
      <Checks title="Interested In" options={LOOKING_GENDERS}
        selected={filters.genders} toggle={toggleChoice("genders")}/>
      <div className="ogcl-search-age">
        <span className="ogcl-search-field-title">Age</span>
        <label>From
          <select value={filters.ageMin} onChange={event=>update("ageMin",Math.min(Number(event.target.value),filters.ageMax))}>
            {AGE_CHOICES.map(age=><option key={age} value={age}>{age}</option>)}
          </select>
        </label>
        <label>To
          <select value={filters.ageMax} onChange={event=>update("ageMax",Math.max(Number(event.target.value),filters.ageMin))}>
            {AGE_CHOICES.map(age=><option key={age} value={age}>{age}</option>)}
          </select>
        </label>
      </div>
      <label className="ogcl-search-distance">Distance
        <select value={filters.radius} onChange={event=>update("radius",Number(event.target.value))}>
          {LOOKING_RADII.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        {!hasLocation&&<small>Save a verified location to filter by miles.</small>}
      </label>
      <Checks title="Looking For" options={LOOKING_INTENTIONS}
        selected={filters.intentions} toggle={toggleChoice("intentions")}/>
    </div>
    <div className="ogcl-match-controls">
      <label>Search by username
        <input type="search" placeholder="Search members" maxLength={80}
          value={filters.search} onChange={event=>update("search",event.target.value)}/>
      </label>
      <label>Sort by
        <select value={filters.sort} onChange={event=>update("sort",event.target.value)}>
          {SEARCH_SORTS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <button className="ogcl-matches-more" type="button" aria-expanded={expanded}
        aria-controls="ogcl-matches-advanced" onClick={()=>setExpanded(!expanded)}>
        More Filters {expanded?"▴":"▾"}
      </button>
      <button type="button" className="ogcl-matches-reset" onClick={reset}>Reset</button>
    </div>
    {expanded&&<div id="ogcl-matches-advanced" className="ogcl-search-advanced">
      {SEARCH_ADVANCED_GROUPS.map(group=><fieldset key={group.name}>
        <legend>{group.name}</legend>
        <div className="ogcl-search-advanced-fields">
          {group.fields.map(field=><label key={field.key}>{field.label}
            {field.options?<select value={filters.advanced[field.key]||""}
              onChange={e=>update("advanced",{...filters.advanced,[field.key]:e.target.value})}>
              <option value="">Any</option>
              {field.options.map(option=><option key={option} value={option}>{option}</option>)}
            </select>:<input type="text" maxLength={80} placeholder="Any"
              value={filters.advanced[field.key]||""}
              onChange={e=>update("advanced",{...filters.advanced,[field.key]:e.target.value})}/>}
          </label>)}
        </div>
      </fieldset>)}
    </div>}
    <p className="ogcl-matches-filter-note">Search filters are temporary. Your saved Profile Settings stay unchanged.</p>
  </div>;
}
export default function MatchesView({Photo}){
  const {discovery,discoveryUnavailable,refresh,loadConnections,setFavorite,loadOwnSettings}=useMemberSession();
  const [tab,setTab]=useState("search");
  const [filters,setFilters]=useState(()=>savedSearchDefaults(null));
  const [savedSettings,setSavedSettings]=useState(null);
  const [settingsError,setSettingsError]=useState("");
  const [expanded,setExpanded]=useState(false);
  const [page,setPage]=useState(1);
  const [connections,setConnections]=useState(null);
  const [loading,setLoading]=useState(true);
  const [busyId,setBusyId]=useState(null);
  const [error,setError]=useState("");
  const [now,setNow]=useState(Date.now());
  const edited=useRef(false);
  useEffect(()=>{
    let active=true;
    void loadOwnSettings().then(profile=>{
      if(!active)return;
      setSavedSettings(profile);
      if(!edited.current)setFilters(savedSearchDefaults(profile));
    }).catch(()=>{if(active)setSettingsError("Saved search defaults are unavailable. Using unrestricted choices.");});
    return()=>{active=false;};
  },[loadOwnSettings]);
  useEffect(()=>{
    if(tab!=="search")return;
    const timer=window.setInterval(()=>setNow(Date.now()),60_000);
    return()=>window.clearInterval(timer);
  },[tab]);
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
  const update=(key,value)=>{edited.current=true;setFilters(prev=>({...prev,[key]:value}));};
  const toggleChoice=key=>(value,checked)=>{
    edited.current=true;
    setFilters(prev=>{
      const options=new Set(prev[key]);
      if(checked)options.add(value);else options.delete(value);
      return {...prev,[key]:[...options]};
    });
  };
  function reset(){
    edited.current=false;
    setFilters(savedSearchDefaults(savedSettings));
  }
  useEffect(()=>setPage(1),[tab,filters]);
  const searchResults=useMemo(()=>filterAndSortMembers(discovery,filters),[discovery,filters]);
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
      {tab==="search"&&<SearchControls filters={filters} update={update}
        toggleChoice={toggleChoice} reset={reset} expanded={expanded}
        setExpanded={setExpanded}
        hasLocation={savedSettings?.lookingFor?.hasValidatedLocality===true}/>}
      {tab==="search"&&settingsError&&<p className="ogcl-matches-warning" role="status">{settingsError}</p>}
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
      {!loading&&!error&&!(tab==="search"&&discoveryUnavailable)&&<>
        <p className="ogcl-matches-result-count">
          {results.length} {results.length===1?"member":"members"}
          {tab==="search"&&" · Search currently checks the 250 most recent eligible profiles."}
        </p>
        {paged.items.length?<div className="ogcl-matches-results">
          {paged.items.map(member=><MemberResult key={member.userId} member={member}
            Photo={Photo} favorited={active.favorites.has(member.userId)}
            onFavorite={(id,value)=>void favorite(id,value)}
            busy={busyId===member.userId} now={now}/>)}
        </div>:<p className="ogcl-matches-empty">
          {tab==="quiver"?"No mutual Quickmatch Likes yet.":
            tab==="favorites"?"You haven't saved anyone to Favorites yet.":
              filters.search?"No members match those search filters.":"No available members match your filters."}
        </p>}
        {paged.totalPages>1&&<nav className="ogcl-pages" aria-label="Matches pages">
          {Array.from({length:paged.totalPages},(_,i)=><button key={i} type="button"
            aria-current={paged.page===i+1?"page":undefined}
            onClick={()=>setPage(i+1)}>{i+1}</button>)}
        </nav>}
      </>}
    </div>
  </section>;
}
