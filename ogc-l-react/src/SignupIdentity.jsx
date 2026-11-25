import React,{useEffect,useId,useRef,useState} from "react";
import {Navigate,useNavigate} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {PROFILE_GENDERS,PROFILE_ORIENTATIONS,PROFILE_LOOKING_GENDERS,PROFILE_INTENTIONS,signupLookingDefaults,validSignupPreferences} from "./profile-options.mjs";

function Choices({label,options,selected,onChange,disabled}){
  const [open,setOpen]=useState(false);
  const root=useRef(null),trigger=useRef(null),id=useId();
  useEffect(()=>{
    if(!open)return;
    const close=e=>{if(!root.current?.contains(e.target))setOpen(false);};
    document.addEventListener("pointerdown",close);
    return()=>document.removeEventListener("pointerdown",close);
  },[open]);
  const summary=options.filter(x=>selected.includes(x.value)).map(x=>x.label).join(", ");
  return <div ref={root} className="ogcl-signup3-choices" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}
    onKeyDown={e=>{if(e.key==="Escape"&&open){e.preventDefault();setOpen(false);trigger.current?.focus();}}}>
    <span id={id+"-label"}>{label}</span>
    <button ref={trigger} type="button" className="ogcl-signup3-dropdown" disabled={disabled}
      aria-expanded={open&&!disabled} aria-controls={id+"-choices"} aria-labelledby={id+"-label "+id+"-summary"}
      onClick={()=>setOpen(v=>!v)}><span id={id+"-summary"}>{summary||"Choose"}</span><span aria-hidden="true">▾</span></button>
    <fieldset id={id+"-choices"} className="ogcl-signup3-menu" hidden={!open||disabled} disabled={disabled} aria-labelledby={id+"-label"}>
      {options.map(({value,label})=><button key={value} type="button" className="ogcl-signup3-option" aria-pressed={selected.includes(value)}
        onClick={()=>onChange(selected.includes(value)?selected.filter(x=>x!==value):[...selected,value])}>{label}</button>)}
    </fieldset>
  </div>;
}
function birthDateLimit(years){
  const now=new Date();
  return new Date(Date.UTC(now.getUTCFullYear()-years,now.getUTCMonth(),now.getUTCDate())).toISOString().slice(0,10);
}
export default function SignupIdentity({selection,onSaved}){
  const {kind,user,accountRequest,refresh}=useMemberSession();
  const navigate=useNavigate();
  const [draft,setDraft]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  const touched=useRef(false),submitting=useRef(false);
  useEffect(()=>{
    if(kind!=="onboarding")return;
    let active=true;setLoading(true);setError("");
    Promise.all([accountRequest("/onboarding"),accountRequest("/profile")]).then(([data,rawProfile])=>{
      if(!active)return;
      const state=data?.state||{};
      const gender=state.gender||selection?.gender||"";
      const orientation=state.orientation||selection?.orientation||"";
      const stored=rawProfile?.profile;
      const existingGenders=String(stored?.interestedIn||"").split(", ").filter(x=>PROFILE_GENDERS.includes(x));
      const existingIntentions=String(stored?.relationshipGoal||"").split(", ").filter(x=>PROFILE_INTENTIONS.some(c=>c.value===x));
      const interestedIn=Array.isArray(state.signup_interested_in)?state.signup_interested_in:existingGenders.length?existingGenders:signupLookingDefaults(gender,orientation);
      const intentions=Array.isArray(state.signup_intentions)?state.signup_intentions:existingIntentions;
      touched.current=Array.isArray(state.signup_interested_in)||existingGenders.length>0;
      setDraft({gender,orientation,interestedIn,intentions,birthDate:String(state.birth_date||"").slice(0,10)});
    }).catch(()=>{if(active)setError("Could not load your saved choices. Please retry.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[kind,user?.id,accountRequest,retry]); // selection is stable for this mounted step.
  if(kind==="member")return <Navigate to="/home" replace/>;
  if(kind==="guest")return <Navigate to="/signin" replace/>;
  if(kind==="error"||kind==="unconfigured")return <p role="alert">Account service unavailable. <button type="button" onClick={()=>void refresh()}>Retry</button></p>;
  if(kind!=="onboarding"||loading)return <p role="status">Checking your account…</p>;
  if(!draft)return <div role="alert">{error} <button type="button" onClick={()=>setRetry(n=>n+1)}>Retry</button></div>;
  const updateIdentity=(key,value)=>setDraft(old=>{
    const next={...old,[key]:value};
    if(!touched.current)next.interestedIn=signupLookingDefaults(next.gender,next.orientation);
    return next;
  });
  async function submit(e){
    e.preventDefault();
    if(submitting.current||!e.currentTarget.reportValidity()||!validSignupPreferences(draft)||!draft.birthDate)return;
    submitting.current=true;setBusy(true);setError("");
    try{
      const result=await accountRequest("/onboarding","PUT",{step:"signup-preferences",...draft});
      if(!result?.saved)throw Error("Choices were not saved.");
      onSaved?.();
      await refresh();
      navigate("/signup4",{replace:true});
    }catch(e){setError(e?.code==="invalid"?e.message:"Your choices couldn't be saved. Please retry.");}
    finally{submitting.current=false;setBusy(false);}
  }
  return <form className="ogcl-signup3" onSubmit={submit}>
    <h1>So who are you, really?</h1>
    <label className="ogcl-signup3-birthdate">Birthdate<input type="date" name="birthDate" required min={birthDateLimit(120)} max={birthDateLimit(18)} value={draft.birthDate} disabled={busy} onChange={e=>setDraft(old=>({...old,birthDate:e.target.value}))}/></label>
    <div className="ogcl-signup3-grid">
      <p id="signup3-hint" className="ogcl-signup3-hint">Pick whatever is closest, we cant afford a 10k parameter search engine</p>
      <label className="ogcl-signup3-select">Gender
        <select required value={draft.gender} disabled={busy} aria-describedby="signup3-hint" onChange={e=>updateIdentity("gender",e.target.value)}>
          <option value="">Choose</option>{PROFILE_GENDERS.map(value=><option key={value}>{value}</option>)}
        </select>
      </label>
      <label className="ogcl-signup3-select">Sexuality
        <select required value={draft.orientation} disabled={busy} aria-describedby="signup3-hint" onChange={e=>updateIdentity("orientation",e.target.value)}>
          <option value="">Choose</option>{PROFILE_ORIENTATIONS.map(value=><option key={value}>{value}</option>)}
        </select>
      </label>
      <Choices label="Looking for" options={PROFILE_LOOKING_GENDERS} selected={draft.interestedIn} disabled={busy}
        onChange={items=>{touched.current=true;setDraft(old=>({...old,interestedIn:items}));}}/>
      <Choices label="To have" options={PROFILE_INTENTIONS} selected={draft.intentions} disabled={busy}
        onChange={items=>setDraft(old=>({...old,intentions:items}))}/>
    </div>
    <button type="submit" disabled={busy||!draft.birthDate||!validSignupPreferences(draft)}>{busy?"SAVING…":"CONTINUE"}</button>
    {error&&<p className="ogcl-signup-error" role="alert">{error}</p>}
  </form>;
}
