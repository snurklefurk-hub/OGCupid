import React from "react";
import {NavLink} from "react-router-dom";

export default function AboutPage(){
  return <section className="ogcl-about-signup" aria-labelledby="ogcl-about-title">
    <h1 id="ogcl-about-title">Why you should join</h1>
    <p>OG Cupid is a place to build a dating profile, share what matters to you, and find people whose interests and intentions may fit yours.</p>
    <p>Take your time setting up your profile. You can add more photos, write more about yourself, and explore match questions and personality features as you go.</p>
    <p>Your profile is yours to shape. Choose what you share and keep your details up to date as you meet people.</p>
    <NavLink className="ogcl-about-continue" to="/signup">Lets get started</NavLink>
  </section>;
}
