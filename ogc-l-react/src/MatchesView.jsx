import React,{useEffect,useMemo,useRef,useState} from "react";
import {NavLink} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {
  SEARCH_ADVANCED_GROUPS,SEARCH_SORTS,savedSearchDefaults,
  filterAndSortMembers,isOnlineNow,pageMembers,activityBucket,ACTIVITY_WINDOWS
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
function MemberResult({member,Photo,favorited,onFavorite,busy,canFavorite,now}){
  const status=activityBucket(member.lastSeenAt,now);
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
        {status==="Online now"?status:"Last online: "+status.toLowerCase()}</p>}
      {member.aboutMe&&<p className="ogcl-match-result-blurb">{member.aboutMe}</p>}
      <button type="button" className="ogcl-match-favorite" disabled={busy||!canFavorite}
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
    return chip(key,names.length?label+": "+names.join(", "):label,options.map(x=>menuRow(x.label,selected.includes(x.value),()=>toggleChoice(key)(x.value,!selected.includes(x.value)))),selected.length?()=>update(key,[]):null);
  }
  const fields=SEARCH_ADVANCED_GROUPS.flatMap(g=>g.fields);
  const [expanded,setExpanded]=useState(false);
  const primary=new Set(["status","relationshipType","ethnicity"]);
  const advanced=(key,value)=>update("advanced",{...filters.advanced,[key]:value});
  function fieldChip(field,title=field.label){
    const value=filters.advanced[field.key]||"";
    const options=field.options||memberChoices(field.key);
    const choose=x=>{advanced(field.key,x);closeMenu();};
    const editor=<>{menuRow("Any",!value,()=>choose(""))}
      {options.map(x=>menuRow(x,value===x,()=>choose(x)))}
      {!options.length&&<small>No values in available profiles.</small>}</>;
    return chip(field.key,title+(value?": "+value:""),editor,value?()=>advanced(field.key,""):null);
  }
  return <form ref={form} className="classic-search" onSubmit={e=>{e.preventDefault();apply();setOpen("");}}
    onKeyDown={e=>{if(e.key==="Escape"&&open){document.getElementById("chip-"+open)?.focus();setOpen("");}}}>
    <p>Show me</p><div className="chip-flow">
      {choices("genders","Gender",LOOKING_GENDERS)}
      {choices("whoLike","Who like",LOOKING_GENDERS)}
      {chip("age",`Ages ${filters.ageMin} to ${filters.ageMax}`,<div className="age-menu">{["ageMin","ageMax"].map(key=><div key={key}>
        <strong>{key==="ageMin"?"From":"To"}</strong><div className="age-options" aria-label={key==="ageMin"?"Minimum age":"Maximum age"}>
        {AGE_CHOICES.filter(n=>key==="ageMin"?n<=filters.ageMax:n>=filters.ageMin).map(n=>menuRow(n,filters[key]===n,()=>update(key,n)))}</div></div>)}</div>)}
      {chip("radius",filters.radius?`Within ${filters.radius} miles of me`:"Anywhere",<>
        {hasLocation&&LOOKING_RADII.map(r=>menuRow(r.value?r.value+" miles":"Anywhere",r.value===filters.radius,()=>pick("radius",r.value)))}
        {!hasLocation&&<small>Save a verified location to filter by miles.</small>}</>)}
      {choices("intentions","Looking for",LOOKING_INTENTIONS)}
      {fieldChip(fields.find(f=>f.key==="status"),"Who are")}
      {fieldChip(fields.find(f=>f.key==="relationshipType"),"That are")}
      {chip("activity",filters.activity||"Last online",["",...ACTIVITY_WINDOWS.map(([label])=>label)].map(label=>
        menuRow(label||"Any time",filters.activity===label,()=>pick("activity",label))))}
      {fieldChip(fields.find(f=>f.key==="ethnicity"),"Race")}
    </div><div className="chip-extras">
      <div className="filter-chip green"><button type="button" id="chip-advanced" aria-expanded={expanded}
        aria-controls="advanced-filter-tray" onClick={()=>{setOpen("");setExpanded(!expanded);}}>
        Advanced <span aria-hidden="true">{expanded?"▴":"▾"}</span></button></div>
    </div><div id="advanced-filter-tray" className="advanced-filter-tray">
      {fields.filter(f=>!primary.has(f.key)&&(expanded||filters.advanced[f.key])).map(f=>fieldChip(f))}
      {(expanded||filters.kidPlans)&&chip("kidPlans",filters.kidPlans||"Desire for kids",
        ["","Wants children","Doesn’t want children","Undecided"].map(x=>menuRow(x||"Any",filters.kidPlans===x,()=>pick("kidPlans",x))),
        filters.kidPlans?()=>update("kidPlans",""):null)}
    </div><div className="chip-order"><p>Order by</p>
      {chip("sort",filters.sort==="match"?"Special Blend":SEARCH_SORTS.find(s=>s.value===filters.sort)?.label,
        SEARCH_SORTS.map(s=>menuRow(s.value==="match"?"Special Blend (Match %)":s.label,filters.sort===s.value,()=>pick("sort",s.value))))}
    </div><footer><button type="submit">Search</button><button type="button" onClick={()=>{reset();setExpanded(false);setOpen("");}}>Reset</button></footer>
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
  const [connectionsLoading,setConnectionsLoading]=useState(true);
  const [connectionsError,setConnectionsError]=useState("");
  const [busyId,setBusyId]=useState(null);
  const [favoriteError,setFavoriteError]=useState("");
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
    setConnectionsError("");setConnectionsLoading(true);
    try{setConnections(await loadConnections());}
    catch{
      setConnections(null);
      setConnectionsError("Your Quiver and Favorites couldn't load. Retry to view saved lists.");
    }finally{setConnectionsLoading(false);}
  }
  useEffect(()=>{
    let active=true;
    setConnectionsLoading(true);
    void loadConnections().then(data=>{if(active)setConnections(data);})
      .catch(()=>{
        if(active){
          setConnections(null);
          setConnectionsError("Your Quiver and Favorites couldn't load. Retry to view saved lists.");
        }
      }).finally(()=>{if(active)setConnectionsLoading(false);});
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
  const searchResults=useMemo(()=>filterAndSortMembers(discovery,applied,now),[discovery,applied,now]);
  const active=connections||emptyConnections;
  const results=tab==="search"?searchResults:tab==="quiver"?active.quiver:active.favoriteMembers;
  const paged=pageMembers(results,page);
  async function favorite(userId,value){
    if(busyId)return;
    if(!connections)return;
    setBusyId(userId);setFavoriteError("");
    try{
      await setFavorite(userId,value);
      setConnections(await loadConnections());
    }catch{
      setConnections(null);
      setConnectionsError("Your Quiver and Favorites couldn't load. Retry to view saved lists.");
      setFavoriteError("That Favorite change couldn't be confirmed. Reload Favorites before trying again.");
    }finally{setBusyId(null);}
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
      {tab==="favorites"&&connections&&<p className="ogcl-matches-inbound-count">
        You have been favorited by {active.favoritedByCount} {active.favoritedByCount===1?"person":"people"}.
      </p>}
      {tab==="quiver"&&<p className="ogcl-matches-description">
        People you liked in Quickmatch who liked you back.
      </p>}
      {tab==="favorites"&&<p className="ogcl-matches-description">
        Members you've saved to Favorites. Only you can see this list.
      </p>}
      {tab!=="search"&&connectionsLoading&&<p role="status">Loading {tab==="quiver"?"Quiver":"Favorites"}…</p>}
      {tab!=="search"&&connectionsError&&<div role="alert" className="ogcl-error">
        <p>{connectionsError}</p><button type="button" onClick={()=>void load()}>Retry</button>
      </div>}
      {tab==="search"&&!connections&&<p className="ogcl-matches-warning" role="status">
        Favorites controls will be available after your saved Favorites load.
      </p>}
      {favoriteError&&<p role="alert" className="ogcl-error">{favoriteError}</p> 
      {tab==="search"&&discoveryUnavailable&&<div role="alert">
        <p>Member search is unavailable right now.</p>
        <button type="button" onClick={refresh}>Try again</button>
      </div>}
      {(tab==="search"?!discoveryUnavailable:!connectionsLoading&&!connectionsError&&!!connections)&&<>
        <p className="ogcl-matches-result-count">
          {results.length} {results.length===1?"member":"members"}
          {tab==="search"&&" · Search currently checks the 250 most recent eligible profiles."}
        </p>
        {paged.items.length?<div className="ogcl-matches-results">
          {paged.items.map(member=><MemberResult key={member.userId} member={member}
            Photo={Photo} favorited={active.favorites.has(member.userId)}
            onFavorite={(id,value)=>void favorite(id,value)}
            busy={busyId===member.userId} canFavorite={!!connections}
            now={now}/>)}
        </div>:<p className="ogcl-matches-empty">
          {tab==="quiver"?"No mutual Quickmatch Likes yet.":
            tab==="favorites"?"You haven't saved anyone to Favorites yet.":
              "No available members match your filters."}
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
