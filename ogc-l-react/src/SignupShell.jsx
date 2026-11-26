import React,{useState,useEffect} from "react";
import {Navigate,NavLink,Outlet,useLocation} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {ProfileFloater} from "./ClassicSidebar.jsx";
import {signupDestination} from "./signup-landing.mjs";
import "./signup-landing.css";

// Shared public signup layout. Steps render only their own content.
export default function SignupShell({Photo}){
  const {kind,onboarding,user}=useMemberSession();
  const [card,setCard]=useState(null),[emailPrompt,setEmailPrompt]=useState(false);
  useEffect(()=>{setCard(null);setEmailPrompt(false);},[user?.id]);
  const {pathname}=useLocation();
  const step=pathname.replace(/\/$/,"");
  useEffect(()=>{setEmailPrompt(false);},[step]);
  const identityStep=step==="/signup3"||step==="/signup4"||["/signup5","/signup6","/signup7","/signup8","/signup9","/signup10"].includes(step);
  const destination=kind==="onboarding"
    ?identityStep?null:!onboarding?.identity?"/signup3":!onboarding?.locality?"/signup4":"/onboarding"
    :signupDestination(kind);
  if(destination)return <Navigate to={destination} replace/>;
  if(kind==="checking")return <main className="ogcl-signup-landing" aria-busy="true" aria-label="Checking account"/>;
  return <main className="ogcl-signup-landing" aria-label="Sign up for OG Cupid">
    <header className="ogcl-signup-top">
      <span className="ogcl-signup-blog">Just here for the blog? <NavLink to="/ogtrends">Click here to read OG Trends.</NavLink></span>
      {step==="/signup9"&&kind==="onboarding"&&card?.userId===user?.id?<div className="ogcl-signup9-card" id="signup9-profile-card">
        <ProfileFloater Photo={Photo} signupProfile={card}/>
        <div className="ogcl-signup9-tutorial">
          {emailPrompt?<><p role="status">Now would be a good time to validate your email.</p><NavLink to="/verify" target="_blank" rel="noopener noreferrer">Validate email</NavLink><NavLink to="/signup10" className="ogcl-signup9-primary">Next</NavLink></>:<>
          <div className="ogcl-signup9-pointer" aria-hidden="true">↑</div>
          <p>This is a quick link to your profile where you can fill out your preferences, essays, and see any personality awards you've gotten.</p>
          <button type="button" className="ogcl-signup9-primary" onClick={()=>setEmailPrompt(true)}>Next</button></>}
        </div>
      </div>:<NavLink to="/signin" className="ogcl-signup-signin">Sign in</NavLink>}
    </header>
    <div className={"ogcl-signup-content"+(identityStep?" ogcl-signup-content-top":"")}>
      <NavLink to="/home" className="ogcl-signup-logo" aria-label="OG Cupid home">
        <img src="/brand/ogcupid-logo-white.png" width="240" alt="OG Cupid"/>
      </NavLink>
      <Outlet context={{setCard}}/>
    </div>
    <footer className="ogcl-signup-footer" aria-label="Site information">
      <NavLink to="/contact">Contact</NavLink>
      <NavLink to="/privacy">Privacy</NavLink>
      <NavLink to="/terms">Terms</NavLink>
    </footer>
  </main>;
}
