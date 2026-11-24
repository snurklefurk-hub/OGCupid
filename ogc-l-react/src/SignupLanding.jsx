import React,{useState} from "react";
import {Navigate,NavLink,useNavigate} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {SIGNUP_ORIENTATIONS,SIGNUP_GENDERS,signupIdentity,signupDestination} from "./signup-landing.mjs";
import "./signup-landing.css";

export default function SignupLanding({onContinue}){
  const {kind}=useMemberSession();
  const navigate=useNavigate();
  const [orientation,setOrientation]=useState("Straight");
  const [gender,setGender]=useState("Woman");
  const destination=signupDestination(kind);
  if(destination)return <Navigate to={destination} replace/>;
  if(kind==="checking")return <main className="ogcl-signup-landing" aria-busy="true" aria-label="Checking account"/>;
  function submit(event){
    event.preventDefault();
    const identity=signupIdentity(orientation,gender);
    if(!identity)return;
    onContinue(identity);
    navigate("/join");
  }
  return <main className="ogcl-signup-landing" aria-label="Sign up for OG Cupid">
    <header className="ogcl-signup-top">
      <NavLink to="/ogtrends">OgTrends</NavLink>
      <NavLink to="/signin" className="ogcl-signup-signin">Sign in</NavLink>
    </header>
    <div className="ogcl-signup-content">
      <NavLink to="/home" className="ogcl-signup-logo" aria-label="OG Cupid home">
        <img src="/brand/ogcupid-logo-white.png" width="240" alt="OG Cupid"/>
      </NavLink>
      <form className="ogcl-signup-form" onSubmit={submit}>
        <span>I am a</span>
        <select aria-label="Orientation" value={orientation} onChange={e=>setOrientation(e.target.value)}>
          {SIGNUP_ORIENTATIONS.map(value=><option key={value}>{value}</option>)}
        </select>
        <select aria-label="Gender" value={gender} onChange={e=>setGender(e.target.value)}>
          {SIGNUP_GENDERS.map(value=><option key={value}>{value}</option>)}
        </select>
        <button type="submit">CONTINUE</button>
      </form>
    </div>
    <footer className="ogcl-signup-footer" aria-label="Site information">
      <NavLink to="/contact">Contact</NavLink>
      <NavLink to="/privacy">Privacy</NavLink>
      <NavLink to="/terms">Terms</NavLink>
    </footer>
  </main>;
}
