import React,{useEffect,useRef,useState} from "react";
import {Navigate,useNavigate} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {PROFILE_GENDERS,PROFILE_ORIENTATIONS,PROFILE_LOOKING_GENDERS,PROFILE_INTENTIONS,signupLookingDefaults,validSignupPreferences} from "./profile-options.mjs";

function Choices({label,options,selected,onChange,disabled}){
  return <fieldset className="ogcl-signup3-choices" disabled={disabled}>
    <legend>{label}</legend>
    {options.map(({value,label})=><label key={value}><input type="checkbox" checked={selected.includes(value)}
      onChange={e=>onChange(e.target.checked?[...selected,value]:selected.filter(x=>x!==value))}/> {label}</label>)}
  </fieldset>;
}
export default function SignupIdentity({selection,onSaved}){
  const {kind,accountRequest,refresh}=useMemberSession();
  const navigate=useNavigate();
  const [draft,setDraft]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  const touched=useRef(false),submitting=useRef(false);
  useEffect(()=>{
    if(kind!=="onboarding")return;
    let active=true;setLoading(true);setError("");
    accountRequest("/onboarding").then(data=>{
      if(!active)return;
      const state=data?.state||{};
      const gender=state.gender||selection?.gender||"";
      const orientation=state.orientation||selection?.orientation||"";
      const interestedIn=Array.isArray(state.signup_interested_in)?state.signup_interested_in:signupLookingDefaults(gender,orientation);
      const intentions=Array.isArray(state.signup_intentions)?state.signup_intentions:[];
      touched.current=Array.isArray(state.signup_interested_in);
      setDraft({gender,orientation,interestedIn,intentions});
    }).catch(()=>{if(active)setError("Could not load your saved choices. Please retry.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[kind,accountRequest,retry]); // selection is stable for this mounted step.
  if(kind==="member")return <Navigate to="/home" replace/>;
  if(kind==="guest")return <Navigate to="/signin" replace/>;
  if(kind!=="onboarding"||loading)return <p role="status">Checking your account…</p>;
  if(!draft)return <div role="alert">{error} <button type="button" onClick={()=>setRetry(n=>n+1)}>Retry</button></div>;
  const updateIdentity=(key,value)=>setDraft(old=>{
    const next={...old,[key]:value};
    if(!touched.current)next.interestedIn=signupLookingDefaults(next.gender,next.orientation);
    return next;
  });
  async function submit(e){
    e.preventDefault();
    if(submitting.current||!validSignupPreferences(draft))return;
    submitting.current=true;setBusy(true);setError("");
    try{
      const result=await accountRequest("/onboarding","PUT",{step:"signup-preferences",...draft});
      if(!result?.saved)throw Error("Choices were not saved.");
      onSaved?.();
      await refresh();
      navigate("/onboarding",{replace:true});
    }catch(e){setError(e?.code==="invalid"?e.message:"Your choices couldn't be saved. Please retry.");}
    finally{submitting.current=false;setBusy(false);}
  }
  return <form className="ogcl-signup3" onSubmit={submit}>
    <h1>So who are you, really?</h1>
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
    <button type="submit" disabled={busy||!validSignupPreferences(draft)}>{busy?"SAVING…":"CONTINUE"}</button>
    {error&&<p className="ogcl-signup-error" role="alert">{error}</p>}
  </form>;
}
