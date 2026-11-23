import React,{useCallback,useEffect,useMemo,useState} from "react";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {validatePromoCard,resolvePromoUrl} from "./promo-contract.mjs";
import "./admin-promos.css";

const blank=()=>({category:"editorial",side:"both",title:"",body:"",url:"",enabled:true});
const editable=card=>({category:card.category,side:card.side,title:card.title,
  body:card.body,url:card.url??"",enabled:card.enabled===true});
const groupLabel=category=>category==="refinement"?"Profile refinement":"General promotion";

export default function AdminPromos({onUnsavedChange}){
  const {adminRequest}=useMemberSession();
  const [cards,setCards]=useState(null);
  const [selected,setSelected]=useState(null);
  const [draft,setDraft]=useState(blank);
  const [original,setOriginal]=useState(blank);
  const [filter,setFilter]=useState("all");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(true);
  const dirty=JSON.stringify(draft)!==JSON.stringify(original);
  useEffect(()=>{
    onUnsavedChange?.(dirty);
    return()=>onUnsavedChange?.(false);
  },[dirty,onUnsavedChange]);
  const load=useCallback(async()=>{
    setError("");setLoading(true);
    try{
      const data=await adminRequest("/admin/promos");
      if(!Array.isArray(data))throw Error("Invalid list");
      setCards(data);
    }catch{
      setError("Could not load saved promo cards. No changes were made.");
    }finally{setLoading(false);}
  },[adminRequest]);
  useEffect(()=>{void load();},[load]);

  function choose(card){
    if(busy)return;
    if(dirty&&!window.confirm("Discard unsaved promo changes?"))return;
    const next=card?editable(card):blank();
    setSelected(card?.id??null);
    setDraft(next);setOriginal(next);setNotice("");setError("");
  }
  function change(key,value){
    setDraft(old=>{
      const next={...old,[key]:value};
      if(key==="category"&&value==="refinement")next.side="right";
      return next;
    });
  }
  async function save(event){
    event.preventDefault();
    if(busy)return;
    const card=validatePromoCard(draft);
    if(!card){setError("Enter a title, description, and a safe URL (or leave the URL blank).");return;}
    setBusy(true);setError("");setNotice("");
    try{
      const method=selected===null?"POST":"PUT";
      const path=selected===null?"/admin/promos":"/admin/promos/"+selected;
      const updated=await adminRequest(path,method,{card});
      if(!Array.isArray(updated))throw Error("Invalid result");
      setCards(updated);
      // For newly created cards, the title is enough to find the new row
      // because the admin response is ordered and IDs are server-generated.
      const saved=selected===null?
        updated.reduce((best,x)=>!best||x.id>best.id?x:best,null):
        updated.find(x=>x.id===selected);
      if(saved){setSelected(saved.id);setDraft(editable(saved));setOriginal(editable(saved));}
      window.dispatchEvent(new Event("ogc-promos-updated"));
      setNotice(method==="POST"?"Promo created and visible in the site rotation.":"Promo updated on the live site.");
    }catch{
      setError("Saving failed. The previous card remains in place.");
    }finally{setBusy(false);}
  }
  async function remove(){
    if(selected===null||busy)return;
    const card=cards?.find(x=>x.id===selected);
    if(!card||!window.confirm('Permanently delete "'+card.title+'"? This removes it from the site.'))return;
    setBusy(true);setError("");setNotice("");
    try{
      const updated=await adminRequest("/admin/promos/"+selected,"DELETE");
      if(!Array.isArray(updated))throw Error("Invalid result");
      setCards(updated);setSelected(null);
      const next=blank();setDraft(next);setOriginal(next);
      window.dispatchEvent(new Event("ogc-promos-updated"));
      setNotice("Promo deleted. It will no longer appear in the outer columns.");
    }catch{setError("Deletion failed. The promo was not confirmed deleted.");}
    finally{setBusy(false);}
  }

  const grouped=useMemo(()=>Array.isArray(cards)?cards.filter(card=>
    filter==="all"||filter===card.category):[],[cards,filter]);
  const preview=resolvePromoUrl(draft.url,"example-profile");
  const possibleError=draft.url&&!preview?"Enter a safe HTTPS URL or a same-site path starting with /.":null;
  return <section className="ogcl-admin-promos" aria-label="Promotion cards manager">
    <header className="ogcl-admin-promos-head">
      <div>
        <h2>Promos</h2>
        <p>Manage the cards in both outer columns. Saved changes take effect immediately;
          cards are drawn at random from the eligible pool.</p>
      </div>
      <button type="button" className="ogcl-button" disabled={busy||loading}
        onClick={()=>choose(null)}>+ New promo</button>
    </header>
    {notice&&<p className="ogcl-save-confirmation" role="status">{notice}</p>}
    {error&&<p className="ogcl-error" role="alert">{error}</p>}
    {loading&&<p role="status">Loading saved cards…</p>}
    <div className="ogcl-admin-promos-grid">
      <section className="ogcl-admin-promos-list" aria-label="Saved promo cards">
        <div className="ogcl-admin-promos-list-header">
          <strong>{cards?.length??0} saved cards</strong>
          <label>Show <select value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="all">All</option><option value="editorial">General cards</option>
            <option value="refinement">Profile refinements</option>
          </select></label>
        </div>
        {grouped.map(card=><button type="button" key={card.id}
          aria-current={selected===card.id?"true":undefined}
          className={"ogcl-admin-promos-list-item"+(selected===card.id?" selected":"")}
          disabled={busy} onClick={()=>choose(card)}>
          <strong>{card.title}</strong>
          <span>{groupLabel(card.category)} · {card.side==="both"?"Both columns":card.side+" column"}
            {!card.enabled&&" · Hidden"}</span>
          <small>{card.body}</small>
        </button>)}
        {!loading&&cards&&grouped.length===0&&<p className="ogcl-admin-muted">No cards in this category.</p>}
      </section>
      <section className="ogcl-admin-promos-form-panel">
        <h3>{selected===null?"Create a promo":'Edit "'+(cards?.find(x=>x.id===selected)?.title||"Promo")+'"'}</h3>
        <form className="ogcl-admin-promos-form" onSubmit={e=>void save(e)}>
          <label>Card title
            <input type="text" required maxLength={120} value={draft.title}
              onChange={e=>change("title",e.target.value)} placeholder="A short headline"/>
          </label>
          <label>Card text
            <textarea required maxLength={500} rows={4} value={draft.body}
              onChange={e=>change("body",e.target.value)}
              placeholder="The text shown below the headline"/>
          </label>
          <label>URL (optional)
            <input type="text" maxLength={2048} value={draft.url}
              onChange={e=>change("url",e.target.value)}
              placeholder="https://example.com or /matches"
              aria-describedby="ogcl-promos-url-help"/>
          </label>
          <small id="ogcl-promos-url-help" className="ogcl-admin-muted">
            Add a URL to make the entire card's title and text a link.
            Use HTTPS for outside websites or /matches for OG Cupid pages.
            Existing profile-specific links use /profiles/{"{slug}"}.
            Leave empty for a card with no link.
          </small>
          {possibleError&&<small role="alert" className="ogcl-error">{possibleError}</small>}
          <div className="ogcl-admin-promos-form-row">
            <label>Card type
              <select value={draft.category} onChange={e=>change("category",e.target.value)}>
                <option value="editorial">General promotion</option>
                <option value="refinement">Profile refinement</option>
              </select>
            </label>
            <label>Placement
              <select value={draft.side} disabled={draft.category==="refinement"}
                onChange={e=>change("side",e.target.value)}>
                <option value="left">Left column</option>
                <option value="right">Right column</option>
                {draft.category==="editorial"&&<option value="both">Either column</option>}
              </select>
            </label>
          </div>
          <label className="ogcl-admin-promos-checkbox">
            <input type="checkbox" checked={draft.enabled}
              onChange={e=>change("enabled",e.target.checked)}/>
            Enabled (eligible to appear on the live site)
          </label>
          <div className="ogcl-admin-promos-preview" aria-label="Card preview">
            <strong>{draft.title||"Your card title"}</strong>
            <span>{draft.body||"Your card text"}</span>
            {preview&&<small>🔗 {preview.to}</small>}
          </div>
          <div className="ogcl-admin-promos-actions">
            <button className="ogcl-button" type="submit"
              disabled={busy||loading||!validatePromoCard(draft)||!dirty}>
              {busy?"Saving…":selected===null?"Create promo":"Save changes"}
            </button>
            <button className="ogcl-button ogcl-secondary" type="button"
              disabled={busy||!dirty} onClick={()=>{setDraft({...original});setError("");}}>Discard changes</button>
            {selected!==null&&<button className="ogcl-admin-promos-delete" type="button"
              disabled={busy} onClick={()=>void remove()}>Delete promo</button>}
          </div>
        </form>
      </section>
    </div>
  </section>;
}
