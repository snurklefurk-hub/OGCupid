import React from "react";
import {Navigate,NavLink,Outlet} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {signupDestination} from "./signup-landing.mjs";
import "./signup-landing.css";

// Shared public signup layout. Steps render only their own content.
export default function SignupShell(){
  const {kind}=useMemberSession();
  const destination=signupDestination(kind);
  if(destination)return <Navigate to={destination} replace/>;
  if(kind==="checking")return <main className="ogcl-signup-landing" aria-busy="true" aria-label="Checking account"/>;
  return <main className="ogcl-signup-landing" aria-label="Sign up for OG Cupid">
    <header className="ogcl-signup-top">
      <span className="ogcl-signup-blog">Just here for the blog? <NavLink to="/ogtrends">click here to read OG Trends</NavLink></span>
      <NavLink to="/signin" className="ogcl-signup-signin">Sign in</NavLink>
    </header>
    <div className="ogcl-signup-content">
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
