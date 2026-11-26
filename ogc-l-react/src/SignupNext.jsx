import React,{useEffect,useState} from "react";
import {Navigate,NavLink} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";

// Step 10 is a temporary continuation of the existing quiz gate, pending its own design.
export default function SignupNext(){
  const {kind,user,accountRequest,refresh}=useMemberSession();
  const [status,setStatus]=useState(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(kind!=="onboarding")return;
    let live=true;setStatus(null);setError(false);
    accountRequest("/onboarding").then(data=>{if(live)setStatus(data);}).catch(()=>{if(live)setError(true);});
    return()=>{live=false;};
  },[kind,user?.id,accountRequest,retry]);
  if(kind==="member")return <Navigate to="/home" replace/>;
  if(kind==="guest")return <Navigate to="/signin" replace/>;
  if(kind==="error"||kind==="unconfigured"||error)return <p role="alert">Couldn't check your progress. <button type="button" onClick={()=>kind==="onboarding"?setRetry(n=>n+1):void refresh()}>Retry</button></p>;
  if(!status)return <p role="status">Checking your account…</p>;
  if(!status.photo)return <Navigate to="/signup9" replace/>;
  return <section className="ogcl-signup3"><h1>Let's get to know you</h1>
    <p>Continue with the existing personality and match-question setup.</p>
    <div className="ogcl-signup-navigation">
      <NavLink className="ogcl-signup-back" to="/signup9" replace>Back</NavLink>
      <NavLink className="ogcl-signup9-primary" to="/onboarding">Continue</NavLink>
    </div>
  </section>;
}
