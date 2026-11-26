import React from "react";
import {Navigate,NavLink,Outlet,useLocation} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {signupDestination} from "./signup-landing.mjs";
import "./signup-landing.css";

// Shared public signup layout. Steps render only their own content.
export default function SignupShell(){
  const {kind,onboarding}=useMemberSession();
  const {pathname}=useLocation();
  const step=pathname.replace(/\/$/,"");
  const identityStep=step==="/signup3"||step==="/signup4"||["/signup5","/signup6","/signup7","/signup8","/signup9","/signup10"].includes(step);
  const destination=step==="/about"?null:kind==="onboarding"
    ?identityStep?null:!onboarding?.identity?"/signup3":!onboarding?.locality?"/signup4":"/signup9"
    :signupDestination(kind);
  if(destination)return <Navigate to={destination} replace/>;
  if(kind==="checking")return <main className="ogcl-signup-landing" aria-busy="true" aria-label="Checking account"/>;
  return <main className="ogcl-signup-landing" aria-label="Sign up for OG Cupid">
    <header className="ogcl-signup-top">
      <span className="ogcl-signup-blog">Just here for the blog? <NavLink to="/ogtrends">Click here to read OG Trends.</NavLink><NavLink to="/about">Why you should join</NavLink></span>
      <NavLink to="/signin" className="ogcl-signup-signin">Sign in</NavLink>
    </header>
    <div className={"ogcl-signup-content"+(identityStep?" ogcl-signup-content-top":"")}>
      <NavLink to="/home" className="ogcl-signup-logo" aria-label="OG Cupid home">
        <img src="/brand/ogcupid-logo-white.png" width="240" alt="OG Cupid"/>
      </NavLink>
      <Outlet/>
    </div>
    <footer className="ogcl-signup-footer" aria-label="Site information">
      <NavLink to="/contact">Contact</NavLink>
      <NavLink to="/privacy">Privacy</NavLink>
      <NavLink to="/terms">Terms</NavLink>
    </footer>
  </main>;
}
