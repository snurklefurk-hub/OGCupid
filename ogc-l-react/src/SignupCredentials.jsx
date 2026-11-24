import React,{useRef,useState} from "react";
import {useNavigate} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";

export default function SignupCredentials(){
  const {signUp}=useMemberSession();
  const navigate=useNavigate();
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const submitting=useRef(false);
  async function submit(event){
    event.preventDefault();
    const form=event.currentTarget;
    if(submitting.current||!form.reportValidity())return;
    const username=form.elements.username.value.trim();
    const email=form.elements.email.value.trim();
    if(username.length<2){setError("Choose a username of at least two characters.");return;}
    const password=form.elements.password.value;
    form.elements.password.value="";
    submitting.current=true;setBusy(true);setError("");
    try{
      await signUp(username,email,password);
      navigate("/signup3",{replace:true});
    }catch(e){
      setError(e?.code==="invalid"?e.message||"Please check your entries.":"We couldn't create your account. Please retry.");
    }finally{
      submitting.current=false;setBusy(false);
    }
  }
  return <form className="ogcl-signup-credentials" onSubmit={submit} aria-describedby="signup-permanent">
    <div className="ogcl-signup-credentials-fields">
      <label>Username<input name="username" type="text" required minLength={2} maxLength={60} autoComplete="username" disabled={busy}/></label>
      <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" disabled={busy}/></label>
      <label>Password<input name="password" type="password" required minLength={12} autoComplete="new-password" aria-describedby="signup-password-min" disabled={busy}/></label>
      <small id="signup-password-min">At least 12 characters</small>
      <button type="submit" disabled={busy}>{busy?"CREATING ACCOUNT…":"CONTINUE"}</button>
      {error&&<p className="ogcl-signup-error" role="alert">{error}</p>}
    </div>
    <aside id="signup-permanent" className="ogcl-signup-tooltip">These are permanent. Choose wisely</aside>
  </form>;
}
