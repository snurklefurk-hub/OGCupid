import React,{useEffect,useState} from "react";
import {NavLink,useParams,useSearchParams} from "react-router-dom";
import {PUBLIC_DETAILS,PUBLIC_ESSAYS} from "./member-public-profile.mjs";
import {essayDefinition} from "./member-essays.mjs";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import ProfileGallery from "./ProfileGallery.jsx";
import ProfileQuestions from "./ProfileQuestions.jsx";
import {formatLookingFor} from "./member-looking-for.mjs";

const TABS=Object.freeze([
  {id:"about",label:"About"},
  {id:"photos",label:"Photos"},
  {id:"questions",label:"Questions"},
  {id:"personality",label:"Personality"}
]);
const PENCIL="✎";
function EditPencil({to,label}){
  return <NavLink className="ogcl-profile-pencil" to={to} aria-label={"Edit "+label} title={"Edit "+label}>{PENCIL}</NavLink>;
}

// Canonical member profile: period-correct header and four tabs; actual
// protected fields only. Owner editing stays authenticated and one-field scoped.
export default function PublicMemberProfile({Photo}) {
  const {slug}=useParams();
  const [params]=useSearchParams();
  const tab=TABS.some(t=>t.id===params.get("tab"))?params.get("tab"):"about";
  const {getPublicProfile,saveOwnEssay}=useMemberSession();
  const [profile,setProfile]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [active,setActive]=useState(null);
  const [draft,setDraft]=useState("");
  const [busy,setBusy]=useState(false);
  const [saved,setSaved]=useState("");

  useEffect(()=>{
    let alive=true;
    setLoading(true);setError("");setProfile(null);setActive(null);setSaved("");
    void getPublicProfile(slug).then(data=>{
      if(alive){setProfile(data);setLoading(false);}
    }).catch(()=>{
      if(alive){setError("This member profile isn't available. It may have changed or your session may have expired.");setLoading(false);}
    });
    return()=>{alive=false;};
  },[slug,getPublicProfile]);

  function editEssay(key){
    if(!profile?.isOwner||busy)return;
    setActive(key);setDraft(profile.essays[key]||"");setError("");setSaved("");
  }
  async function saveEssay(event){
    event.preventDefault();
    if(!profile?.isOwner||!active||busy)return;
    const key=active;
    setBusy(true);setError("");setSaved("");
    try{
      const updated=await saveOwnEssay(key,draft);
      setProfile(previous=>previous?{
        ...previous,essays:{...previous.essays,[key]:updated.fields[key]}
      }:previous);
      setSaved(key);setActive(null);
    }catch{
      setError("This essay wasn't saved. Your draft is still here.");
    }finally{setBusy(false);}
  }

  return <section className="ogcl-view ogcl-profile-page">
    {loading&&<p role="status">Loading member profile…</p>}
    {error&&<p className="ogcl-error" role="alert">{error}</p>}
    {profile&&<>
      <header className="ogcl-classic-profile-head">
        <div className="ogcl-classic-profile-portrait"><Photo member={{userId:profile.userId}}/></div>
        <div className="ogcl-classic-profile-person">
          <div className="ogcl-profile-name-line">
            <h1>{profile.displayName}</h1>
            {profile.isOwner&&<EditPencil to="/settings" label="profile details"/>}
          </div>
          <p className="ogcl-classic-profile-meta">
            {[profile.age?profile.age+" years old":null,profile.cityRegion,
              profile.details.gender,profile.details.orientation].filter(Boolean).join(" · ")}
          </p>
          {profile.personaCode&&<p className="ogcl-classic-persona">Dating Persona: <strong>{profile.personaCode}</strong></p>}
          {!profile.isOwner&&<p><NavLink to={"/messages/"+profile.userId}
            className="ogcl-profile-message-link">Send a message</NavLink></p>}
        </div>
      </header>
      <nav className="ogcl-profile-tabs" aria-label="Member profile sections">
        {TABS.map(t=><NavLink key={t.id}
          to={"/profiles/"+profile.slug+(t.id==="about"?"":"?tab="+t.id)}
          aria-current={tab===t.id?"page":undefined}
          className={tab===t.id?"active":""}>{t.label}</NavLink>)}
      </nav>
      <div className="ogcl-profile-tab-content">
        {tab==="about"&&<div className="ogcl-public-columns">
          <div className="ogcl-about-essays">
            {PUBLIC_ESSAYS.map(({key,title})=><section className="ogcl-public-essay" key={key}>
              <h2>{title}{profile.isOwner&&<button type="button" className="ogcl-profile-pencil"
                title={"Edit "+title} aria-label={"Edit "+title} disabled={busy} onClick={()=>editEssay(key)}>{PENCIL}</button>}</h2>
              {active===key&&profile.isOwner?
                <form className="ogcl-essay-edit" onSubmit={saveEssay}>
                  <textarea value={draft} rows={6} maxLength={essayDefinition(key)?.max??1500}
                    autoFocus onChange={e=>setDraft(e.target.value)}/>
                  <div className="ogcl-essay-actions">
                    <button type="submit" disabled={busy}>{busy?"Saving…":"Save"}</button>
                    <button type="button" disabled={busy}
                      onClick={()=>{setActive(null);setError("");}}>Cancel</button>
                  </div>
                </form>:
                profile.essays[key]?<p>{profile.essays[key]}</p>:
                  profile.isOwner?<p className="ogcl-essay-empty">You haven't written this one yet.</p>:null}
              {saved===key&&<small className="ogcl-save-confirmation" role="status">Saved.</small>}
            </section>)}
          </div>
          <aside className="ogcl-public-details">
            <section className="ogcl-looking-for">
              <h2>I'm looking for {profile.isOwner&&<EditPencil to="/settings#looking-for" label="looking-for preferences"/>}</h2>
              <ul>
                {formatLookingFor(profile.lookingFor).map((line,index)=><li key={index}>{line}</li>)}
              </ul>
            </section>
            <section className="ogcl-my-details">
              <h2>My details {profile.isOwner&&<EditPencil to="/settings" label="my details"/>}</h2>
              <dl>{PUBLIC_DETAILS.filter(d=>d.key!=="relationshipGoal"&&profile.details[d.key]).map(d=>
                <React.Fragment key={d.key}><dt>{d.label}</dt><dd>{profile.details[d.key]}</dd></React.Fragment>)}</dl>
            </section>
          </aside>
        </div>}
        {tab==="photos"&&<div className="ogcl-profile-subpage">
          <ProfileGallery userId={profile.userId} isOwner={profile.isOwner}/>
        </div>}
        {tab==="questions"&&<ProfileQuestions profile={profile}/>}
        {tab==="personality"&&<div className="ogcl-profile-subpage">
          <h2>Personality</h2>
          {profile.personaCode?<p>Dating Persona: <strong>{profile.personaCode}</strong></p>:
            <p>No saved Dating Persona result is available for this profile yet.</p>}
          {profile.isOwner&&<p><NavLink to="/persona">Take the Dating Persona Test</NavLink></p>}
        </div>}
      </div>
    </>}
  </section>;
}
