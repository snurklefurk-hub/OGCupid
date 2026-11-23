import React,{useEffect,useState} from "react";
import {NavLink,useParams} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";

const displayTime=value=>{
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toLocaleString():"";
};
export default function MessagesView(){
  const {peerId}=useParams();
  const {user,loadInbox,loadConversation,sendMessage,reportMessage}=useMemberSession();
  const [inbox,setInbox]=useState(null);
  const [thread,setThread]=useState(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [draft,setDraft]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [reportId,setReportId]=useState(null);
  const [reason,setReason]=useState("spam");

  useEffect(()=>{
    let active=true;
    setInbox(null);setThread(null);setDraft("");setReportId(null);
    setError("");setNotice("");setLoading(true);
    const promise=peerId?loadConversation(peerId):loadInbox();
    void promise.then(data=>{
      if(!active)return;
      if(peerId)setThread(data);
      else setInbox(data);
    }).catch(()=>{
      if(active)setError("Messages couldn't load. Check your connection or sign in again.");
    }).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[peerId,loadConversation,loadInbox]);

  async function send(event){
    event.preventDefault();
    if(busy||!draft.trim()||!thread?.canSend)return;
    const body=draft.trim();
    setBusy(true);setError("");setNotice("");
    try{
      const confirmed=await sendMessage(peerId,body);
      setThread(previous=>previous?{...previous,messages:[...previous.messages,confirmed]}:previous);
      setDraft("");setNotice("Message sent.");
    }catch(e){
      setError(e?.code==="rate_limited"?"You're sending too quickly. Please try later."
        :e?.code==="blocked"?"This member cannot receive a message."
        :"Message wasn't sent. Your draft is still here.");
    }finally{setBusy(false);}
  }

  async function submitReport(messageId){
    if(busy||!thread)return;
    setBusy(true);setError("");setNotice("");
    try{
      await reportMessage(peerId,messageId,reason);
      setReportId(null);
      setNotice("Report recorded for review. You may also block this member.");
    }catch{setError("Report wasn't recorded. Please retry.");}
    finally{setBusy(false);}
  }

  return <section className="ogcl-view" aria-labelledby="ogcl-messages-heading">
    <header className="ogcl-view-head">
      <h1 id="ogcl-messages-heading">{peerId?(thread?.peer.displayName||"Conversation"):"Messages"}</h1>
      <p>Private conversations with actual OG Cupid members.</p>
    </header>
    <div className="ogcl-content-panel ogcl-messages">
      {peerId&&<p><NavLink to="/messages"><span data-ogc-edit-text="copy.messages.back-to-inbox">‹ Back to inbox</span></NavLink></p>}
      {loading&&<p role="status">Loading saved messages…</p>}
      {error&&<p role="alert" className="ogcl-error">{error}</p>}
      {notice&&<p role="status" className="ogcl-save-confirmation">{notice}</p>}
      {!peerId&&!loading&&inbox&&<>
        <p className="ogcl-quiet"><span data-ogc-edit-text="copy.messages.only-conversations-you-ve-actually-had-appear-here-no-f">Only conversations you've actually had appear here. No fake activity or read receipts.</span></p>
        {inbox.length? <ul className="ogcl-inbox-list">{inbox.map(item=>
          <li key={item.peerId}>
            <NavLink to={"/messages/"+item.peerId} className="ogcl-conversation-link">
              <strong>{item.displayName}</strong>
              <small>{displayTime(item.lastMessage.createdAt)}</small>
              <span>{item.lastMessage.senderId===user?.id?"You: ":""}{item.lastMessage.body}</span>
            </NavLink>
          </li>)}</ul> :
          <p>Your inbox is empty. To say hello, open someone's <NavLink to="/matches"><span data-ogc-edit-text="copy.messages.profile-in-matches">profile in MATCHES</span></NavLink>.</p>}
      </>}
      {peerId&&!loading&&thread&&<>
        <div className="ogcl-thread-head">
          <p>With {thread.pairBlocked?<strong>{"<blocked user>"}</strong>:
            <NavLink to={"/profiles/"+thread.peer.slug}><strong>{thread.peer.displayName}</strong></NavLink>}</p>
        </div>
        <div className="ogcl-message-history" role="log" aria-label="Conversation history">
          {thread.messages.length?thread.messages.map(item=>{
            const mine=item.senderId===user?.id;
            return <article key={item.id} className={"ogcl-message "+(mine?"ogcl-sent":"ogcl-received")}>
              <p className="ogcl-message-body">{item.body}</p>
              <footer>
                <span>{mine?"You":thread.peer.displayName} · {displayTime(item.createdAt)}</span>
                {!mine&&<button type="button" className="ogcl-report-link"
                  onClick={()=>{setReportId(item.id===reportId?null:item.id);setReason("spam");}}>
                  Report
                </button>}
              </footer>
              {reportId===item.id&&<div className="ogcl-report-form">
                <label><span data-ogc-edit-text="copy.messages.reason">Reason</span> <select value={reason} onChange={e=>setReason(e.target.value)}>
                  <option value="spam">Spam</option><option value="harassment">Harassment</option>
                  <option value="other">Other</option>
                </select></label>
                <button className="ogcl-button" type="button" disabled={busy}
                  onClick={()=>void submitReport(item.id)}><span data-ogc-edit-text="copy.messages.submit-report">Submit report</span></button>
              </div>}
            </article>;
          }):<p><span data-ogc-edit-text="copy.messages.no-messages-yet-say-hello-to-start-the-conversation">No messages yet. Say hello to start the conversation.</span></p>}
        </div>
        {thread.canSend&&!thread.pairBlocked?<form className="ogcl-message-compose" onSubmit={send}>
          <label htmlFor="ogcl-message-text"><span data-ogc-edit-text="copy.messages.write-a-message">Write a message</span></label>
          <textarea id="ogcl-message-text" rows={4} maxLength={2000} required value={draft}
            onChange={event=>setDraft(event.target.value)} data-ogc-edit-text="copy.messages.placeholder-say-something-thoughtful" placeholder="Say something thoughtful…" />
          <div><span>{draft.length}/2000</span>
            <button type="submit" className="ogcl-button" disabled={busy||!draft.trim()}>
              {busy?"Sending…":"Send message"}
            </button>
          </div>
        </form>:<p className="ogcl-note" role="status">
          {thread.pairBlocked?"This conversation is blocked. No further messages can be sent.":
            "New messages aren't available in this conversation. You can still review earlier messages."}
        </p>}
        <p className="ogcl-quiet">Messages are private between participants, but reports may be reviewed for safety.
          If you feel unsafe, block and report; do not share sensitive personal information.</p>
      </>}
    </div>
  </section>;
}
