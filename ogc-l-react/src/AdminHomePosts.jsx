import React,{useEffect,useState} from "react";
import {useMemberSession} from "./MemberSessionProvider.jsx";
export default function AdminHomePosts(){
  const {adminRequest}=useMemberSession();
  const [posts,setPosts]=useState([]),[body,setBody]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  useEffect(()=>{let active=true;adminRequest("/admin/home-posts").then(data=>{if(active)setPosts(Array.isArray(data)?data:[]);}).catch(()=>{if(active)setError("Couldn't load previous posts.");});return()=>{active=false;};},[adminRequest]);
  async function send(e){
    e.preventDefault();if(busy||!body.trim())return;
    setBusy(true);setError("");setNotice("");
    try{const data=await adminRequest("/admin/home-posts","POST",{body:body.trim()});if(!Array.isArray(data))throw Error();setPosts(data);setBody("");setNotice("Posted to Home.");}
    catch{setError("The announcement couldn't be posted. Please retry.");}
    finally{setBusy(false);}
  }
  return <section className="ogcl-admin-section">
    <h2>A word from Admin</h2>
    <form className="ogcl-account-form" onSubmit={send}><label>Announcement<textarea rows={5} maxLength={2000} required value={body} disabled={busy} onChange={e=>setBody(e.target.value)}/></label>
      <button className="ogcl-button" type="submit" disabled={busy||!body.trim()}>{busy?"Sending…":"Send"}</button></form>
    {error&&<p role="alert" className="ogcl-error">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    <h3>Previous posts</h3>
    {posts.length?<div className="ogcl-home-admin-posts">{posts.map(post=><article key={post.id}><time>{new Date(post.createdAt).toLocaleString()}</time><p>{post.body}</p></article>)}</div>:<p>No previous posts.</p>}
  </section>;
}
