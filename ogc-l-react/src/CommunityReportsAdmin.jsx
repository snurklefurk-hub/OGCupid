import React,{useCallback,useEffect,useState} from "react";
import {useMemberSession} from "./MemberSessionProvider.jsx";

const time=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString():"";};
export default function CommunityReportsAdmin(){
  const {communityRequest}=useMemberSession();
  const [reports,setReports]=useState([]),[loading,setLoading]=useState(true);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const [reason,setReason]=useState(""),[busy,setBusy]=useState(false);
  const [selected,setSelected]=useState(null);
  const load=useCallback(async()=>{
    const result=await communityRequest("/community/reports");
    if(!Array.isArray(result.reports))throw Error("Invalid moderation response");
    setReports(result.reports);
  },[communityRequest]);
  useEffect(()=>{let active=true;setLoading(true);
    void load().catch(()=>{if(active)setError("Couldn't load community reports.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[load]);
  async function moderate(action){
    if(busy||selected===null||reason.trim().length<8||reason.length>500)return;
    if(action==="hide"&&!window.confirm("Hide this message from every member? The reported text will be kept as moderation evidence."))return;
    setBusy(true);setError("");setNotice("");
    try{
      const result=await communityRequest("/community/reports/"+selected+"/action","POST",
        {action,reason:reason.trim()});
      if(result.moderated!==true)throw Error("Action not confirmed");
      setNotice(action==="hide"?"Message hidden and reports resolved.":"Report dismissed.");
      setSelected(null);setReason("");
      await load();
    }catch{setError("Couldn't save that moderation decision. Refresh and retry.");}
    finally{setBusy(false);}
  }
  return <section className="ogcl-admin-section" aria-label="Chatroom moderation">
    <div className="ogcl-admin-section-head">
      <h2>Community chat reports</h2>
      <button className="ogcl-button ogcl-secondary" type="button" disabled={busy}
        onClick={()=>void load().catch(()=>setError("Couldn't refresh reports."))}>Refresh</button>
    </div>
    <p>Chatroom messages are shared with all signed-in members. Reports don't automatically remove posts.
      Hiding retains the original text privately for review.</p>
    {loading&&<p role="status">Loading reported chat messages…</p>}
    {error&&<p role="alert" className="ogcl-error">{error}</p>}
    {notice&&<p role="status" className="ogcl-save-confirmation">{notice}</p>}
    {!loading&&!reports.length&&<p>No community reports are awaiting review.</p>}
    <div className="ogcl-admin-list" aria-label="Community abuse reports">
      {reports.map(item=><button type="button" key={item.id}
        className={item.id===selected?"active":""}
        onClick={()=>{setSelected(item.id);setReason("");setError("");}}>
        <strong>{item.authorName||"Member"} · {item.reason}</strong>
        <small>{time(item.createdAt)} · message #{item.messageId}</small>
        <span>{item.body}</span>
      </button>)}
    </div>
    {selected!==null&&<form className="ogcl-admin-action" onSubmit={event=>{
      event.preventDefault();void moderate("hide");
    }}>
      <h3>Review chat message</h3>
      <label>Reason for decision
        <textarea required minLength={8} maxLength={500} rows={3}
          value={reason} onChange={e=>setReason(e.target.value)}
          placeholder="Record why the message should stay or be hidden."/></label>
      <div className="ogcl-admin-toolbar">
        <button className="ogcl-button" type="submit" disabled={busy||reason.trim().length<8}>
          Hide message</button>
        <button className="ogcl-button ogcl-secondary" type="button"
          disabled={busy||reason.trim().length<8} onClick={()=>void moderate("dismiss")}>Dismiss report</button>
      </div>
    </form>}
  </section>;
}
