import React,{useEffect,useState} from "react";
import {NavLink} from "react-router-dom";
import {PROFILE_SETTINGS_FIELDS} from "./member-settings.mjs";
import LookingForSettings from "./LookingForSettings.jsx";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import "./blocked-settings.css";

const groups=[
  {id:"identity",title:"Your identity",intro:"Your signup name and age cannot be edited here."},
  {id:"looking",title:"I'm looking for",intro:"Who you'd like to meet and what you're open to."},
  {id:"details",title:"My details",intro:"The things people can read when they visit your member profile."}
];

export default function ProfileSettings(){
  const {loadOwnSettings,saveOwnSetting,saveOwnLookingFor,loadConnections,setSiteBlock}=useMemberSession();
  const [saved,setSaved]=useState(null);
  const [loading,setLoading]=useState(true);
  const [active,setActive]=useState(null);
  const [draft,setDraft]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [connections,setConnections]=useState(null);
  const [connectionsError,setConnectionsError]=useState("");
  const [unblocking,setUnblocking]=useState(null);

  useEffect(()=>{
    let live=true;
    setLoading(true);setError("");setSaved(null);
    void loadOwnSettings().then(profile=>{
      if(live){setSaved(profile);setLoading(false);}
    }).catch(()=>{
      if(live){setError("Couldn't load your saved profile settings. Retry after checking your connection.");setLoading(false);}
    });
    return()=>{live=false;};
  },[loadOwnSettings]);

  useEffect(()=>{
    let active=true;
    void loadConnections().then(data=>{if(active)setConnections(data);})
      .catch(()=>{if(active)setConnectionsError("Blocked Users couldn't load. Retry after checking your connection.");});
    return()=>{active=false;};
  },[loadConnections]);
  async function unblock(userId){
    if(unblocking||!connections)return;
    if(!window.confirm("Unblock this member? This is your only chance to reverse the first block. If you block them again, it becomes permanent."))return;
    setUnblocking(userId);setConnectionsError("");setNotice("");
    try{
      await setSiteBlock(userId,false);
      setConnections(await loadConnections());
      setNotice("Member unblocked. Blocking this account again will be permanent.");
    }catch{setConnectionsError("Unblock failed. A permanent block cannot be reversed.");}
    finally{setUnblocking(null);}
  }

  const edit=field=>{
    if(!saved||busy)return;
    setActive(field.key);setDraft(saved.fields[field.key]||"");
    setError("");setNotice("");
  };
  const toggle=(option,checked)=>{
    const chosen=new Set(draft.split(", ").filter(Boolean));
    if(checked)chosen.add(option);else chosen.delete(option);
    const field=PROFILE_SETTINGS_FIELDS.find(f=>f.key===active);
    if(active==="pets"&&checked){
      const none=field.multi[0];
      if(option===none){setDraft(none);return;}
      chosen.delete(none);
    }
    setDraft((field?.multi||[]).filter(v=>chosen.has(v)).join(", "));
  };
  async function save(event){
    event.preventDefault();
    if(busy||!active)return;
    setError("");setNotice("");setBusy(true);
    try{
      const result=await saveOwnSetting(active,draft);
      setSaved(result);setNotice("Saved "+PROFILE_SETTINGS_FIELDS.find(f=>f.key===active).label+".");
      setActive(null);
    }catch{
      setError("Your change wasn't saved. Your draft is still here; please retry.");
    }finally{setBusy(false);}
  }
  function row(field){
    const value=saved.fields[field.key]||"";
    const editing=active===field.key;
    const oldOption=field.options&&draft&&!field.options.includes(draft);
    return <div className="ogcl-setting-row" key={field.key}>
      <div className="ogcl-setting-summary">
        <div><dt>{field.label}</dt><dd>{value||"Not specified"}</dd></div>
        {!editing&&<button type="button" data-ogc-control="secondary" data-ogc-control-id="settings.edit" disabled={busy} onClick={()=>edit(field)}>Edit</button>}
      </div>
      {editing&&<form className="ogcl-setting-editor" onSubmit={save}>
        {field.multi?<fieldset>
          <legend>Choose any that apply</legend>
          {field.multi.map(option=><label key={option}>
            <input type="checkbox" data-ogc-control-id="settings.checkbox" disabled={busy}
              checked={draft.split(", ").includes(option)}
              onChange={event=>toggle(option,event.target.checked)}/>
            {option}
          </label>)}
          {draft&&!draft.split(", ").every(v=>field.multi.includes(v))&&
            <p className="ogcl-note">Previous saved choices will remain unless you select new options.</p>}
        </fieldset>:
        field.options?<label>
          <span className="ogcl-visually-hidden">Choose {field.label}</span>
          <select data-ogc-control-id="settings.select" disabled={busy} value={draft} onChange={e=>setDraft(e.target.value)}>
            <option value="">Not specified</option>
            {oldOption&&<option value={draft}>{draft} (previous value)</option>}
            {field.options.map(option=><option key={option} value={option}>{option}</option>)}
          </select>
        </label>:
        <label>
          <span className="ogcl-visually-hidden">Edit {field.label}</span>
          <input type="text" data-ogc-control-id="settings.input" disabled={busy} maxLength={field.max} value={draft}
            onChange={e=>setDraft(e.target.value)}/>
        </label>}
        <div className="ogcl-essay-actions">
          <button type="submit" data-ogc-control="primary" data-ogc-control-id="settings.save" disabled={busy}>{busy?"Saving…":"Save"}</button>
          <button type="button" data-ogc-control="secondary" data-ogc-control-id="settings.cancel" disabled={busy} onClick={()=>{setActive(null);setError("");}}>Cancel</button>
        </div>
      </form>}
    </div>;
  }

  return <section className="ogcl-view" aria-labelledby="ogcl-settings-heading">
    <header className="ogcl-view-head">
      <h1 id="ogcl-settings-heading">Profile Settings</h1>
      <p>Edit your saved profile details without changing your essays or match answers.</p>
    </header>
    <div className="ogcl-content-panel ogcl-profile-settings">
      {loading&&<p role="status">Loading your settings…</p>}
      {error&&<p role="alert" className="ogcl-error">{error}</p>}
      {notice&&<p role="status" className="ogcl-save-confirmation">{notice}</p>}
      {saved&&<>
        <p><NavLink to="/profile">Edit About essays</NavLink>
          {saved.slug&&<> · <NavLink to={"/profiles/"+saved.slug}>View your profile</NavLink></>}</p>
        <section className="ogcl-settings-group">
          <h2>Account identity</h2>
          <dl className="ogcl-settings-readonly">
            <div><dt>Signup name</dt><dd>{saved.displayName} <small>(read-only)</small></dd></div>
            <div><dt>Age</dt><dd>{saved.age??"Not available"} <small>(read-only)</small></dd></div>
          </dl>
        </section>
        <LookingForSettings profile={saved} saveOwnLookingFor={saveOwnLookingFor}
          onSaved={profile=>{setSaved(profile);setNotice("Saved your looking-for preferences.");}}/>
        {groups.map(group=><section key={group.id} className="ogcl-settings-group">
          <h2>{group.title}</h2><p className="ogcl-quiet">{group.intro}</p>
          <dl>{PROFILE_SETTINGS_FIELDS.filter(f=>f.group===group.id).map(row)}</dl>
        </section>)}
        <p className="ogcl-quiet">Your signup identity, birthday, photos, saved essays and match answers are never changed by saving these settings. Algorithmic recommendations will use these saved defaults when the matching filters are enabled.</p>
      </>}
      <section className="ogcl-settings-group ogcl-blocked-users" aria-labelledby="ogcl-blocked-heading">
        <h2 id="ogcl-blocked-heading">Blocked Users</h2>
        {connections?<p className="ogcl-blocked-by-count">
          You have been blocked by {connections.blockedByCount} {connections.blockedByCount===1?"person":"people"}.
        </p>:<p role="status">Loading blocked member settings…</p>}
        {connectionsError&&<p role="alert" className="ogcl-error">{connectionsError}</p>}
        {connections&&<>
          <p className="ogcl-quiet">These are people you've blocked. Members who blocked you are never identified.</p>
          {connections.blocks.length?<ul className="ogcl-blocked-list">
            {connections.blocks.map(member=><li key={member.userId}>
              <span><strong>{member.displayName}</strong>
                <small>{member.permanent?"Permanent block":"First block — one unblock available"}</small></span>
              {member.permanent?<span className="ogcl-block-permanent">Cannot unblock</span>:
                <button type="button" disabled={!!unblocking} onClick={()=>void unblock(member.userId)}>
                  {unblocking===member.userId?"Unblocking…":"Unblock"}
                </button>}
            </li>)}
          </ul>:<p>You haven't blocked any members.</p>}
        </>}
      </section>
    </div>
  </section>;
}
