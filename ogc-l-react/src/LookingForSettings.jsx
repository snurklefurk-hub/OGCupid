import React,{useEffect,useState} from "react";
import {NavLink} from "react-router-dom";
import {
  LOOKING_GENDERS,LOOKING_INTENTIONS,LOOKING_RADII,AGE_CHOICES,
  validAgeRange
} from "./member-looking-for.mjs";

const split=str=>typeof str==="string"?str.split(", ").filter(Boolean):[];
const initial=profile=>{
  const saved=profile.lookingFor;
  return {
    genders:split(saved.interestedIn).filter(v=>LOOKING_GENDERS.some(g=>g.value===v)),
    intentions:split(saved.relationshipGoal).filter(v=>LOOKING_INTENTIONS.some(g=>g.value===v)),
    gendersTouched:false,intentionsTouched:false,radiusTouched:false,
    preferredAgeMin:saved.preferredAgeMin,preferredAgeMax:saved.preferredAgeMax,
    searchRadiusMiles:saved.searchRadiusMiles
  };
};
function CheckGroup({options,selected,toggle,title,disabled}){
  return <fieldset className="ogcl-looking-options" disabled={disabled}>
    <legend>{title}</legend>
    {options.map(item=><label key={item.value}>
      <input type="checkbox" checked={selected.includes(item.value)}
        onChange={e=>toggle(item.value,e.target.checked)}/> {item.label}
    </label>)}
  </fieldset>;
}

export default function LookingForSettings({profile,onSaved,saveOwnLookingFor}){
  const [draft,setDraft]=useState(()=>initial(profile));
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{setDraft(initial(profile));setError("");},[profile]);
  const changeChoices=(key,flag)=>(option,checked)=>setDraft(prev=>{
    const next=new Set(prev[key]);
    if(checked)next.add(option);else next.delete(option);
    return {...prev,[key]:[...next],[flag]:true};
  });
  async function save(e){
    e.preventDefault();
    if(busy)return;
    if(!validAgeRange(draft.preferredAgeMin,draft.preferredAgeMax)){
      setError("Set both ages between 18 and 99, with the maximum at least the minimum.");
      return;
    }
    setBusy(true);setError("");
    try{
      const updated=await saveOwnLookingFor(draft);
      onSaved(updated);
      setDraft(initial(updated));
    }catch{
      setError("Your looking-for preferences weren't saved. Your changes remain here.");
    }finally{setBusy(false);}
  }
  const legacyGender=split(profile.lookingFor.interestedIn).filter(x=>!LOOKING_GENDERS.some(g=>g.value===x));
  const legacyIntent=split(profile.lookingFor.relationshipGoal).filter(x=>!LOOKING_INTENTIONS.some(g=>g.value===x));
  const hasLocality=profile.lookingFor.hasValidatedLocality;
  return <section className="ogcl-settings-group ogcl-looking-settings" id="looking-for">
    <h2>I'm looking for</h2>
    <p className="ogcl-quiet">These are your saved dating preferences, not temporary search filters.</p>
    <form onSubmit={save}>
      <CheckGroup title="Interested in" options={LOOKING_GENDERS}
        selected={draft.genders} disabled={busy}
        toggle={changeChoices("genders","gendersTouched")}/>
      {!draft.gendersTouched&&legacyGender.length>0&&
        <p className="ogcl-note">Current saved choice: {legacyGender.join(", ")}. It will stay unchanged until you choose a new selection.</p>}
      <div className="ogcl-looking-age">
        <label>Minimum age
          <select disabled={busy} value={draft.preferredAgeMin??""}
            onChange={e=>setDraft(prev=>({...prev,preferredAgeMin:e.target.value===""?null:Number(e.target.value)}))}>
            <option value="">Not set</option>
            {AGE_CHOICES.map(n=><option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>Maximum age
          <select disabled={busy} value={draft.preferredAgeMax??""}
            onChange={e=>setDraft(prev=>({...prev,preferredAgeMax:e.target.value===""?null:Number(e.target.value)}))}>
            <option value="">Not set</option>
            {AGE_CHOICES.map(n=><option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <label className="ogcl-looking-distance">Distance from your saved profile location
        <select disabled={busy||!hasLocality} value={draft.searchRadiusMiles??""}
          onChange={e=>setDraft(prev=>({...prev,searchRadiusMiles:e.target.value===""?null:Number(e.target.value),radiusTouched:true}))}>
          <option value="">Not set</option>
          {LOOKING_RADII.map(radius=><option key={radius.value} value={radius.value}>{radius.label}</option>)}
        </select>
      </label>
      {!hasLocality&&<p className="ogcl-note">Save a verified profile location before setting your search distance.
        <NavLink to="/onboarding"> Edit your location</NavLink>. Your other preferences can still be saved.</p>}
      <CheckGroup title="Open to" options={LOOKING_INTENTIONS} selected={draft.intentions}
        disabled={busy} toggle={changeChoices("intentions","intentionsTouched")}/>
      {!draft.intentionsTouched&&legacyIntent.length>0&&
        <p className="ogcl-note">Current saved intention: {legacyIntent.join(", ")}. It will remain until changed.</p>}
      {error&&<p role="alert" className="ogcl-error">{error}</p>}
      <div className="ogcl-essay-actions">
        <button type="submit" disabled={busy}>{busy?"Saving…":"Save looking-for preferences"}</button>
        <button type="button" disabled={busy} onClick={()=>{setDraft(initial(profile));setError("");}}>Reset changes</button>
      </div>
    </form>
  </section>;
}
