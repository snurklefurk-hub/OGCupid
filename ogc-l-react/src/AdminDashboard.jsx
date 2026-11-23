import React,{useCallback,useEffect,useMemo,useRef,useState} from "react";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import "./admin.css";
import CommunityReportsAdmin from "./CommunityReportsAdmin.jsx";
import AdminMemberEditor from "./AdminMemberEditor.jsx";

const AdminUiEditor=React.lazy(()=>import("./AdminUiEditor.jsx"));

const choices=[
  ["start_review","Mark under review"],
  ["dismiss","Dismiss report"],
  ["warn","Warn member"],
  ["suspend_24h","Suspend 24 hours"],
  ["suspend_7d","Suspend 7 days"],
  ["suspend_30d","Suspend 30 days"],
  ["ban","Permanently ban"]
];
const punitive=new Set(["warn","suspend_24h","suspend_7d","suspend_30d","ban"]);
const readableStatus=s=>s==="under_review"?"Under Review":s==="resolved"?"Resolved":"Pending";
const stamp=s=>{const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleString():"—";};
const shortId=id=>typeof id==="string"?id.slice(0,8):"—";

export default function AdminDashboard(){
  const {adminRequest}=useMemberSession();
  const [tab,setTab]=useState("overview");
  const [editingMember,setEditingMember]=useState(null);
  const [summary,setSummary]=useState(null);
  const [members,setMembers]=useState([]);
  const [reports,setReports]=useState([]);
  const [search,setSearch]=useState("");
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState("open");
  const [activeReport,setActiveReport]=useState(null);
  const [evidence,setEvidence]=useState(null);
  const [action,setAction]=useState("start_review");
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [denied,setDenied]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(true);

  const [sectionLoading,setSectionLoading]=useState("");
  const loadedTabs=useRef(new Set());
  const pendingTabs=useRef(new Set());

  // Fetch only what the opened tab displays. The overview count also
  // authorizes the dashboard, without preloading reports/member data.
  const loadSection=useCallback(async(section,q="")=>{
    if(section==="members"){
      const users=await adminRequest("/admin/members"+(q?"?q="+encodeURIComponent(q):""));
      setMembers(Array.isArray(users)?users:[]);
    }else if(section==="reports"){
      const flags=await adminRequest("/admin/reports");
      setReports(Array.isArray(flags)?flags:[]);
    }else if(section==="overview"||section==="audit"){
      setSummary(await adminRequest("/admin"));
    }
  },[adminRequest]);

  useEffect(()=>{
    let live=true;
    setLoading(true);setError("");setDenied(false);
    void adminRequest("/admin").then(counts=>{
      if(live)setSummary(counts);
    }).catch(e=>{
      if(!live)return;
      if(e?.code==="forbidden")setDenied(true);
      else setError("The administration service could not be reached.");
    }).finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;};
  },[adminRequest]);

  useEffect(()=>{
    if(!summary||!["members","reports"].includes(tab)||
       loadedTabs.current.has(tab)||pendingTabs.current.has(tab))return;
    const section=tab;
    let live=true;
    pendingTabs.current.add(section);
    setSectionLoading(section);
    void loadSection(section,section==="members"?query:"").then(()=>{
      loadedTabs.current.add(section);
    }).catch(e=>{
      if(live){
        if(e?.code==="forbidden")setDenied(true);
        else setError("Could not load "+section+".");
      }
    }).finally(()=>{
      pendingTabs.current.delete(section);
      if(live)setSectionLoading("");
    });
    return ()=>{live=false;};
  },[tab,summary,query,loadSection]);

  async function reload(q=query,section=tab){
    setBusy(true);setError("");setNotice("");
    try{
      await loadSection(section,q);
      loadedTabs.current.add(section);
    }catch(e){
      if(e?.code==="forbidden")setDenied(true);
      else setError("Could not refresh the "+section+" section.");
    }finally{setBusy(false);}
  }

  async function openReport(id){
    setActiveReport(id);setEvidence(null);setReason("");setAction("start_review");
    setBusy(true);setError("");setNotice("");
    try{setEvidence(await adminRequest("/admin/reports/"+id));}
    catch{setError("The report evidence is unavailable.");}
    finally{setBusy(false);}
  }
  async function review(event){
    event.preventDefault();
    if(!evidence||busy||reason.trim().length<8)return;
    if(punitive.has(action)&&
       !window.confirm("Apply "+choices.find(x=>x[0]===action)?.[1].toLowerCase()+
         " to this member? This will be recorded in the audit log."))return;
    setBusy(true);setError("");setNotice("");
    try{
      await adminRequest("/admin/reports/"+evidence.id+"/action","POST",
        {action,reason:reason.trim()});
      setNotice("Action recorded. Member access and report status updated.");
      await Promise.all([loadSection("overview"),loadSection("reports")]);
      setEvidence(null);setActiveReport(null);setReason("");
    }catch(e){setError(e?.code==="invalid"?"This report has changed; refresh and try again.":"Couldn't save the action.");}
    finally{setBusy(false);}
  }
  async function reinstate(member){
    const explanation=window.prompt("Reason for reinstating "+member.name+" (minimum 8 characters):");
    if(!explanation)return;
    if(explanation.trim().length<8||explanation.trim().length>500){
      setError("A reinstatement reason must contain 8–500 characters.");return;
    }
    if(!window.confirm("Reinstate "+member.name+"? This lifts a permanent ban."))return;
    setBusy(true);setError("");setNotice("");
    try{
      const done=await adminRequest("/admin/members/"+member.id+"/reinstate","POST",
        {reason:explanation.trim()});
      if(!done)throw Error("Account not eligible");
      setNotice("Permanent ban lifted and administrator action recorded.");
      await Promise.all([loadSection("overview"),loadSection("members",query)]);
    }catch{setError("Reinstatement failed or the member is no longer eligible.");}
    finally{setBusy(false);}
  }
  const visibleReports=useMemo(()=>reports.filter(r=>
    filter==="all"||filter==="open"&&r.status!=="resolved"||r.status===filter
  ),[reports,filter]);

  if(loading)return <section className="ogcl-view"><header className="ogcl-view-head">
    <h1>Administration</h1></header><div className="ogcl-content-panel"><p role="status">
    Verifying your administrator privileges…</p></div></section>;
  if(denied)return <section className="ogcl-view"><header className="ogcl-view-head">
    <h1>Administration</h1></header><div className="ogcl-content-panel">
    <p role="alert">You do not have administrator access to this area.</p></div></section>;
  if(!summary)return <section className="ogcl-view"><header className="ogcl-view-head"><h1>Administration</h1>
    </header><div className="ogcl-content-panel"><p role="alert">{error||"Unable to load admin data."}</p>
    <button type="button" className="ogcl-button" onClick={()=>void reload()}>Retry</button>
    </div></section>;
  return <section className="ogcl-view ogcl-admin" aria-labelledby="ogcl-admin-heading">
    <div className="ogcl-period-stage">
    <header className="ogcl-view-head">
      <h1 id="ogcl-admin-heading">OG Cupid Administration</h1>
      <p>Member operations, abuse reports, and moderation audit · authorized access only</p>
    </header>
      <div className="ogcl-admin-toolbar">
        <nav aria-label="Administration sections" className="ogcl-period-tabs">
          {["overview","reports","community","members","audit","ui-editor"].map(t=><button key={t} type="button"
            className={tab===t?"selected":""} aria-current={tab===t?"page":undefined}
            onClick={()=>{setTab(t);setError("");setNotice("");}}>{t==="audit"?"Action log":t==="ui-editor"?"UI Editor":t[0].toUpperCase()+t.slice(1)}</button>)}
        </nav>
        <button type="button" className="ogcl-button ogcl-secondary" disabled={busy||tab==="ui-editor"}
          onClick={()=>void reload()}>{busy?"Working…":"Refresh"}</button>
      </div>
    </div>
    <div className="ogcl-content-panel">
      {error&&<p role="alert" className="ogcl-error">{error}</p>}
      {notice&&<p role="status" className="ogcl-save-confirmation">{notice}</p>}

      {tab==="ui-editor"&&<React.Suspense fallback={<p role="status">Loading visual editor…</p>}><AdminUiEditor/></React.Suspense>}
      {tab==="overview"&&<>
        <div className="ogcl-admin-stats">
          {[
            ["Accounts",summary.accounts],["Profiles",summary.profiles],
            ["Completed onboarding",summary.onboarded],["Profile photos",summary.photos],
            ["Private messages",summary.messages],["Open reports",summary.openReports],
            ["Suspended",summary.suspended],["Permanently banned",summary.permanentlyBanned]
          ].map(([label,value])=><div className="ogcl-admin-stat" key={label}><strong>{value??0}</strong><span>{label}</span></div>)}
        </div>
        <section className="ogcl-admin-section">
          <h2>Review queue</h2>
          <p>Incoming reports do not automatically penalize members. Each intervention requires a moderator decision.</p>
          <button type="button" className="ogcl-button" onClick={()=>setTab("reports")}>
            Review {summary.openReports||0} open reports
          </button>
        </section>
        <section className="ogcl-admin-section">
          <h2>System notes</h2>
          <p>Figures come from the live Neon database, not placeholder activity. This dashboard shows server-stored text reports; image-attachment evidence review is not yet available.</p>
          <p>Access is checked by the API against the currently saved admin role. Actions are logged with moderator identity, reason and timestamp.</p>
        </section>
      </>}

      {tab==="reports"&&<section className="ogcl-admin-section">
        <div className="ogcl-admin-section-head"><h2>Reported messages</h2>
          <label>Status <select value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="open">Open</option><option value="pending">Pending</option>
            <option value="under_review">Under Review</option><option value="resolved">Resolved</option>
            <option value="all">All reports</option></select></label>
        </div>
        <p className="ogcl-admin-muted">Only flagged private-message evidence is accessible here. Reporters are not disclosed to reported members.</p>
        {sectionLoading==="reports"?<p role="status">Loading reports…</p>:
        visibleReports.length===0?<p>No reports in this category.</p>:
          <div className="ogcl-admin-grid">
            <div className="ogcl-admin-list" aria-label="Moderation reports">
              {visibleReports.map(r=><button type="button" key={r.id}
                className={activeReport===r.id?"active":""}
                onClick={()=>void openReport(r.id)}>
                <strong>{r.reportedName||"Member"} · {r.reason}</strong>
                <small>{readableStatus(r.status)} · {stamp(r.createdAt)}</small>
                <span>Reported by {r.reporterName||"Member"}</span>
              </button>)}
            </div>
            <div className="ogcl-admin-evidence">
              {!activeReport?<p>Select a report to review its evidence.</p>:
               busy&&!evidence?<p role="status">Loading evidence…</p>:
               evidence?<><h3>Conversation evidence</h3>
                <p>Reason: <strong>{evidence.reason}</strong>. Only actual stored messages are shown.</p>
                <div className="ogcl-admin-transcript" aria-label="Private report evidence">
                  {evidence.messages?.map(m=><div key={m.id} className={m.reported?"flagged":""}>
                    <strong>{m.senderId===evidence.reportedId?"Reported member":"Reporting member"}</strong>
                    <small> · {stamp(m.createdAt)}{m.reported?" · FLAGGED":""}</small>
                    <p>{m.body}</p>
                  </div>)}
                </div>
                {evidence.status!=="resolved"?<form className="ogcl-admin-action" onSubmit={e=>void review(e)}>
                  <h3>Moderator decision</h3>
                  <label>Action<select value={action} onChange={e=>setAction(e.target.value)}>
                    {choices.map(([id,label])=><option key={id} value={id}>{label}</option>)}
                  </select></label>
                  <label>Reason (required for audit)<textarea required minLength={8} maxLength={500}
                    rows={3} value={reason} onChange={e=>setReason(e.target.value)}
                    placeholder="Explain the decision and evidence considered."/></label>
                  <button type="submit" className="ogcl-button" disabled={busy||reason.trim().length<8}>
                    {busy?"Saving…":"Save moderation action"}
                  </button>
                  {punitive.has(action)&&<p className="ogcl-admin-caution">This action changes another member's account. Confirmation is required.</p>}
                </form>:<p><strong>Resolved.</strong> Check the action log for recorded decisions.</p>}
               </>:<p>Unable to display the selected report.</p>}
            </div>
          </div>}
      </section>}

      {tab==="community"&&<CommunityReportsAdmin/>}

      {tab==="members"&&(editingMember?
        <AdminMemberEditor key={editingMember.id} member={editingMember}
          onClose={()=>setEditingMember(null)}/>:
        <section className="ogcl-admin-section">
        <h2>Member accounts</h2>
        <form className="ogcl-admin-search" onSubmit={e=>{e.preventDefault();setQuery(search.trim());void reload(search.trim());}}>
          <label>Search name or email<input type="search" maxLength={80} value={search}
            onChange={e=>setSearch(e.target.value)} placeholder="Search accounts"/></label>
          <button type="submit" className="ogcl-button" disabled={busy}>Search</button>
          <button type="button" className="ogcl-button ogcl-secondary" disabled={busy} onClick={()=>{
            setSearch("");setQuery("");void reload("");
          }}>Clear</button>
        </form>
        {sectionLoading==="members"&&<p role="status">Loading accounts…</p>}
        <div className="ogcl-admin-table-scroll"><table className="ogcl-admin-table">
          <thead><tr><th>Account</th><th>Profile</th><th>Joined</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{members.map(m=><tr key={m.id}>
            <td><strong>{m.name}</strong><small>{m.email}</small><small>{m.verified?"Verified":"Unverified"} · {m.role}</small></td>
            <td>{m.profile||"Not created"}<small>{m.onboarded?"Complete onboarding":"Incomplete onboarding"}</small></td>
            <td>{stamp(m.createdAt)}</td>
            <td>{m.banned?(m.banExpires&&new Date(m.banExpires)<=new Date()?"Suspension expired":
              m.banExpires?"Suspended until "+stamp(m.banExpires):"Permanently banned"):"Active"}</td>
            <td><button type="button" className="ogcl-button ogcl-secondary" disabled={busy}
                onClick={()=>setEditingMember(m)}>Edit profile, photos & answers</button>
              {m.banned&&!m.banExpires&&m.role!=="admin"?
              <button type="button" className="ogcl-button ogcl-secondary" disabled={busy}
                onClick={()=>void reinstate(m)}>Reinstate</button>:"—"}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="ogcl-admin-muted">Limited to the 100 most recent matching accounts. Member passwords are never shown. Permanent bans require an explicit reinstatement reason.</p>
      </section>)}

      {tab==="audit"&&<section className="ogcl-admin-section"><h2>Recent moderation actions</h2>
        {summary.recentActions?.length?<div className="ogcl-admin-table-scroll">
          <table className="ogcl-admin-table"><thead><tr><th>When</th><th>Action</th>
            <th>Member</th><th>Moderator</th><th>Reason</th></tr></thead><tbody>
            {summary.recentActions.map((a,i)=><tr key={i}>
              <td>{stamp(a.createdAt)}</td><td>{a.action.replaceAll("_"," ")}</td>
              <td>{shortId(a.subjectId)}</td><td>{shortId(a.moderatorId)}</td><td>{a.reason}</td>
            </tr>)}
          </tbody></table></div>:<p>No moderator actions have been recorded yet.</p>}
        <p className="ogcl-admin-muted">The database stores the full event IDs, actor IDs, UTC timestamps, reasons and action types. This view displays the 15 latest entries.</p>
      </section>}
    </div>
  </section>;
}