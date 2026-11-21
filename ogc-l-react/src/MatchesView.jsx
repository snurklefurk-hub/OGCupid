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
function SearchControls({filters,update,toggleChoice,reset,apply,hasLocation,members}){
  const [open,setOpen]=useState("");
  const form=useRef(null);
  React.useLayoutEffect(()=>{
    const position=()=>{
      const trigger=document.getElementById("chip-"+open);
      const menu=trigger?.parentElement.querySelector(".chip-editor");
      if(!menu)return;
      const left=trigger.parentElement.getBoundingClientRect().left;
      menu.style.left=Math.min(0,window.innerWidth-left-menu.offsetWidth-8)+"px";
    };
    position();
    window.addEventListener("resize",position);
    return ()=>window.removeEventListener("resize",position);
  },[open]);
  useEffect(()=>{
    const dismiss=e=>{if(!e.target.closest?.(".filter-chip"))setOpen("");};
    document.addEventListener("pointerdown",dismiss);
    return ()=>document.removeEventListener("pointerdown",dismiss);
  },[]);
  function closeMenu(){
    document.getElementById("chip-"+open)?.focus();
    setOpen("");
  }
  function menuRow(label,selected,choose){
    return <button key={label} type="button" className="chip-option" aria-pressed={selected}
      onClick={choose}><span>{label}</span><i aria-hidden="true">{selected?"✓":""}</i></button>;
  }
  function pick(key,value){update(key,value);closeMenu();}
  const memberChoices=key=>[...new Set((members||[]).map(member=>member[key]).filter(x=>typeof x==="string"&&x.trim()))]
    .sort((a,b)=>a.localeCompare(b));
  function chip(id,label,editor,remove){
    return <div key={id} className={"filter-chip "+(id==="advanced"?"green":"")}>
      <button type="button" id={"chip-"+id} aria-expanded={open===id}
        onClick={()=>setOpen(open===id?"":id)}>{label} <span aria-hidden="true">▾</span></button>
      {remove&&<button type="button" aria-label={"Clear "+label} onClick={remove}>×</button>}
      {open===id&&<div className="chip-editor" role="group" aria-labelledby={"chip-"+id}>{editor}</div>}
    </div>;
  }
  function choices(key,label,options){
    const selected=filters[key];
    const names=options.filter(x=>selected.includes(x.value)).map(x=>x.label);
    return chip(key,names.join(", ")||label,options.map(x=>menuRow(x.label,selected.includes(x.value),()=>toggleChoice(key)(x.value,!selected.includes(x.value)))),selected.length?()=>update(key,[]):null);
  }
  const fields=SEARCH_ADVANCED_GROUPS.flatMap(g=>g.fields);
  const [extra,setExtra]=useState([]);
  const visible=new Set(["status","height","smoking","education",...extra,...Object.keys(filters.advanced)]);
  const advanced=(key,value)=>update("advanced",{...filters.advanced,[key]:value});
  function fieldChip(field){
    const value=filters.advanced[field.key]||"";
    const options=field.options||memberChoices(field.key);
    const choose=x=>{advanced(field.key,x);closeMenu();};
    const editor=<>{menuRow("Any",!value,()=>choose(""))}
      {options.map(x=>menuRow(x,value===x,()=>choose(x)))}
      {!options.length&&<small>No values in available profiles.</small>}</>;
    return chip(field.key,field.label+(value?": "+value:""),editor,value?()=>advanced(field.key,""):null);
  }
  return <form ref={form} className="classic-search" onSubmit={e=>{e.preventDefault();apply();setOpen("");}}
    onKeyDown={e=>{if(e.key==="Escape"&&open){document.getElementById("chip-"+open)?.focus();setOpen("");}}}>
    <p>Show me</p><div className="chip-flow">
      {choices("genders","Interested in",LOOKING_GENDERS)}
      {chip("age",`Ages ${filters.ageMin} to ${filters.ageMax}`,<div className="age-menu">{["ageMin","ageMax"].map(key=><div key={key}>
        <strong>{key==="ageMin"?"From":"To"}</strong><div className="age-options" aria-label={key==="ageMin"?"Minimum age":"Maximum age"}>
        {AGE_CHOICES.filter(n=>key==="ageMin"?n<=filters.ageMax:n>=filters.ageMin).map(n=>menuRow(n,filters[key]===n,()=>update(key,n)))}</div></div>)}</div>)}
      {chip("radius",filters.radius?`Within ${filters.radius} miles of me`:"Anywhere",<>
        {hasLocation&&LOOKING_RADII.map(r=>menuRow(r.value?r.value+" miles":"Anywhere",r.value===filters.radius,()=>pick("radius",r.value)))}
        {!hasLocation&&<small>Save a verified location to filter by miles.</small>}</>)}
      {choices("intentions","Looking for",LOOKING_INTENTIONS)}
      {chip("username",filters.search||"Search by username",<>{menuRow("Any username",!filters.search,()=>pick("search",""))}{memberChoices("displayName").map(name=>menuRow(name,filters.search===name,()=>pick("search",name)))}</>,filters.search?()=>update("search",""):null)}
      {fields.filter(f=>visible.has(f.key)).map(fieldChip)}
      {chip("advanced","Advanced",SEARCH_ADVANCED_GROUPS.map(g=><div key={g.name}><strong>{g.name}</strong>
        {g.fields.map(f=><button key={f.key} className="chip-option" type="button" onClick={()=>{
          setExtra(prev=>[...new Set([...prev,f.key])]);setOpen(f.key);
          requestAnimationFrame(()=>document.getElementById("chip-"+f.key)?.focus());
        }}>{f.label} ›</button>)}</div>))}
    </div><div className="chip-order"><p>Order by</p>
      {chip("sort",filters.sort==="match"?"Special Blend":SEARCH_SORTS.find(s=>s.value===filters.sort)?.label,
        SEARCH_SORTS.map(s=>menuRow(s.value==="match"?"Special Blend (Match %)":s.label,filters.sort===s.value,()=>pick("sort",s.value))))}
    </div><footer><button type="submit">Search</button><button type="button" onClick={()=>{reset();setExtra([]);setOpen("");}}>Reset</button></footer>
  </form>;
}
export default function MatchesView({Photo}){
  const {discovery,discoveryUnavailable,refresh,loadConnections,setFavorite,loadOwnSettings}=useMemberSession();
  const [tab,setTab]=useState("search");
  const [filters,setFilters]=useState(()=>savedSearchDefaults(null));
  const [savedSettings,setSavedSettings]=useState(null);
  const [settingsError,setSettingsError]=useState("");
  const [applied,setApplied]=useState(filters);
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
      if(!edited.current){const defaults=savedSearchDefaults(profile);setFilters(defaults);setApplied(defaults);}
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
    const defaults=savedSearchDefaults(savedSettings);setFilters(defaults);setApplied(defaults);
  }
  useEffect(()=>setPage(1),[tab,applied]);
  const searchResults=useMemo(()=>filterAndSortMembers(discovery,applied),[discovery,applied]);
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
        toggleChoice={toggleChoice} reset={reset} apply={()=>setApplied(filters)}
        members={discovery}
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
              applied.search?"No members match those search filters.":"No available members match your filters."}
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
