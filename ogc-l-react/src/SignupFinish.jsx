import React,{useEffect,useRef,useState} from "react";
import {Navigate,useNavigate} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {nextSignupDetails,savedSignupDetails} from "./signup-detail-options.mjs";
import {ProfilePhotoCropper} from "../../member-app/photo-cropper.js";

function ageFromDate(value){
  const date=new Date(String(value||"").slice(0,10)+"T00:00:00Z"),now=new Date();
  if(!Number.isFinite(date.getTime()))return null;
  return now.getUTCFullYear()-date.getUTCFullYear()-Number(now.getUTCMonth()<date.getUTCMonth()||
    (now.getUTCMonth()===date.getUTCMonth()&&now.getUTCDate()<date.getUTCDate()));
}
function profileDraft(state,existing,aboutMe){
  const age=ageFromDate(state.birth_date),locality={id:Number(state.locality_id),key:state.locality_shard};
  if(!Number.isInteger(age)||age<18||age>120||!locality.id||!locality.key)throw Error("Complete your birthdate and location first.");
  return {...savedSignupDetails(state),aboutMe,age,gender:state.gender,orientation:state.orientation,
    interestedIn:Array.isArray(state.signup_interested_in)?state.signup_interested_in.join(", "):existing?.interestedIn||"",
    relationshipGoal:Array.isArray(state.signup_intentions)?state.signup_intentions.join(", "):existing?.relationshipGoal||"",
    cityRegion:state.city_label||"",locality,searchOrigin:locality,searchRadiusMiles:state.signup_radius_miles??existing?.searchRadiusMiles??50,
    preferredAgeMin:Math.min(state.match_age_min??18,99),preferredAgeMax:Math.min(state.match_age_max??99,99)};
}

function CropStage({file,busy,onUpload,onCancel}){
  const canvas=useRef(null),cropper=useRef(null);
  const [ready,setReady]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    let active=true;let instance;
    try{
      instance=new ProfilePhotoCropper(canvas.current);cropper.current=instance;
      instance.open(file).then(()=>{if(active)setReady(true);else instance.dispose();})
        .catch(e=>{if(active)setError(e.message||"Couldn't open this picture.");});
    }catch(e){setError(e.message);}
    return()=>{active=false;cropper.current=null;instance?.dispose();};
  },[file]);
  async function upload(){
    setError("");
    try{const jpeg=await cropper.current.exportJpeg();await onUpload(jpeg);}
    catch(e){setError(e?.message||"Couldn't prepare your photo.");}
  }
  return <div className="ogcl-signup9-crop">
    <p id="signup9-crop-help">Drag the crop box or its handles to frame your photo. Use the arrow keys to move it, or Shift + arrow keys to resize.</p>
    <canvas ref={canvas} tabIndex={0} aria-label="Crop your profile picture" aria-describedby="signup9-crop-help"/>
    {!ready&&!error&&<p role="status">Preparing photo…</p>}
    {error&&<p role="alert" className="ogcl-signup-error">{error}</p>}
    <div className="ogcl-signup9-actions">
      <button type="button" disabled={busy||!ready} onClick={()=>cropper.current?.reset()}>Reset crop</button>
      <button type="button" disabled={busy} onClick={onCancel}>Choose another photo</button>
      <button type="button" className="ogcl-signup9-primary" disabled={busy||!ready} onClick={()=>void upload()}>{busy?"Uploading…":"Upload"}</button>
    </div>
  </div>;
}

