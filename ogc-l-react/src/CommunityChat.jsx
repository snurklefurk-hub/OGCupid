import React,{useCallback,useEffect,useLayoutEffect,useRef,useState} from "react";
import {NavLink} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import "./community.css";

const POLL_MS=4000,MAX_ITEMS=200;
const REASONS=[["harassment","Harassment or threats"],["spam","Spam or scams"],
  ["sexual","Unsolicited sexual content"],["other","Other"]];
const formatTime=value=>{
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toLocaleTimeString([],{
    hour:"2-digit",minute:"2-digit"}):"";
};
function normalizeMessages(data){
  if(!Array.isArray(data?.messages)||data.messages.length>100)
    throw Error("Invalid room response");
  return data.messages.map(item=>{
    if(!Number.isSafeInteger(item?.id)||item.id<1||
      typeof item?.body!=="string"||item.body.length>500||
      typeof item?.name!=="string"||item.name.length>60||
      !/^[0-9a-f-]{36}$/i.test(item?.senderId||"")||
      !Number.isFinite(new Date(item?.createdAt).getTime()))
      throw Error("Invalid chat message");
    return {...item,slug:/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug||"")?item.slug:null};
  }).sort((a,b)=>a.id-b.id);
}
function mergeRows(previous,incoming,replace=false){
  if(replace)return incoming.slice(-MAX_ITEMS);
  const map=new Map(previous.map(item=>[item.id,item]));
  for(const message of incoming)map.set(message.id,message);
  return [...map.values()].sort((a,b)=>a.id-b.id).slice(-MAX_ITEMS);
}
export default function CommunityChat(){
  const {kind,user,communityRequest}=useMemberSession();
  const [messages,setMessages]=useState([]);
  const [draft,setDraft]=useState("");
  const [initial,setInitial]=useState(true),[sending,setSending]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const [reportId,setReportId]=useState(null),[reason,setReason]=useState("spam");
  const [reporting,setReporting]=useState(false);
  const feedRef=useRef(null),inputRef=useRef(null);
  const cursor=useRef(null),inflight=useRef(false),stopped=useRef(false);
  const keepAtBottom=useRef(true),pollCount=useRef(0);
  const load=useCallback(async (reset=false)=>{
    if(stopped.current||inflight.current||document.visibilityState==="hidden")return;
    inflight.current=true;
    const replace=reset||pollCount.current++%15===0||cursor.current===null;
    try{
      const path="/community"+(!replace&&cursor.current?"?after="+cursor.current:"");
      const data=normalizeMessages(await communityRequest(path));
      if(stopped.current)return;
      setMessages(prev=>mergeRows(prev,data,replace));
      if(data.length)cursor.current=Math.max(cursor.current||0,data.at(-1).id);
      setError("");
    }catch(e){
      if(!stopped.current)setError(e?.code==="unauthorized"?"Your session expired. Please sign in again.":"Chatroom connection lost. Retrying…");
    }finally{
      inflight.current=false;
      if(!stopped.current)setInitial(false);
    }
  },[communityRequest]);

  useEffect(()=>{
    stopped.current=false;cursor.current=null;inflight.current=false;pollCount.current=0;
    keepAtBottom.current=true;
    setMessages([]);setInitial(true);setError("");setNotice("");setReportId(null);
    if(kind!=="member"&&kind!=="onboarding")return()=>{stopped.current=true;};
    void load(true);
    const timer=setInterval(()=>void load(),POLL_MS);
    const onVisible=()=>{if(document.visibilityState==="visible")void load();};
    document.addEventListener("visibilitychange",onVisible);
    return()=>{stopped.current=true;clearInterval(timer);document.removeEventListener("visibilitychange",onVisible);};
  },[kind,user?.id,load]);

  useLayoutEffect(()=>{
    const feed=feedRef.current;
    if(feed&&keepAtBottom.current)feed.scrollTop=feed.scrollHeight;
  },[messages]);

  async function send(event){
    event.preventDefault();
    const value=draft.trim().replace(/[\r\n]+/g," ");
    if(sending||!value||value.length>500)return;
    setSending(true);setError("");setNotice("");
    try{
      const result=await communityRequest("/community","POST",{body:value});
      if(result?.sent!==true)throw Error("Send not confirmed");
      setDraft("");
      keepAtBottom.current=true;
      // The verified server message is immediately retrieved, not invented.
      await load();
    }catch(e){
      setError(e?.code==="rate_limited"?"Slow down a moment before sending again.":
        e?.code==="unauthorized"?"Your session expired. Sign in again.":
          "That message wasn't sent. Your text is still here.");
    }finally{setSending(false);inputRef.current?.focus();}
  }
  async function report(messageId){
    if(reporting)return;
    setReporting(true);setError("");setNotice("");
    try{
      const result=await communityRequest("/community/"+messageId+"/report","POST",{reason});
      if(result?.reported!==true)throw Error("Report unconfirmed");
      setNotice("Report sent for human review.");
      setReportId(null);
    }catch{setError("Report could not be submitted. Try again.");}
    finally{setReporting(false);}
  }

  if(kind!=="member"&&kind!=="onboarding"){
    return <section className="ogcl-view">
      <header className="ogcl-view-head"><h1>Community</h1></header>
      <div className="ogcl-content-panel"><p>Sign in to join the community chatroom.</p>
        <p><NavLink to="/signin">Sign in</NavLink> · <NavLink to="/join">Join OG Cupid</NavLink></p>
      </div></section>;
  }
  return <section className="ogcl-view ogcl-community" aria-labelledby="ogcl-community-heading">
    <header className="ogcl-view-head">
      <h1 id="ogcl-community-heading">Community Chat</h1>
      <p>One room. Everyone signed in is welcome. Just type and press Enter.</p>
    </header>
    <div className="ogcl-community-panel">
      <div className="ogcl-community-topline"><strong>OG Cupid · The Lounge</strong>
        <span>Messages refresh automatically · No online count or private rooms</span>
        <button type="button" onClick={()=>void load(true)}>Refresh</button>
      </div>
      <div className="ogcl-community-log" role="log" aria-label="Community chat messages"
        ref={feedRef} aria-live="polite" aria-relevant="additions text"
        onScroll={e=>{
          const t=e.currentTarget;keepAtBottom.current=
            t.scrollHeight-t.clientHeight-t.scrollTop<85;
        }}>
        {initial&&<p className="ogcl-community-system">Connecting to the room…</p>}
        {!initial&&!messages.length&&!error&&<p className="ogcl-community-system">
          Quiet in here. You can be the first to say something.
        </p>}
        {messages.map(message=><div className="ogcl-community-line" key={message.id}>
          <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
            [{formatTime(message.createdAt)}]
          </time>{" "}
          {message.slug
            ?<NavLink className="ogcl-community-name" to={"/profiles/"+message.slug}>{message.name}</NavLink>
            :<strong className="ogcl-community-name">{message.name}</strong>}
          <span className="ogcl-community-colon">: </span>
          <span className="ogcl-community-text">{message.body}</span>
          {message.senderId!==user?.id&&<button type="button"
            className="ogcl-community-report"
            aria-label={"Report message from "+message.name}
            onClick={()=>{setReportId(reportId===message.id?null:message.id);setReason("spam");}}>Report</button>}
          {reportId===message.id&&<div className="ogcl-community-report-form">
            <label>Report reason <select value={reason} onChange={e=>setReason(e.target.value)}>
              {REASONS.map(([key,label])=><option key={key} value={key}>{label}</option>)}
            </select></label>
            <button type="button" disabled={reporting} onClick={()=>void report(message.id)}>
              {reporting?"Sending…":"Submit report"}</button>
            <button type="button" disabled={reporting} onClick={()=>setReportId(null)}>Cancel</button>
          </div>}
        </div>)}
      </div>
      {error&&<p className="ogcl-community-error" role="alert">{error}</p>}
      {notice&&<p className="ogcl-community-status" role="status">{notice}</p>}
      <form className="ogcl-community-compose" onSubmit={send}>
        <label htmlFor="ogcl-community-input">Message</label>
        <input id="ogcl-community-input" ref={inputRef} type="text" autoComplete="off"
          maxLength={500} value={draft} onChange={e=>setDraft(e.target.value)}
          placeholder="Say something…" aria-label="Chatroom message"/>
        <button type="submit" disabled={sending||!draft.trim()}>
          {sending?"Sending…":"Send"}</button>
      </form>
      <p className="ogcl-community-footnote">Everyone signed in can read what you post here.
        No HTML, images or direct messages in this room. Be decent to each other.</p>
    </div>
  </section>;
}
