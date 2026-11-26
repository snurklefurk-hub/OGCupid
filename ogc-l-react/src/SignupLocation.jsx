import React,{useEffect,useRef,useState} from "react";
import {Navigate,useNavigate} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {CityChooser,countries,countryNames} from "./CityChooser.jsx";

const sortedCountries=[...countries].sort((a,b)=>countryNames.of(a).localeCompare(countryNames.of(b)));
export default function SignupLocation(){
  const {kind,user,accountRequest,refresh}=useMemberSession();
  const navigate=useNavigate();
  const [state,setState]=useState(null),[country,setCountry]=useState("US");
  const [stored,setStored]=useState(null),[selected,setSelected]=useState(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  const submitting=useRef(false);
  useEffect(()=>{
    if(kind!=="onboarding")return;
    let active=true;setLoading(true);setError("");setState(null);
    accountRequest("/onboarding").then(data=>{
      if(!active)return;
      const next=data?.state||{};
      setState(next);
      setCountry(next.country_code||"US");
      const saved=next.locality_id&&next.locality_shard?{id:next.locality_id,key:next.locality_shard,label:next.city_label||"",zip:next.zip_code||""}:null;
      setStored(saved);setSelected(saved);
    }).catch(()=>{if(active)setError("Could not load your saved location. Please retry.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[kind,user?.id,accountRequest,retry]);
  if(kind==="member")return <Navigate to="/home" replace/>;
  if(kind==="guest")return <Navigate to="/signin" replace/>;
  if(kind==="error"||kind==="unconfigured")return <p role="alert">Account service unavailable. <button type="button" onClick={()=>void refresh()}>Retry</button></p>;
  if(kind!=="onboarding"||loading)return <p role="status">Checking your account…</p>;
  if(!state)return <div role="alert">{error} <button type="button" onClick={()=>setRetry(n=>n+1)}>Retry</button></div>;
  if(!state.gender||!state.orientation||!state.birth_date)return <Navigate to="/signup3" replace/>;
  async function submit(e){
    e.preventDefault();
    const form=e.currentTarget;
    if(submitting.current||!form.reportValidity()||!selected?.id||!selected?.key)return;
    const payload={step:"locality",birthDate:String(state.birth_date).slice(0,10),
      countryCode:country,zipCode:country==="US"?form.elements.zipCode.value:"",
      locality:{id:Number(selected.id),key:selected.key}};
    submitting.current=true;setBusy(true);setError("");
    try{
      const result=await accountRequest("/onboarding","PUT",payload);
      if(!result?.saved)throw Error("Location wasn't saved.");
      await refresh();
      navigate("/signup5",{replace:true});
    }catch(e){setError(e?.code==="invalid"?e.message:"Your location couldn't be saved. Please retry.");}
    finally{submitting.current=false;setBusy(false);}
  }
  return <form className="ogcl-signup3 ogcl-signup4" onSubmit={submit}>
    <h1>Where are you?</h1>
    <div className="ogcl-signup4-fields">
      <label>Country<select value={country} disabled={busy} onChange={e=>{setCountry(e.target.value);setStored(null);setSelected(null);}}>
        {sortedCountries.map(code=><option key={code} value={code}>{code==="US"?"USA":countryNames.of(code)}</option>)}
      </select></label>
      <CityChooser key={country} country={country} stored={stored} onPick={setSelected} confirmation disabled={busy}/>
    </div>
    <div className="ogcl-signup-navigation">
      <button type="button" className="ogcl-signup-back" disabled={busy} onClick={()=>navigate("/signup3",{replace:true})}>Back</button>
      <button type="submit" disabled={busy||!selected?.id||!selected?.key}>{busy?"Saving…":"Continue"}</button>
    </div>
    {error&&<p role="alert" className="ogcl-signup-error">{error}</p>}
  </form>;
}