export default function SignupFinish(){
  const {kind,user,accountRequest,refresh}=useMemberSession();
  const navigate=useNavigate();
  const [progress,setProgress]=useState(null),[profile,setProfile]=useState(null),[primary,setPrimary]=useState(null);
  const [file,setFile]=useState(null),[essay,setEssay]=useState("");
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  const lock=useRef(false),fileSerial=useRef(0),fileInput=useRef(null);
  useEffect(()=>{
    if(kind!=="onboarding")return;
    let live=true;setLoading(true);setError("");
    Promise.all([accountRequest("/onboarding"),accountRequest("/profile"),accountRequest("/photos")]).then(([status,p,album])=>{
      if(!live)return;
      const current=p?.profile?.userId===user?.id?p.profile:null;
      const main=album?.photos?.find(photo=>photo.isPrimary)||null;
      setProgress(status);setProfile(current);setPrimary(main);setEssay(current?.aboutMe||"");
      if(status?.explored){void refresh();}
    }).catch(()=>{if(live)setError("Couldn't load your saved progress. Please retry.");})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[kind,user?.id,accountRequest,retry,refresh]);
  if(kind==="member")return <Navigate to="/home" replace/>;
  if(kind==="guest")return <Navigate to="/signin" replace/>;
  if(kind==="error"||kind==="unconfigured")return <p role="alert">Account unavailable. <button type="button" onClick={()=>void refresh()}>Retry</button></p>;
  if(kind!=="onboarding"||loading)return <p role="status">Checking your account…</p>;
  if(!progress)return <p role="alert">{error} <button type="button" onClick={()=>setRetry(x=>x+1)}>Retry</button></p>;
  if(!progress.identity||!progress.state?.birth_date)return <Navigate to="/signup3" replace/>;
  if(!progress.locality)return <Navigate to="/signup4" replace/>;
  const next=nextSignupDetails(progress.state);
  if(next!=="/onboarding")return <Navigate to={next} replace/>;
  async function upload(jpeg){
    if(lock.current)return;
    lock.current=true;setBusy(true);setError("");
    try{
      // The photo album FK needs an actual private profile row. A blank
      // draft does not complete onboarding or grant discoverability.
      const saved=await accountRequest("/profile","PUT",profileDraft(progress.state,profile,profile?.aboutMe||""));
      if(saved?.profile?.userId!==user.id)throw Error("Your draft profile wasn't saved.");
      setProfile(saved.profile);
      const result=await accountRequest("/photos","POST",jpeg);
      if(!result?.photo?.id)throw Error("The upload wasn't confirmed.");
      if(!result.photo.isPrimary){
        const changed=await accountRequest("/photos/"+result.photo.id+"/primary","POST");
        if(changed?.updated!==true)throw Error("Couldn't select your main photo.");
      }
      const album=await accountRequest("/photos");
      const main=album?.photos?.find(x=>x.isPrimary);
      if(!main?.id)throw Error("Couldn't verify your main photo.");
      setPrimary(main);setFile(null);
    }catch(e){setError(e?.message||"Your photo couldn't be uploaded. Please retry.");}
    finally{lock.current=false;setBusy(false);}
  }
  async function save(event){
    event.preventDefault();
    if(lock.current||!primary?.id||essay.trim().length<15||essay.trim().length>5000)return;
    lock.current=true;setBusy(true);setError("");
    try{
      const saved=await accountRequest("/profile","PUT",profileDraft(progress.state,profile,essay.trim()));
      if(saved?.profile?.userId!==user.id||!saved.profile.slug)throw Error("Your profile wasn't saved.");
      const result=await accountRequest("/onboarding","PUT",{step:"signup9-finish",confirmed:true});
      if(result?.saved!==true)throw Error("Your profile and photo weren't confirmed.");
      const status=await accountRequest("/onboarding");
      if(!status?.photo||!status?.state?.signup9_completed_at||!status?.explored)throw Error("Couldn't confirm your saved profile.");
      if(await refresh())navigate("/home",{replace:true});
    }catch(e){setError(e?.message||"Your self summary couldn't be saved. Please retry.");}
    finally{lock.current=false;setBusy(false);}
  }
  return <section className="ogcl-signup3 ogcl-signup9" aria-label="The finishing touches">
    <h1>The finishing touches</h1>
    {!primary?<div className="ogcl-signup9-photo">
      <p className="ogcl-signup9-note" id="signup9-photo-note">Upload one actual picture of yourself. You can upload more later of anything you want. Anime pfps, memes, your dogs, whatever. You gotta have a real pfp though.</p>
      {!file?<>
        <input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp" disabled={busy}
        onChange={e=>{const selected=e.target.files?.[0];e.target.value="";if(selected){fileSerial.current++;setFile(selected);setError("");}}}/>
        <button type="button" className="ogcl-signup9-primary" aria-describedby="signup9-photo-note" disabled={busy} onClick={()=>fileInput.current?.click()}>Upload</button>
      </>:
        <CropStage key={fileSerial.current} file={file} busy={busy} onUpload={upload} onCancel={()=>{setFile(null);setError("");}}/>}
    </div>:<form className="ogcl-signup9-essay" onSubmit={save}>
      <label htmlFor="signup9-essay">My self summary</label>
      <p className="ogcl-signup9-note" id="signup9-essay-note">Just put a little something down for now. You can fill out all the essays you want later and upload more pics.</p>
      <textarea id="signup9-essay" aria-describedby="signup9-essay-note" name="aboutMe" rows={7} minLength={15} maxLength={5000} required value={essay} disabled={busy} onChange={e=>setEssay(e.target.value)}/>
      <button className="ogcl-signup9-primary" type="submit" disabled={busy||essay.trim().length<15}>{busy?"Saving…":"Save"}</button>
    </form>}
    {!progress.profile&&<button type="button" className="ogcl-signup-back" disabled={busy} onClick={()=>navigate("/signup8",{replace:true})}>Back</button>}
    {error&&<p className="ogcl-signup-error" role="alert">{error}</p>}
  </section>;
}
