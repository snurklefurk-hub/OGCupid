import React, {useEffect, useState} from "react";
import {LIVE_ESSAYS} from "./member-essays.mjs";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {legacyHref} from "./legacy-links.mjs";

// This editor writes only the essays that the live Neon API already stores.
// Each save updates one field; other preferences, images and location remain.
export default function ProfileEditor() {
  const {loadOwnEssays, saveOwnEssay} = useMemberSession();
  const [profile,setProfile] = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [active,setActive] = useState(null);
  const [draft,setDraft] = useState("");
  const [busy,setBusy] = useState(false);
  const [saved,setSaved] = useState("");

  useEffect(()=>{
    let mounted=true;
    void loadOwnEssays().then(result=>{
      if(mounted){setProfile(result);setLoading(false);}
    }).catch(()=>{
      if(mounted){setError("Your saved essays couldn't be loaded. Please try again.");setLoading(false);}
    });
    return ()=>{mounted=false;};
  },[loadOwnEssays]);

  function edit(key) {
    if(!profile || busy) return;
    setDraft(profile.fields[key] || "");
    setActive(key);
    setError("");
    setSaved("");
  }
  async function save(event) {
    event.preventDefault();
    if(busy || !active) return;
    setBusy(true);
    setError("");
    try {
      const updated=await saveOwnEssay(active,draft);
      setProfile(updated);
      setSaved(active);
      setActive(null);
    } catch {
      setError("Your changes weren't saved. Please try again; your draft is still here.");
    } finally {setBusy(false);}
  }

  return <section className="ogcl-view">
    <header className="ogcl-view-head">
      <h1>About your profile</h1>
      <p>Write something substantial. Each section saves independently.</p>
    </header>
    <div className="ogcl-content-panel">
      {loading && <p role="status">Loading saved essays…</p>}
      {error && <p className="ogcl-error" role="alert">{error}</p>}
      {profile && <>
        <p><strong>{profile.displayName}</strong>{profile.slug && <> · <a href={legacyHref("/profiles/"+profile.slug)}>View public profile</a></>}</p>
        <div className="ogcl-essay-list">
          {LIVE_ESSAYS.map(essay=><section className="ogcl-essay" key={essay.key}>
            <div className="ogcl-essay-title">
              <h2>{essay.label}</h2>
              {active!==essay.key && <button type="button" disabled={busy}
                onClick={()=>edit(essay.key)}>Edit</button>}
            </div>
            {active===essay.key ?
              <form onSubmit={save} className="ogcl-essay-edit">
                <textarea value={draft} maxLength={essay.max} rows={6} autoFocus
                  onChange={event=>setDraft(event.target.value)} />
                <div className="ogcl-essay-actions">
                  <small>{draft.length} / {essay.max} characters</small>
                  <button type="submit" disabled={busy}>{busy?"Saving…":"Save"}</button>
                  <button type="button" disabled={busy}
                    onClick={()=>{setActive(null);setError("");}}>Cancel</button>
                </div>
              </form> :
              <p className={profile.fields[essay.key]?"ogcl-essay-body":"ogcl-essay-empty"}>
                {profile.fields[essay.key] || "Not answered yet."}
              </p>}
            {saved===essay.key && <p className="ogcl-save-confirmation" role="status">Saved.</p>}
          </section>)}
        </div>
        <p className="ogcl-quiet">Your other profile settings, question answers and photos are unchanged when you save an essay.</p>
      </>}
    </div>
  </section>;
}
