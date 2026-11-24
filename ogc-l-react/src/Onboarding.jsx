import React,{useEffect,useRef,useState} from "react";
import {Navigate,NavLink,useNavigate} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import PhotoManager from "./PhotoManager.jsx";
import "./account.css";

const genders=["Man","Woman","Transman","Transwoman","Something else"];
const orientations=["Gay","Straight","Bi","Something else"];
const goals=["long-term dating","short-term dating","new friends","casual sex","activity partners"];
const countries="AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
const countryNames=new Intl.DisplayNames(["en"],{type:"region"});
const cleanCity=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const shardFor=value=>cleanCity(value).slice(0,2).padEnd(2,"_");
const cityLabel=city=>[city.n,city.a&&city.a.toLowerCase()!==city.n.toLowerCase()?city.a:"",countryNames.of(city.c)].filter(Boolean).join(", ");
function adultAge(value){
  const date=new Date(String(value||"").slice(0,10)+"T00:00:00Z");
  if(!Number.isFinite(date.getTime()))return null;
  const now=new Date();
  return now.getUTCFullYear()-date.getUTCFullYear()-
    ((now.getUTCMonth()<date.getUTCMonth()||
      (now.getUTCMonth()===date.getUTCMonth()&&now.getUTCDate()<date.getUTCDate()))?1:0);
}
const nextStep=s=>!s?.identity?"identity":!s.locality?"locality":!s.profile?"details":
  !s.photo?"photo":!s.quiz?"quiz":s.explored?"done":"explore";

export function CityChooser({country,stored,onPick}){
  const [input,setInput]=useState(stored?.label||"");
  const [results,setResults]=useState([]);
  const [hint,setHint]=useState("");
  const [zip,setZip]=useState(stored?.zip||"");
  const seq=useRef(0);
  useEffect(()=>{
    setInput(stored?.label||"");
    setZip(stored?.zip||"");
  },[stored?.label,stored?.zip]);
  useEffect(()=>{
    if(country!=="US"||!/^\d{5}$/.test(zip)){return;}
    let alive=true;const serial=++seq.current;
    setHint("Checking ZIP code…");
    (async()=>{
      const res=await fetch("https://api.zippopotam.us/us/"+zip,{cache:"no-store"});
      if(!res.ok)throw Error("ZIP code wasn't found.");
      const data=await res.json();
      const place=data.places?.[0];
      if(!place?.["place name"])throw Error("ZIP code has no listed city.");
      const key=shardFor(place["place name"]);
      const list=await fetch("/locations/"+key+".json",{cache:"force-cache"}).then(r=>{
        if(!r.ok)throw Error("City directory unavailable.");return r.json();
      });
      const city=list.find(item=>item.c==="US"&&
        cleanCity(item.n)===cleanCity(place["place name"])&&
        [place.state,place["state abbreviation"]].some(region=>cleanCity(item.a)===cleanCity(region)));
      if(!city)throw Error("Couldn't verify that ZIP against our city directory.");
      if(alive&&serial===seq.current){onPick({id:city.id,key,label:cityLabel(city)});setHint("✓ "+cityLabel(city));}
    })().catch(e=>{if(alive&&serial===seq.current){onPick(null);setHint(e.message);}});
    return()=>{alive=false;};
  },[country,zip]);
  useEffect(()=>{
    if(country==="US")return;
    const base=input.split(",")[0].trim(),needle=cleanCity(base);
    if(needle.length<2){setResults([]);return;}
    let live=true;const serial=++seq.current;
    setHint("Searching cities…");
    fetch("/locations/"+shardFor(base)+".json",{cache:"force-cache"})
      .then(r=>{if(!r.ok)throw Error("City directory unavailable.");return r.json();})
      .then(list=>{
        if(!live||serial!==seq.current)return;
        const options=list.filter(item=>item.c===country&&cleanCity(item.n).startsWith(needle)).slice(0,14);
        setResults(options);
        setHint(options.length?"Choose a city from the list.":"No matching city. Try a nearby city.");
      }).catch(()=>{if(live&&serial===seq.current){setHint("City search unavailable.");setResults([]);}});
    return()=>{live=false;};
  },[country,input]);
  if(country==="US")return <><label>ZIP code
    <input name="zipCode" type="text" inputMode="numeric" pattern="[0-9]{5}" maxLength={5}
      required value={zip} onChange={e=>{setZip(e.target.value);onPick(null);}}/></label>
    <p className="ogcl-note" role="status">{hint}</p></>;
  return <><label>City
    <input type="search" value={input} required maxLength={100}
      placeholder="Start typing your city"
      onChange={e=>{setInput(e.target.value);onPick(null);}}/></label>
    <p className="ogcl-note" role="status">{hint}</p>
    {!!results.length&&<div role="listbox" className="ogcl-city-options">
      {results.map(item=><button type="button" role="option" key={item.id}
        onClick={()=>{const label=cityLabel(item);setInput(label);
          setResults([]);setHint("✓ "+label);onPick({id:item.id,key:shardFor(item.n),label});}}>
        {cityLabel(item)}</button>)}
    </div>}
  </>;
}

