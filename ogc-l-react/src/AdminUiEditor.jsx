import React,{useCallback,useEffect,useMemo,useRef,useState} from "react";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {
  blankEditorDraft,sanitizeEditorDraft,editorPreviewCss,
  moveEditorBlock,editorBlockHtmlLabel,EDITOR_PAGES,EDITOR_AREAS,
  EDITOR_TOKENS,EDITOR_BLOCK_TYPES,EDITOR_PROPERTIES
} from "./admin-ui-editor-model.mjs";
import "./admin-ui-editor.css";

// An administrator-only workspace. Its drafts live in the current browser;
// publishing for all members requires a separate server-authorized release path.
const storageKey=id=>"ogc-admin-ui-editor-v1:"+id;
const recordKey=id=>storageKey(id)+":history";
function readStored(key,fallback){
  try{return JSON.parse(window.localStorage.getItem(key))??fallback;}
  catch{return fallback;}
}
function newBlock(type){
  return {id:"block-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8),
    type,text:type==="heading"?"New heading":type==="button"?"Button label":
      type==="divider"?"":"New page content",hidden:false,style:{}};
}
function previewBlock(doc,block,selected){
  const tag={heading:"h2",paragraph:"p",notice:"div",divider:"hr",button:"button"}[block.type]||"p";
  const element=doc.createElement(tag);
  element.setAttribute("data-ogc-editor-block-id",block.id);
  element.className="ogcl-editor-preview-block ogcl-editor-preview-"+block.type;
  if(tag==="button")element.type="button";
  if(tag!=="hr")element.textContent=block.text;
  for(const [key,value] of Object.entries(block.style))element.style[key]=
    typeof value==="number"?value+"px":value;
  if(selected?.kind==="block"&&selected.id===block.id)element.classList.add("ogcl-editor-preview-selected");
  return element;
}
const EDITOR_OVERLAY_STYLE=[
  ".ogcl-editor-preview-block{position:relative;}",
  ".ogcl-editor-preview-block:hover{outline:2px dashed #f83265!important;outline-offset:2px;cursor:crosshair;}",
  ".ogcl-editor-preview-selected,[data-ogc-editor-selected]{outline:3px solid #f83265!important;outline-offset:2px;}",
  ".ogcl-editor-preview-region{display:grid;gap:10px;padding:12px 18px;border-bottom:1px dashed #b7c9da;}",
  ".ogcl-editor-preview-notice{background:#e7eef5;border:1px solid #c2d4e6;padding:12px;}",
  ".ogcl-editor-preview-button{justify-self:start;background:#2963a4;color:white;border:0;padding:8px 16px;}",
  ".ogcl-editor-preview-divider{width:100%;border:0;border-top:1px solid #c2d4e6;}",
  ".ogcl-editor-preview-region:empty{display:none;}"
].join("\n");
function putPreview(doc,draft,page,selected){
  let css=doc.getElementById("ogcl-admin-ui-editor-css");
  if(!css){css=doc.createElement("style");css.id="ogcl-admin-ui-editor-css";doc.head.appendChild(css);}
  const nextCss=editorPreviewCss(draft,page)+"\n"+EDITOR_OVERLAY_STYLE;
  if(css.textContent!==nextCss)css.textContent=nextCss;

  let region=doc.querySelector("[data-ogc-editor-region]");
  const view=doc.querySelector(".ogcl-view");
  if(view&&!region){
    region=doc.createElement("section");region.className="ogcl-editor-preview-region";
    region.setAttribute("data-ogc-editor-region","true");
    const header=view.querySelector(".ogcl-view-head");
    if(header)header.insertAdjacentElement("afterend",region);
    else view.prepend(region);
  }
  if(region){
    const blocks=(draft.pages[page]||[]).filter(b=>!b.hidden);
    const signature=JSON.stringify(blocks);
    if(region.dataset.snapshot!==signature){
      region.replaceChildren(...blocks.map(b=>previewBlock(doc,b,selected)));
      region.dataset.snapshot=signature;
    }
    region.querySelectorAll(".ogcl-editor-preview-selected").forEach(el=>el.classList.remove("ogcl-editor-preview-selected"));
    if(selected?.kind==="block")
      [...region.querySelectorAll("[data-ogc-editor-block-id]")].find(el=>
        el.getAttribute("data-ogc-editor-block-id")===selected.id
      )?.classList.add("ogcl-editor-preview-selected");
  }
  doc.querySelectorAll("[data-ogc-editor-selected]").forEach(el=>el.removeAttribute("data-ogc-editor-selected"));
  if(selected?.kind==="area"){
    const selector=EDITOR_AREAS.find(area=>area.id===selected.id)?.selector;
    if(selector)doc.querySelectorAll(selector).forEach(el=>el.setAttribute("data-ogc-editor-selected","true"));
  }
}
export default function AdminUiEditor(){
  const {user}=useMemberSession();
  const [page,setPage]=useState("/matches");
  const [draft,setDraft]=useState(()=>blankEditorDraft());
  const [savedText,setSavedText]=useState("");
  const [notice,setNotice]=useState("");
  const [selected,setSelected]=useState({kind:"area",id:"pageHeader"});
  const [scope,setScope]=useState("page");
  const [frameVersion,setFrameVersion]=useState(0);
  const [zoomMode,setZoomMode]=useState("fit");
  const [scale,setScale]=useState(.64);
  const [addType,setAddType]=useState("paragraph");
  const [history,setHistory]=useState([]);
  const [dragId,setDragId]=useState(null);
  const [compact,setCompact]=useState(false);
  const frame=useRef(null),stage=useRef(null);
  const undoStack=useRef([]),redoStack=useRef([]);
  const commit=useCallback(update=>{
    setDraft(previous=>{
      const edited=sanitizeEditorDraft(update(JSON.parse(JSON.stringify(previous))));
      if(JSON.stringify(edited)===JSON.stringify(previous))return previous;
      undoStack.current=[...undoStack.current.slice(-39),previous];
      redoStack.current=[];
      return edited;
    });
    setNotice("");
  },[]);
  useEffect(()=>{
    if(!user?.id)return;
    const loaded=sanitizeEditorDraft(readStored(storageKey(user.id),blankEditorDraft()));
    setDraft(loaded);
    setSavedText(JSON.stringify(loaded));
    setHistory(readStored(recordKey(user.id),[]).slice(0,10));
    undoStack.current=[];redoStack.current=[];
  },[user?.id]);
  const hasChanges=JSON.stringify(draft)!==savedText;
  const previewUrl=useMemo(()=>
    window.location.pathname+window.location.search+"#"+page,[page]);
  useEffect(()=>{
    const resize=()=>{
      if(!stage.current)return;
      const fit=Math.min(1,Math.max(.2,(stage.current.clientWidth-24)/1150));
      setScale(zoomMode==="fit"?fit:zoomMode==="100"?1:.75);
    };
    resize();
    const observer=typeof ResizeObserver==="function"?new ResizeObserver(resize):null;
    if(observer&&stage.current)observer.observe(stage.current);
    window.addEventListener("resize",resize);
    return()=>{observer?.disconnect();window.removeEventListener("resize",resize);};
  },[zoomMode,compact]);
  useEffect(()=>{
    const doc=frame.current?.contentDocument;
    if(!doc)return;
    const intercept=event=>{
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
      const target=event.target;
      if(!(target instanceof doc.defaultView.Element))return;
      const block=target.closest("[data-ogc-editor-block-id]");
      if(block){setSelected({kind:"block",id:block.getAttribute("data-ogc-editor-block-id")});return;}
      for(let parent=target;parent&&parent.nodeType===1;parent=parent.parentElement){
        const area=EDITOR_AREAS.find(a=>parent.matches(a.selector));
        if(area){setSelected({kind:"area",id:area.id});return;}
      }
    };
    const prevent=event=>{event.preventDefault();event.stopImmediatePropagation?.();};
    doc.addEventListener("click",intercept,true);
    doc.addEventListener("submit",prevent,true);
    return()=>{
      doc.removeEventListener("click",intercept,true);
      doc.removeEventListener("submit",prevent,true);
    };
  },[frameVersion,page]);
  useEffect(()=>{
    const doc=frame.current?.contentDocument;
    if(!doc)return;
    const render=()=>{
      try{
        if(doc.querySelector(".ogcl-view"))putPreview(doc,draft,page,selected);
      }catch{ /* Preview may be remounting while route loads. */ }
    };
    render();
    const interval=window.setInterval(render,350);
    return()=>window.clearInterval(interval);
  },[draft,page,selected,frameVersion]);
  const blocks=draft.pages[page]||[];
  const chosenBlock=selected.kind==="block"?blocks.find(b=>b.id===selected.id):null;
  const chosenArea=selected.kind==="area"?EDITOR_AREAS.find(a=>a.id===selected.id):null;
  const areaScope=scope==="global"?"*":page;
  const activeStyle=chosenBlock?.style||draft.areas[areaScope]?.[selected.id]||{};
  const updateArea=(property,value)=>commit(next=>{
    const target=selected.kind==="block"?
      next.pages[page]?.find(b=>b.id===selected.id)?.style:
      (next.areas[areaScope]??={})[selected.id]??={};
    if(!target)return next;
    if(value===null||value==="")delete target[property];
    else target[property]=value;
    return next;
  });
  const updateBlock=(id,patch)=>commit(next=>{
    const item=next.pages[page]?.find(b=>b.id===id);
    if(item)Object.assign(item,patch);
    return next;
  });
  function addBlock(){
    const block=newBlock(addType);
    commit(next=>{(next.pages[page]??=[]).push(block);return next;});
    setSelected({kind:"block",id:block.id});
  }
  function removeBlock(id){
    commit(next=>{next.pages[page]=(next.pages[page]||[]).filter(b=>b.id!==id);return next;});
    setSelected({kind:"area",id:"mainContent"});
  }
  function moveBlock(id,to){
    commit(next=>{
      const old=next.pages[page]||[];
      const from=old.findIndex(b=>b.id===id);
      next.pages[page]=moveEditorBlock(old,from,to);
      return next;
    });
  }
  function undo(){
    const prior=undoStack.current.pop();
    if(!prior)return;
    redoStack.current.push(draft);setDraft(prior);setNotice("");
  }
  function redo(){
    const next=redoStack.current.pop();
    if(!next)return;
    undoStack.current.push(draft);setDraft(next);setNotice("");
  }
  function save(){
    if(!user?.id)return;
    try{
      const value=sanitizeEditorDraft(draft);
      window.localStorage.setItem(storageKey(user.id),JSON.stringify(value));
      const records=[{at:new Date().toISOString(),draft:value},...history].slice(0,10);
      window.localStorage.setItem(recordKey(user.id),JSON.stringify(records));
      setHistory(records);setSavedText(JSON.stringify(value));
      setNotice("Draft saved to this browser only. The public site has not changed.");
    }catch{setNotice("Couldn't save the draft in this browser. Check your storage settings.");}
  }
  function restore(index){
    const entry=history[index];
    if(!entry)return;
    commit(()=>entry.draft);
    setNotice("Snapshot loaded as an unsaved draft.");
  }
  return <section className="ogcl-ui-editor" aria-label="Visual UI Editor">
    <header className="ogcl-ui-editor-intro">
      <div><h2>Visual UI Editor</h2>
        <p>Edit supported regions on a real, interactive preview. The permanent left, center and right columns are locked.</p></div>
      <span className="ogcl-ui-draft-label">LOCAL DRAFT · NOT PUBLISHED</span>
    </header>
    <div className="ogcl-ui-editor-toolbar">
      <label>Preview page
        <select value={page} onChange={e=>{setPage(e.target.value);setSelected({kind:"area",id:"pageHeader"});}}>
          {EDITOR_PAGES.map(item=><option key={item.path} value={item.path}>{item.label}</option>)}
        </select>
      </label>
      <label>Zoom
        <select value={zoomMode} onChange={e=>setZoomMode(e.target.value)}>
          <option value="fit">Fit</option><option value="75">75%</option><option value="100">100%</option>
        </select>
      </label>
      <button type="button" onClick={()=>setCompact(v=>!v)}>{compact?"Show inspector":"Larger preview"}</button>
      <button type="button" onClick={undo} disabled={!undoStack.current.length}>Undo</button>
      <button type="button" onClick={redo} disabled={!redoStack.current.length}>Redo</button>
      <button className="ogcl-button" type="button" onClick={save} disabled={!hasChanges}>Save draft</button>
    </div>
    <div className={"ogcl-ui-editor-grid"+(compact?" is-compact":"")}>
      {!compact&&<aside className="ogcl-ui-editor-panel" aria-label="Page structure">
        <h3>Page structure</h3>
        <p className="ogcl-admin-muted">Click an area in the preview or pick it here.</p>
        <p className="ogcl-ui-editor-panel-caption">Fixed site regions</p>
        <div className="ogcl-ui-editor-elements">
          {EDITOR_AREAS.map(area=><button key={area.id} type="button"
            className={selected.kind==="area"&&selected.id===area.id?"selected":""}
            onClick={()=>setSelected({kind:"area",id:area.id})}>{area.label}</button>)}
        </div>
        <p className="ogcl-ui-editor-panel-caption">Added blocks · {blocks.length}/24</p>
        <ol className="ogcl-ui-editor-block-list">
          {blocks.map((block,index)=><li key={block.id} draggable
            onDragStart={()=>setDragId(block.id)}
            onDragOver={event=>event.preventDefault()}
            onDrop={event=>{event.preventDefault();if(dragId)moveBlock(dragId,index);setDragId(null);}}
            onDragEnd={()=>setDragId(null)}>
            <button type="button" className={selected.kind==="block"&&selected.id===block.id?"selected":""}
              onClick={()=>setSelected({kind:"block",id:block.id})}>
              <span aria-hidden="true">⠿</span> {editorBlockHtmlLabel(block)}{block.hidden?" (hidden)":""}
            </button>
            <div className="ogcl-ui-editor-reorder">
              <button type="button" disabled={!index} title="Move up" onClick={()=>moveBlock(block.id,index-1)}>↑</button>
              <button type="button" disabled={index===blocks.length-1} title="Move down" onClick={()=>moveBlock(block.id,index+1)}>↓</button>
              <button type="button" title="Remove this added block" onClick={()=>removeBlock(block.id)}>×</button>
            </div>
          </li>)}
        </ol>
        <div className="ogcl-ui-editor-add">
          <select value={addType} onChange={e=>setAddType(e.target.value)}
            aria-label="New block type">
            {EDITOR_BLOCK_TYPES.map(block=><option key={block.type} value={block.type}>{block.label}</option>)}
          </select>
          <button type="button" disabled={blocks.length>=24} onClick={addBlock}>+ Add block</button>
        </div>
        <p className="ogcl-admin-muted">Drag the added blocks to reorder, or use the arrow buttons.</p>
      </aside>}
      <div className="ogcl-ui-editor-stage-wrap">
        <p className="ogcl-ui-editor-panel-caption">Live page preview · click to select · links and forms disabled</p>
        <div className="ogcl-ui-editor-stage" ref={stage}>
          <div className="ogcl-ui-editor-frame-viewport"
            style={{width:1150*scale,height:850*scale}}>
            <iframe ref={frame} key={page} title={"OG Cupid "+page+" editor preview"}
              src={previewUrl} onLoad={()=>setFrameVersion(v=>v+1)}
              style={{width:1150,height:850,transform:"scale("+scale+")",transformOrigin:"top left"}}
              tabIndex={-1}/>
          </div>
        </div>
      </div>
      {!compact&&<aside className="ogcl-ui-editor-panel" aria-label="Selected element properties">
        <h3>Properties</h3>
        <p className="ogcl-ui-editor-selection">{chosenBlock?
          editorBlockHtmlLabel(chosenBlock):chosenArea?.label||"Choose an element"}</p>
        {chosenArea&&<label>Apply to
          <select value={scope} onChange={e=>setScope(e.target.value)}>
            <option value="page">This page only</option>
            <option value="global">All pages</option>
          </select>
        </label>}
        {chosenBlock&&<>
          {chosenBlock.type!=="divider"&&<label>Text
            <textarea rows={4} maxLength={500} value={chosenBlock.text}
              onChange={e=>updateBlock(chosenBlock.id,{text:e.target.value})}/>
          </label>}
          <label className="ogcl-ui-editor-check"><input type="checkbox" checked={chosenBlock.hidden}
            onChange={e=>updateBlock(chosenBlock.id,{hidden:e.target.checked})}/> Hide block in preview</label>
        </>}
        {(chosenBlock||chosenArea)&&<div className="ogcl-ui-editor-properties">
          {EDITOR_PROPERTIES.map(property=><label key={property.key}>{property.label}
            <div className="ogcl-ui-editor-property">
              <input type={property.kind==="color"?"color":"number"}
                min={property.kind==="number"?0:undefined}
                max={property.kind==="number"?property.max:undefined}
                placeholder={property.kind==="number"?"Default":undefined}
                value={property.kind==="color"?(activeStyle[property.key]||"#ffffff"):(activeStyle[property.key]??"")}
                onChange={e=>updateArea(property.key,property.kind==="color"?e.target.value:
                  e.target.value===""?null:Number(e.target.value))}/>
              <button type="button" title={"Reset "+property.label} onClick={()=>updateArea(property.key,null)}>↺</button>
            </div>
          </label>)}
        </div>}
        <h3>Global palette</h3>
        <p className="ogcl-admin-muted">Changes here affect all previewed pages.</p>
        <div className="ogcl-ui-editor-properties">
          {EDITOR_TOKENS.map(token=><label key={token.id}>{token.label}
            <div className="ogcl-ui-editor-property">
              <input type="color" value={draft.tokens[token.id]||"#2963a4"}
                onChange={e=>commit(next=>{next.tokens[token.id]=e.target.value;return next;})}/>
              <button type="button" title={"Reset "+token.label}
                onClick={()=>commit(next=>{delete next.tokens[token.id];return next;})}>↺</button>
            </div>
          </label>)}
        </div>
      </aside>}
    </div>
    <footer className="ogcl-ui-editor-footer">
      <strong>{hasChanges?"Unsaved draft changes":"Draft up to date"}</strong>
      <span>Preview and saved drafts are private to this browser. Publishing to all visitors is not enabled yet.</span>
      <label>Saved snapshots
        <select value="" onChange={e=>restore(Number(e.target.value))}>
          <option value="">Restore a snapshot…</option>
          {history.map((h,i)=><option key={i} value={i}>{new Date(h.at).toLocaleString()}</option>)}
        </select>
      </label>
    </footer>
    {notice&&<p role="status" className="ogcl-ui-editor-notice">{notice}</p>}
  </section>;
}
