import React,{useEffect,useRef,useState} from "react";
import {Navigate,useNavigate} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {HABIT_CHOICES,EDUCATION_CHOICES,INCOME_CHOICES,DIET_CHOICES,RELIGION_CHOICES,RELIGION_IMPORTANCE_CHOICES,RELATIONSHIP_CHOICES,STATUS_CHOICES,KIDS_CHOICES,SIGNUP_PET_CHOICES,SIGNUP_DETAIL_STEPS,validSignupDetailStep,validSignupDetailValue,nextSignupDetails} from "./signup-detail-options.mjs";
const headings={5:"What do you do?",6:"What do you like?",7:"what are you bringing?"};
function Choice({label,name,options,value,onChange,disabled}){
  return <label className="ogcl-signup-detail-field">
    <span>{label}</span>
    <select name={name} value={value} disabled={disabled} onChange={e=>onChange(name,e.target.value)}>
      <option value="">Choose</option>
      {name==="religion"&&value&&!RELIGION_CHOICES.includes(value)&&<option value={value} disabled>{value} (previous choice)</option>}
      {options.map(item=>{const option=typeof item==="string"?{label:item,value:item}:item;return <option key={option.value} value={option.value}>{option.label}</option>;})}
    </select>
  </label>;
}
function Pets({value,onChange,disabled}){
  const selected=value?value.split(", "):[];
  return <fieldset className="ogcl-signup-pets" disabled={disabled}>
    <legend>Pets</legend>
    <div className="ogcl-signup-pets-grid">
      {SIGNUP_PET_CHOICES.map(option=><button type="button" key={option} aria-pressed={selected.includes(option)}
        onClick={()=>onChange("pets",SIGNUP_PET_CHOICES.filter(x=>x===option?!selected.includes(x):selected.includes(x)).join(", "))}>{option.replace("exotics","others/exotics")}</button>)}
    </div>
  </fieldset>;
}
export default function SignupDetails({page}){
  const {kind,user,accountRequest,refresh}=useMemberSession();
  const navigate=useNavigate();
  const [draft,setDraft]=useState(null),[redirect,setRedirect]=useState(""),[loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  const submitting=useRef(false);
  useEffect(()=>{
    if(kind!=="onboarding")return;
    let active=true;setLoading(true);setDraft(null);setError("");setRedirect("");
    Promise.all([accountRequest("/onboarding"),accountRequest("/profile")]).then(([data,raw])=>{
      if(!active)return;
      const state=data?.state||{};
      if(!data?.identity||!state.birth_date){setRedirect("/signup3");return;}
      if(!data?.locality){setRedirect("/signup4");return;}
      if(data.profile){setRedirect("/onboarding");return;}
      const next=nextSignupDetails(state);
      if(next!=="/onboarding"&&Number(next.slice(-1))<page){setRedirect(next);return;}
      const saved=state["signup"+page+"_details"],old=raw?.profile||{};
      const initial=validSignupDetailStep(page,saved,true)?saved:Object.fromEntries(SIGNUP_DETAIL_STEPS[page].map(key=>[key,validSignupDetailValue(key,old[key])?old[key]:""]));
      if(page===6&&!initial.religion)initial.religionImportance="";
      setDraft(initial);
    }).catch(()=>{if(active)setError("Could not load your saved choices. Please retry.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[kind,user?.id,accountRequest,page,retry]);
  if(kind==="member")return <Navigate to="/home" replace/>;
  if(kind==="guest")return <Navigate to="/signin" replace/>;
  if(kind==="error"||kind==="unconfigured")return <p role="alert">Account service unavailable. <button type="button" onClick={()=>void refresh()}>Retry</button></p>;
  if(kind!=="onboarding"||loading)return <p role="status">Checking your account…</p>;
  if(redirect)return <Navigate to={redirect} replace/>;
  if(!draft)return <p role="alert">{error} <button type="button" onClick={()=>setRetry(n=>n+1)}>Retry</button></p>;
  const update=(name,value)=>setDraft(old=>({...old,[name]:value,...(name==="religion"&&!value?{religionImportance:""}:{})}));
  const select=(name,label,options,disabled=false)=><Choice name={name} label={label} options={options} value={draft[name]} onChange={update} disabled={busy||disabled}/>;
  async function submit(e){
    e.preventDefault();
    if(submitting.current||!e.currentTarget.reportValidity())return;
    const fields=page===5?{...draft,work:draft.work.trim()}:draft;
    if(!validSignupDetailStep(page,fields)){setError("Choose a current religion option or leave it blank.");return;}
    submitting.current=true;setBusy(true);setError("");
    try{
      const result=await accountRequest("/onboarding","PUT",{step:"signup-details",page,fields});
      if(!result?.saved)throw Error("Choices were not saved.");
      navigate(page===7?"/onboarding":"/signup"+(page+1),{replace:true});
    }catch(e){setError(e?.code==="invalid"?e.message:"Your choices couldn't be saved. Please retry.");}
    finally{submitting.current=false;setBusy(false);}
  }
  return <form className={"ogcl-signup3 ogcl-signup-details ogcl-signup"+page} onSubmit={submit}>
    <h1>{headings[page]}</h1>
    {page===5&&<div className="ogcl-signup-detail-grid">
      <label className="ogcl-signup-detail-field"><span>Job</span><input name="work" maxLength={160} value={draft.work} disabled={busy} onChange={e=>update("work",e.target.value)}/></label>
      {select("income","Income",INCOME_CHOICES)}
      {select("education","Education",EDUCATION_CHOICES)}
    </div>}
    {page===6&&<div className="ogcl-signup-detail-grid">
      {select("diet","Diet",DIET_CHOICES)}
      {select("drugs","Drugs (the hard stuff)",HABIT_CHOICES)}
      {select("drinking","Drinking",HABIT_CHOICES)}
      {select("smoking","Smoking",HABIT_CHOICES)}
      {select("vaping","Vaping",HABIT_CHOICES)}
      {select("weed","Weed (any kind)",HABIT_CHOICES)}
      {select("religion","Religion",RELIGION_CHOICES)}
      {select("religionImportance","Importance",RELIGION_IMPORTANCE_CHOICES,!draft.religion)}
    </div>}
    {page===7&&<div className="ogcl-signup-detail-grid">
      {select("relationshipType","Relationship style",RELATIONSHIP_CHOICES)}
      {select("kids","Do you want kids?",KIDS_CHOICES)}
      <Pets value={draft.pets} onChange={update} disabled={busy}/>
      {select("status","Relationship status",STATUS_CHOICES)}
    </div>}
    <button type="submit" disabled={busy}>{busy?"SAVING…":"CONTINUE"}</button>
    {error&&<p className="ogcl-signup-error" role="alert">{error}</p>}
  </form>;
}