function OptionChecks({title,name,values,selected}){
  return <fieldset><legend>{title}</legend><div className="ogcl-choice-grid">
    {values.map(v=><label className="ogcl-account-check" key={v}>
      <input type="checkbox" name={name} value={v} defaultChecked={selected.includes(v)}/>{v}</label>)}
  </div></fieldset>;
}
function ActionForm({busy,error,children,onSubmit,submitLabel}){
  return <form className="ogcl-account-form" onSubmit={onSubmit}>
    {children}
    <button type="submit" disabled={busy}>{busy?"Saving…":submitLabel}</button>
    {error&&<p role="alert" className="ogcl-error">{error}</p>}
  </form>;
}
export default function Onboarding({signupSelection=null,onIdentitySaved}={}){
  const {kind,user,accountRequest,refresh,signOut,requestEmailVerification}=useMemberSession();
  const navigate=useNavigate();
  const [status,setStatus]=useState(null),[profile,setProfile]=useState(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [location,setLocation]=useState(null);
  const [country,setCountry]=useState("US");
  const [loadError,setLoadError]=useState("");
  const [selected,setSelected]=useState(null);
  async function load(){
    setLoadError("");
    try{
      const [next,rawProfile]=await Promise.all([
        accountRequest("/onboarding"),accountRequest("/profile")
      ]);
      setStatus(next);setProfile(rawProfile?.profile||null);
      setCountry(next.state?.country_code||"US");
      if(next.state?.locality_id&&next.state?.locality_shard){
        setLocation({id:next.state.locality_id,key:next.state.locality_shard,
          label:next.state.city_label||"",zip:next.state.zip_code||""});
        setSelected({id:next.state.locality_id,key:next.state.locality_shard,
          label:next.state.city_label||""});
      }else{setLocation(null);setSelected(null);}
      return next;
    }catch{setLoadError("Couldn't load your saved onboarding progress. Please retry.");return null;}
  }
  useEffect(()=>{if(kind==="onboarding")void load();},[kind,accountRequest]);
  async function submit(work){
    if(busy)return;
    setBusy(true);setError("");
    try{
      await work();
      const next=await load();
      if(next?.explored){await refresh();navigate("/home",{replace:true});}
    }catch(e){setError(e?.code==="invalid"?e.message:"Your changes couldn't be saved. Please retry.");}
    finally{setBusy(false);}
  }
  if(kind==="member")return <section className="ogcl-view"><header className="ogcl-view-head">
    <h1>You're all set.</h1></header><div className="ogcl-content-panel">
      <p>You've completed onboarding. <NavLink to="/home">Go to Home</NavLink>.</p>
    </div></section>;
  if(kind==="guest")return <Navigate to="/signin" replace/>;
  if(kind!=="onboarding")return <section className="ogcl-view" role="status">Checking your account…</section>;
  const step=nextStep(status);
  const state=status?.state||{};
  const progress=(!status?.identity?0:!status?.locality?20:!status?.profile?40:
    !status?.photo?60:!status?.quiz?80:100);
  async function saveIdentity(e){
    e.preventDefault();const f=e.currentTarget;if(!f.reportValidity())return;
    await submit(async()=>{
      const data={step:"identity",gender:f.elements.gender.value,orientation:f.elements.orientation.value};
      const result=await accountRequest("/onboarding","PUT",data);
      if(!result.saved)throw Error("Identity wasn't saved.");
      onIdentitySaved?.();
    });
  }
  async function saveLocation(e){
    e.preventDefault();const f=e.currentTarget;if(!f.reportValidity())return;
    const candidate=selected;
    if(!candidate?.id||!candidate?.key){setError("Choose a verified city or ZIP code first.");return;}
    await submit(async()=>{
      const result=await accountRequest("/onboarding","PUT",{
        step:"locality",birthDate:f.elements.birthDate.value,
        countryCode:country,zipCode:country==="US"?f.elements.zipCode.value:"",
        locality:{id:Number(candidate.id),key:candidate.key}
      });
      if(!result.saved)throw Error("Location wasn't saved.");
    });
  }
  async function saveDetails(e){
    e.preventDefault();const f=e.currentTarget;if(!f.reportValidity())return;
    const genderPrefs=[...f.querySelectorAll('input[name="interestedIn"]:checked')].map(x=>x.value);
    const goalsPrefs=[...f.querySelectorAll('input[name="openTo"]:checked')].map(x=>x.value);
    if(!genderPrefs.length||!goalsPrefs.length){setError("Choose who interests you and what you're looking for.");return;}
    const min=Number(f.elements.minAge.value),max=Number(f.elements.maxAge.value);
    if(min>max){setError("Your preferred age range is backwards.");return;}
    await submit(async()=>{
      const location={id:Number(state.locality_id),key:state.locality_shard};
      if(!location.id||!location.key)throw Error("Your saved city isn't available.");
      const write=await accountRequest("/profile","PUT",{
        aboutMe:f.elements.aboutMe.value.trim(),age:adultAge(state.birth_date),
        gender:state.gender,orientation:state.orientation,
        interestedIn:genderPrefs.join(", "),relationshipGoal:goalsPrefs.join(", "),
        work:f.elements.work.value.trim(),cityRegion:state.city_label||"",
        locality,searchOrigin:location,searchRadiusMiles:Number(f.elements.radius.value)
      });
      if(!write.profile?.userId)throw Error("Profile wasn't saved.");
      const result=await accountRequest("/onboarding","PUT",{
        step:"details",matchAgeMin:min,matchAgeMax:max
      });
      if(!result.saved)throw Error("Profile details weren't confirmed.");
    });
  }
  async function finishExplore(){
    await submit(async()=>{
      const result=await accountRequest("/onboarding","PUT",{step:"explore"});
      if(!result.saved)throw Error("Onboarding wasn't completed.");
    });
  }
  const dropdown=(name,title,options,value,required=false)=><label>{title}
    <select name={name} defaultValue={value??""} required={required}>
      {!required&&<option value="">Select</option>}
      {options.map(x=><option value={x} key={x}>{x}</option>)}
    </select></label>;
  return <section className="ogcl-view ogcl-onboard" aria-label="Getting started with OG Cupid">
    <header className="ogcl-view-head">
      <h1>Welcome to OG Cupid</h1>
      <p>Complete your profile to start meeting people. Your progress is saved to your account.</p>
      <div className="ogcl-onboard-progress" role="progressbar" aria-valuenow={progress}
        aria-valuemin={0} aria-valuemax={100} aria-label="Onboarding progress">
        <span style={{width:progress+"%"}}/></div>
    </header>
    <div className="ogcl-content-panel">
      {loadError&&<p role="alert" className="ogcl-error">{loadError}
        <button type="button" className="ogcl-button" onClick={()=>void load()}>Retry</button></p>}
      {!status&&!loadError&&<p role="status">Loading your saved progress…</p>}
      {status&&<><div className="ogcl-onboard-steps">
        {["Identity","Location","Profile","Photos","Questions"].map((title,i)=>
          <span key={title} className={progress>=20*(i+1)?"done":""}>{i+1}. {title}</span>)}
      </div>
      {step==="identity"&&<ActionForm busy={busy} error={error} submitLabel="Save & continue" onSubmit={saveIdentity}>
        <h2>First, the basics.</h2>
        {dropdown("gender","Gender",genders,state.gender||signupSelection?.gender,true)}
        {dropdown("orientation","Orientation",orientations,state.orientation||signupSelection?.orientation,true)}
      </ActionForm>}
      {step==="locality"&&<ActionForm busy={busy} error={error} submitLabel="Save & continue" onSubmit={saveLocation}>
        <h2>When and where?</h2>
        <p>No street address, no GPS. Your date of birth is used for age and eligibility.</p>
        <label>Birthdate<input type="date" name="birthDate" required defaultValue={String(state.birth_date||"").slice(0,10)}
          max={new Date(Date.UTC(new Date().getUTCFullYear()-18,new Date().getUTCMonth(),new Date().getUTCDate())).toISOString().slice(0,10)}/></label>
        <label>Country<select name="countryCode" value={country}
          onChange={e=>{setCountry(e.target.value);setSelected(null);setLocation(null);}}>
          {countries.sort((a,b)=>countryNames.of(a).localeCompare(countryNames.of(b)))
            .map(code=><option value={code} key={code}>{countryNames.of(code)}</option>)}
        </select></label>
        <CityChooser country={country} stored={location} onPick={setSelected}/>
      </ActionForm>}
      {step==="details"&&<ActionForm busy={busy} error={error} submitLabel="Save profile & continue" onSubmit={saveDetails}>
        <h2>Let’s fill out your profile.</h2>
        <OptionChecks title="I'm interested in" name="interestedIn" values={genders}
          selected={String(profile?.interestedIn||"").split(", ")}/>
        <OptionChecks title="I'm open to" name="openTo" values={goals}
          selected={String(profile?.relationshipGoal||"").split(", ")}/>
        <div className="ogcl-account-inline">
          {dropdown("minAge","Age from",Array.from({length:82},(_,i)=>18+i),state.match_age_min||18,true)}
          {dropdown("maxAge","Age to",Array.from({length:82},(_,i)=>18+i),state.match_age_max||99,true)}
          <label>Distance<select name="radius" defaultValue={profile?.searchRadiusMiles??10}>
            {[0,10,25,50,100,250,500].map(n=><option key={n} value={n}>{n===0?"Anywhere":n+" miles"}</option>)}
          </select></label>
        </div>
        <label>What do you do?<input name="work" maxLength={160} defaultValue={profile?.work||""}/></label>
        <label>My Self Summary<textarea name="aboutMe" rows={8} required minLength={15} maxLength={5000}
          defaultValue={profile?.aboutMe||""} placeholder="What makes you tick? What should somebody know about you?"/></label>
        <p className="ogcl-note">After onboarding, edit the rest of your details and all ten About essays in Profile Settings.</p>
      </ActionForm>}
      {step==="photo"&&<PhotoManager onboarding onCompleted={load}/>}
      {step==="quiz"&&<div className="ogcl-account-step">
        <h2>Let’s get to know you.</h2>
        <p>Answer 25 match questions to unlock member discovery. Your answers are saved as you go.</p>
        <NavLink className="ogcl-button" to="/questions">Answer match questions</NavLink>
        <p className="ogcl-note">Alternatively, you can take the 40-question Dating Persona Test.</p>
        <NavLink to="/persona">Take the Dating Persona Test</NavLink>
        <p><button type="button" className="ogcl-button ogcl-secondary" disabled={busy}
          onClick={()=>void load()}>Check my saved progress</button></p>
        {error&&<p className="ogcl-error">{error}</p>}
      </div>}
      {step==="explore"&&<div className="ogcl-account-step"><h2>You're ready to explore!</h2>
        <p>Your identity, location, profile, photo and personality questions have been saved.</p>
        <button type="button" className="ogcl-button" disabled={busy} onClick={()=>void finishExplore()}>
          {busy?"Finishing…":"Explore OG Cupid"}</button>
        {error&&<p role="alert" className="ogcl-error">{error}</p>}
      </div>}
      <nav className="ogcl-onboard-footer" aria-label="Account options">
        <NavLink to="/account">Account settings and deletion</NavLink>
        <NavLink to="/verify">Verify email</NavLink>
        <button type="button" onClick={()=>void signOut()}>Sign out</button>
        <NavLink to="/contact">Contact</NavLink>
      </nav>
      </>}
    </div>
  </section>;
}
