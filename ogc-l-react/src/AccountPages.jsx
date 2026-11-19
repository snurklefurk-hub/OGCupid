import React,{useEffect,useState} from "react";
import {NavLink,useNavigate} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {legacyHref} from "./legacy-links.mjs";
import "./account.css";

function Frame({title,intro,children}){
  return <section className="ogcl-view ogcl-account" aria-label={title}>
    <header className="ogcl-view-head"><h1>{title}</h1><p>{intro}</p></header>
    <div className="ogcl-content-panel">{children}</div>
  </section>;
}
function ErrorNote({error,notice}){
  return <>{error&&<p className="ogcl-error" role="alert">{error}</p>}
    {notice&&<p className="ogcl-save-confirmation" role="status">{notice}</p>}</>;
}
const errorText=(e,fallback)=>e?.code==="invalid"?e.message||"Please check your entries.":fallback;
export function JoinForm(){
  const {kind,signUp}=useMemberSession();
  const navigate=useNavigate();
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [notice,setNotice]=useState("");
  async function submit(event){
    event.preventDefault();
    const f=event.currentTarget;
    if(busy||!f.reportValidity())return;
    const name=f.elements.name.value,email=f.elements.email.value;
    const password=f.elements.password.value;
    f.elements.password.value="";
    setBusy(true);setError("");setNotice("");
    try{
      await signUp(name,email,password);
      setNotice("Your account was created. Let's make your profile.");
      navigate("/onboarding",{replace:true});
    }catch(e){setError(errorText(e,"We couldn't create your account. Please retry."));}
    finally{setBusy(false);}
  }
  if(kind==="member")return <Frame title="You're already signed in" intro="Your account is ready.">
    <NavLink to="/matches">Go to Matches</NavLink></Frame>;
  if(kind==="onboarding")return <Frame title="Welcome back" intro="Continue your saved progress.">
    <NavLink to="/onboarding">Continue onboarding</NavLink></Frame>;
  return <Frame title="Create your OG Cupid account" intro="Online dating should be about people, not swiping.">
    <form className="ogcl-account-form" onSubmit={submit}>
      <label>Display name<input name="name" type="text" required minLength={2} maxLength={60} autoComplete="nickname"/></label>
      <label>Email address<input name="email" type="email" required maxLength={254} autoComplete="email"/></label>
      <label>Password <small>(at least 12 characters)</small>
        <input name="password" type="password" required minLength={12} autoComplete="new-password"/></label>
      <button type="submit" disabled={busy}>{busy?"Creating account…":"Make my profile"}</button>
    </form><ErrorNote error={error} notice={notice}/>
    <p>Already a member? <NavLink to="/signin">Sign in</NavLink>.</p>
    <p className="ogcl-note">You'll be able to verify your email after signup. You must be 18 or older to use OG Cupid.</p>
    <p className="ogcl-note"><a href={legacyHref("/privacy/")}>Privacy Policy</a> · <a href={legacyHref("/terms/")}>Terms</a></p>
  </Frame>;
}
export function RecoveryForm(){
  const {requestRecovery,resetPassword}=useMemberSession();
  const navigate=useNavigate();
  const [stage,setStage]=useState("request");
  const [email,setEmail]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  async function submit(event){
    event.preventDefault();
    const f=event.currentTarget;
    if(busy||!f.reportValidity())return;
    setBusy(true);setError("");setNotice("");
    try{
      if(stage==="request"){
        await requestRecovery(f.elements.email.value);
        setEmail(f.elements.email.value.trim());
        setStage("confirm");
        setNotice("If that account exists, a recovery code has been sent.");
      }else{
        const password=f.elements.password.value;
        const repeat=f.elements.repeat.value;
        const otp=f.elements.otp.value.trim();
        f.elements.password.value="";f.elements.repeat.value="";f.elements.otp.value="";
        if(password!==repeat)throw Error("The new passwords don't match.");
        await resetPassword(email,otp,password);
        navigate("/signin",{replace:true,state:{notice:"Password updated. Sign in using your new password."}});
      }
    }catch(e){setError(errorText(e,e?.message==="The new passwords don't match."?e.message:"Recovery couldn't be completed. Check the code and retry."));}
    finally{setBusy(false);}
  }
  return <Frame title="Recover your account" intro="Use the email you registered with.">
    {stage==="request"?<form className="ogcl-account-form" onSubmit={submit}>
      <label>Email address<input name="email" type="email" required maxLength={254} autoComplete="email" defaultValue={email}/></label>
      <button type="submit" disabled={busy}>{busy?"Sending code…":"Send recovery code"}</button>
    </form>:<form className="ogcl-account-form" onSubmit={submit}>
      <p>Recovery code sent to <strong>{email}</strong>.</p>
      <label>Email recovery code<input name="otp" type="text" required minLength={4} autoComplete="one-time-code"/></label>
      <label>New password<input name="password" type="password" required minLength={12} autoComplete="new-password"/></label>
      <label>Repeat new password<input name="repeat" type="password" required minLength={12} autoComplete="new-password"/></label>
      <button type="submit" disabled={busy}>{busy?"Updating…":"Reset password"}</button>
      <button type="button" className="ogcl-button ogcl-secondary" disabled={busy} onClick={()=>setStage("request")}>Resend code</button>
    </form>}
    <ErrorNote error={error} notice={notice}/>
    <p><NavLink to="/signin">Back to sign in</NavLink></p>
  </Frame>;
}
export function VerifyForm(){
  const {kind,user,requestEmailVerification}=useMemberSession();
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  async function submit(event){
    event.preventDefault();const f=event.currentTarget;
    if(busy||!f.reportValidity())return;
    setBusy(true);setError("");setNotice("");
    try{await requestEmailVerification(f.elements.email.value);
      setNotice("Check your email for the verification link. You can continue setting up meanwhile.");
    }catch(e){setError(errorText(e,"Could not send your verification email."));}
    finally{setBusy(false);}
  }
  return <Frame title="Verify your email" intro="Email verification is separate from your saved profile.">
    <form className="ogcl-account-form" onSubmit={submit}>
      <label>Email address<input name="email" type="email" required maxLength={254}
        autoComplete="email" defaultValue={user?.email||""}/></label>
      <button type="submit" disabled={busy}>{busy?"Sending…":"Email me a verification link"}</button>
    </form><ErrorNote error={error} notice={notice}/>
    <p><NavLink to={kind==="onboarding"?"/onboarding":kind==="member"?"/matches":"/signin"}>Continue</NavLink></p>
  </Frame>;
}
const defaultEmailPrefs={unreadMessages:false,unseenActivity:false,siteUpdates:false,necessaryOnly:true};
export function AccountManagement(){
  const {kind,accountRequest,deleteMyAccount,requestEmailVerification}=useMemberSession();
  const navigate=useNavigate();
  const [prefs,setPrefs]=useState(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{let alive=true;
    if(kind!=="member"&&kind!=="onboarding")return;
    void accountRequest("/email-preferences").then(data=>{if(alive)setPrefs(data.preferences||defaultEmailPrefs);})
      .catch(()=>{if(alive)setError("Email preferences couldn't be loaded.");});
    return()=>{alive=false;};
  },[kind,accountRequest]);
  async function savePreferences(event){
    event.preventDefault();
    setBusy(true);setError("");setNotice("");
    try{
      const data=await accountRequest("/email-preferences","PUT",prefs);
      setPrefs(data.preferences||prefs);setNotice("Email preferences saved.");
    }catch{setError("Email preferences couldn't be saved.");}finally{setBusy(false);}
  }
  async function remove(event){
    event.preventDefault();const f=event.currentTarget;
    if(busy||!f.reportValidity())return;
    if(f.elements.confirm.value!=="DELETE"){setError("Type DELETE exactly.");return;}
    if(!window.confirm("Permanently delete your OG Cupid account, profile, photos and messages? This cannot be undone."))return;
    setBusy(true);setError("");setNotice("");
    const password=f.elements.password.value;f.elements.password.value="";f.elements.confirm.value="";
    try{await deleteMyAccount(password,"DELETE");navigate("/signin",{replace:true});}
    catch(e){setError(errorText(e,"Deletion wasn't confirmed. Your account remains active."));}
    finally{setBusy(false);}
  }
  if(kind!=="member"&&kind!=="onboarding")return <Frame title="Account settings" intro="You must be signed in.">
    <NavLink to="/signin">Sign in</NavLink></Frame>;
  return <Frame title="Your account" intro="Your account controls and communications live here, separate from your dating profile.">
    <div className="ogcl-account-links"><NavLink to="/settings">Profile settings</NavLink>
      <NavLink to="/verify">Verify email</NavLink>
      <NavLink to="/onboarding">Onboarding status</NavLink></div>
    {prefs&&<section className="ogcl-settings-group"><h2>Email preferences</h2>
      <form className="ogcl-account-form" onSubmit={savePreferences}>
        {[
          ["unreadMessages","Unread messages"],
          ["unseenActivity","Unseen account activity"],
          ["siteUpdates","OG Cupid updates"]
        ].map(([key,label])=><label key={key} className="ogcl-account-check">
          <input type="checkbox" checked={prefs[key]===true} disabled={busy||prefs.necessaryOnly}
            onChange={e=>setPrefs(p=>({...p,[key]:e.target.checked}))}/>{label}</label>)}
        <label className="ogcl-account-check"><input type="checkbox"
          checked={prefs.necessaryOnly===true} disabled={busy}
          onChange={e=>setPrefs(p=>({...p,necessaryOnly:e.target.checked,
            ...(e.target.checked?defaultEmailPrefs:{})}))}/>Necessary emails only</label>
        <button type="submit" disabled={busy}>Save email choices</button>
      </form></section>}
    <section className="ogcl-settings-group"><h2>Delete your account</h2>
      <p>Deleting your account permanently removes your member profile, photos, essays, match answers and sessions. Database backups may remain until their retention period expires.</p>
      <form className="ogcl-account-form" onSubmit={remove}>
        <label>Current password<input name="password" type="password" required minLength={12} autoComplete="current-password"/></label>
        <label>Type DELETE to confirm<input name="confirm" type="text" required autoComplete="off"/></label>
        <button type="submit" className="ogcl-account-danger" disabled={busy}>
          {busy?"Deleting…":"Permanently delete my account"}</button>
      </form>
    </section>
    <ErrorNote error={error} notice={notice}/>
  </Frame>;
}