import React, {useEffect, useState} from "react";
import {NavLink,useParams} from "react-router-dom";
import {PUBLIC_DETAILS,PUBLIC_ESSAYS} from "./member-public-profile.mjs";
import {useMemberSession} from "./MemberSessionProvider.jsx";

// Shows only actual member-visible fields returned by the protected API.
// Profile owners keep editing through the verified member-only About editor.
export default function PublicMemberProfile({Photo}) {
  const {slug} = useParams();
  const {getPublicProfile} = useMemberSession();
  const [profile,setProfile] = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");

  useEffect(()=>{
    let alive=true;
    setLoading(true);setError("");setProfile(null);
    void getPublicProfile(slug).then(data=>{
      if(alive){setProfile(data);setLoading(false);}
    }).catch(()=>{
      if(alive){setError("This member profile isn't available. It may have changed or your session may have expired.");setLoading(false);}
    });
    return ()=>{alive=false;};
  },[slug,getPublicProfile]);
  return <section className="ogcl-view">
    <header className="ogcl-view-head">
      <h1>{profile?.displayName || "Member profile"}</h1>
      <p>{profile?.age ? profile.age+" · " : ""}{profile?.cityRegion || "Meet somebody new."}</p>
    </header>
    <div className="ogcl-content-panel">
      <p><NavLink to="/matches">‹ Back to MATCHES</NavLink></p>
      {loading && <p role="status">Loading this member's profile…</p>}
      {error && <p className="ogcl-error" role="alert">{error}</p>}
      {profile && <>
        <div className="ogcl-public-profile-top">
          <div className="ogcl-public-portrait">
            <Photo member={{userId:profile.userId}} />
          </div>
          <div>
            <h2>{profile.displayName}</h2>
            <p>{[profile.age ? profile.age+" years old":null,profile.cityRegion].filter(Boolean).join(" · ")}</p>
            {profile.personaCode && <p>Dating Persona: <strong>{profile.personaCode}</strong></p>}
            {profile.isOwner && <p><NavLink to="/profile">Edit your About essays</NavLink> · <NavLink to="/questions">Edit match questions</NavLink></p>}
            {!profile.isOwner && <p><NavLink className="ogcl-button ogcl-profile-message" to={"/messages/"+profile.userId}>Send a message</NavLink></p>}
          </div>
        </div>
        <div className="ogcl-public-columns">
          <div>
            <h2>About</h2>
            {PUBLIC_ESSAYS.map(({key,title})=>profile.essays[key]?
              <section className="ogcl-public-essay" key={key}>
                <h3>{title}</h3><p>{profile.essays[key]}</p>
              </section> : null)}
            {!PUBLIC_ESSAYS.some(e=>profile.essays[e.key]) &&
              <p>This member hasn't filled in their About essays yet.</p>}
          </div>
          <aside className="ogcl-public-details">
            <h2>My details</h2>
            <dl>{PUBLIC_DETAILS.filter(d=>profile.details[d.key]).map(d=>
              <React.Fragment key={d.key}>
                <dt>{d.label}</dt><dd>{profile.details[d.key]}</dd>
              </React.Fragment>)}</dl>
            <p className="ogcl-quiet">These details come from the member's saved profile.</p>
            <h2>Questions</h2>
            <p>{profile.publicAnswers.length} public match question{profile.publicAnswers.length===1?"":"s"} answered</p>
            <p className="ogcl-quiet">Only public responses are counted here. Private match answers aren't exposed.</p>
          </aside>
        </div>
      </>}
    </div>
  </section>;
}
