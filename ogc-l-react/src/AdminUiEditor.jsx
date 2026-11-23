import React,{useCallback,useEffect,useMemo,useRef,useState} from "react";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {
  blankEditorDraft,sanitizeEditorDraft,editorPreviewCss,
  moveEditorBlock,editorBlockHtmlLabel,EDITOR_PAGES,EDITOR_AREAS,
  EDITOR_SHELL_AREAS,EDITOR_PAGE_AREAS,EDITOR_SCHEMA,editorAreaScope,
  EDITOR_TOKENS,EDITOR_BLOCK_TYPES,EDITOR_PROPERTIES,
  EDITOR_VIEWPORTS,EDITOR_TEXT_TARGETS,EDITOR_LINK_ROUTES,editorTextTarget
} from "./admin-ui-editor-model.mjs";
import {computedEditorSnapshot} from "./admin-ui-editor-inspector.mjs";
import "./admin-ui-editor.css";

// Administrator-only design editor: server drafts are authoritative.
// Local snapshots remain only as a recoverable backup for existing users.
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
  element.draggable=true;
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
  "[data-ogc-edit-text]:hover{outline:2px dashed #f83265!important;outline-offset:2px;cursor:text;}",
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
  // Apply draft text ONLY to known static labels. Preserve original text so
  // Reset returns the preview to React's source copy; never use innerHTML.
  for(const target of EDITOR_TEXT_TARGETS){
    if(!editorTextTarget(target.id,page))continue;
    const element=doc.querySelector(target.selector);
    if(!element || element.children.length)continue;
    if(!element.hasAttribute("data-ogc-editor-original-text"))
      element.setAttribute("data-ogc-editor-original-text",element.textContent||"");
    if(target.scope==="page")element.setAttribute("data-ogc-edit-text",target.id);
    const scope=target.scope==="shell"?"*":page;
    const chosen=draft.texts[scope]?.[target.id];
    const text=chosen??element.getAttribute("data-ogc-editor-original-text");
    if(element.textContent!==text)element.textContent=text;
  }
  doc.querySelectorAll("[data-ogc-editor-selected]").forEach(el=>el.removeAttribute("data-ogc-editor-selected"));
  if(selected?.kind==="text"){
    const target=editorTextTarget(selected.id,page);
    if(target)doc.querySelector(target.selector)?.setAttribute("data-ogc-editor-selected","true");
  }
  if(selected?.kind==="area"){
    const selector=EDITOR_AREAS.find(area=>area.id===selected.id)?.selector;
    if(selector)doc.querySelectorAll(selector).forEach(el=>el.setAttribute("data-ogc-editor-selected","true"));
  }
}
export default function AdminUiEditor(){
  const {user,adminRequest}=useMemberSession();
  const [page,setPage]=useState("/matches");
  const [workspace,setWorkspace]=useState("shell");
  const [draft,setDraft]=useState(()=>blankEditorDraft());
  const [savedText,setSavedText]=useState("");
  const [notice,setNotice]=useState("");
  const [selected,setSelected]=useState({kind:"area",id:"brand"});
  const [frameVersion,setFrameVersion]=useState(0);
  const [zoomMode,setZoomMode]=useState("fit");
  const [viewportId,setViewportId]=useState("editor");
  const viewport=EDITOR_VIEWPORTS.find(x=>x.id===viewportId)||EDITOR_VIEWPORTS[0];
  const [scale,setScale]=useState(.64);
  const [inspected,setInspected]=useState({values:{},text:"",tokens:{}});
  const [availableText,setAvailableText]=useState([]);
  const [addType,setAddType]=useState("paragraph");
  const [history,setHistory]=useState([]);
  const [serverVersion,setServerVersion]=useState(null);
  const [publishedRevision,setPublishedRevision]=useState(null);
  const [publishedHistory,setPublishedHistory]=useState([]);
  const [rollbackId,setRollbackId]=useState("");
  const [busy,setBusy]=useState(false);
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
    const original=readStored(storageKey(user.id),blankEditorDraft());
    const loaded=sanitizeEditorDraft(original);
    if(original?.version===1){
      // The original draft is retained intact. Page-specific attempts to
      // restyle shared rails cannot safely be promoted to sitewide styles.
      try{
        const backup=storageKey(user.id)+":before-shell-split";
        if(window.localStorage.getItem(backup)===null)
          window.localStorage.setItem(backup,JSON.stringify(original));
        window.localStorage.setItem(storageKey(user.id),JSON.stringify(loaded));
        setNotice("Earlier draft upgraded. The original was backed up; page-specific outer-column styling was not promoted sitewide.");
      }catch{setNotice("Earlier draft loaded in memory; browser storage did not allow migration.");}
    }
    setDraft(loaded);
    setSavedText(JSON.stringify(loaded));
    const savedRecords=readStored(recordKey(user.id),[]);
    setHistory(Array.isArray(savedRecords)?savedRecords.slice(0,10)
      .filter(entry=>entry&&typeof entry.at==="string"&&[1,EDITOR_SCHEMA].includes(entry.draft?.version))
      .map(entry=>({...entry,draft:sanitizeEditorDraft(entry.draft)})):[]);
    undoStack.current=[];redoStack.current=[];
  },[user?.id]);
  const hasChanges=JSON.stringify(draft)!==savedText;
  useEffect(()=>{
    if(!user?.id)return;
    let live=true;
    setServerVersion(null);
    void adminRequest("/admin/ui-design").then(state=>{
      if(!live)return;
      setServerVersion(state.draftVersion);
      setPublishedRevision(state.publishedRevision??null);
      setPublishedHistory(Array.isArray(state.history)?state.history:[]);
      const fromServer=sanitizeEditorDraft(state.draft);
      const local=sanitizeEditorDraft(readStored(storageKey(user.id),blankEditorDraft()));
      const localHasEdits=JSON.stringify(local)!==JSON.stringify(blankEditorDraft());
      // Migrate an older browser-only draft once when no remote draft exists.
      // Never replace a newer server draft with browser storage.
      if(state.draftVersion===0&&localHasEdits){
        setDraft(local);
        setSavedText(JSON.stringify(fromServer));
        setNotice("Your earlier browser draft is ready to import. Choose Save draft to store it on the server.");
      }else{
        setDraft(fromServer);
        setSavedText(JSON.stringify(fromServer));
        setNotice("Server draft loaded. Changes are private until you publish.");
      }
      undoStack.current=[];redoStack.current=[];
    }).catch(()=>{
      if(live)setNotice("Could not load your server draft. Publishing is unavailable; your browser backup is untouched.");
    });
    return()=>{live=false;};
  },[user?.id,adminRequest]);
  const previewUrl=useMemo(()=>{
    const search=new URLSearchParams(window.location.search);
    search.set("ogc-ui-preview","1");
    return window.location.pathname+"?"+search.toString()+"#"+page;
  },[page]);
  useEffect(()=>{
    const resize=()=>{
      if(!stage.current)return;
      const fit=Math.min(1,Math.max(.05,(stage.current.clientWidth-24)/viewport.width));
      setScale(zoomMode==="fit"?fit:zoomMode==="100"?1:zoomMode==="50"?.5:.75);
    };
    resize();
    const observer=typeof ResizeObserver==="function"?new ResizeObserver(resize):null;
    if(observer&&stage.current)observer.observe(stage.current);
    window.addEventListener("resize",resize);
    return()=>{observer?.disconnect();window.removeEventListener("resize",resize);};
  },[zoomMode,compact,viewport.width]);
  useEffect(()=>{
    const doc=frame.current?.contentDocument;
    if(!doc)return;
    const intercept=event=>{
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
      const target=event.target;
      if(!(target instanceof doc.defaultView.Element))return;
      const block=target.closest("[data-ogc-editor-block-id]");
      if(block){
        setWorkspace("page");
        setSelected({kind:"block",id:block.getAttribute("data-ogc-editor-block-id")});
        return;
      }
      const textElement=target.closest("[data-ogc-edit-text]");
      const textId=textElement?.getAttribute("data-ogc-edit-text");
      const textTarget=editorTextTarget(textId,page);
      if(textTarget){
        setWorkspace(textTarget.scope);
        setSelected({kind:"text",id:textTarget.id});
        return;
      }
      for(let parent=target;parent&&parent.nodeType===1;parent=parent.parentElement){
        // A click on a rail, header bar or footer changes the editor to the
        // Site Shell workspace. It can never become a per-page style.
        const area=EDITOR_AREAS.find(a=>parent.matches(a.selector));
        if(area){
          setWorkspace(editorAreaScope(area.id));
          setSelected({kind:"area",id:area.id});
          return;
        }
      }
    };
    const prevent=event=>{event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();};
    const previewDragStart=event=>{
      const element=event.target?.closest?.("[data-ogc-editor-block-id]");
      if(!element){prevent(event);return;}
      const id=element.getAttribute("data-ogc-editor-block-id");
      if(event.dataTransfer)event.dataTransfer.setData("text/plain",id);
      if(event.dataTransfer)event.dataTransfer.effectAllowed="move";
    };
    const previewDragOver=event=>{
      if(event.target?.closest?.("[data-ogc-editor-block-id]"))event.preventDefault();
    };
    const previewDrop=event=>{
      const target=event.target?.closest?.("[data-ogc-editor-block-id]");
      const source=event.dataTransfer?.getData("text/plain");
      prevent(event);
      if(target&&source){
        setDraft(previous=>{
          const next=JSON.parse(JSON.stringify(previous));
          const list=next.pages[page]||[];
          const start=list.findIndex(block=>block.id===source);
          const end=list.findIndex(block=>block.id===target.getAttribute("data-ogc-editor-block-id"));
          if(start<0||end<0||start===end)return previous;
          undoStack.current=[...undoStack.current.slice(-39),previous];
          redoStack.current=[];
          next.pages[page]=moveEditorBlock(list,start,end);
          return sanitizeEditorDraft(next);
        });
      }
    };
    doc.addEventListener("click",intercept,true);
    for(const type of ["submit","change","input","keydown"])doc.addEventListener(type,prevent,true);
    doc.addEventListener("dragstart",previewDragStart,true);
    doc.addEventListener("dragover",previewDragOver,true);
    doc.addEventListener("drop",previewDrop,true);
    return()=>{
      doc.removeEventListener("click",intercept,true);
      for(const type of ["submit","change","input","keydown"])doc.removeEventListener(type,prevent,true);
      doc.removeEventListener("dragstart",previewDragStart,true);
      doc.removeEventListener("dragover",previewDragOver,true);
      doc.removeEventListener("drop",previewDrop,true);
    };
  },[frameVersion,page]);
  useEffect(()=>{
    const doc=frame.current?.contentDocument;
    if(!doc)return;
    const render=()=>{
      try{
        if(!doc.querySelector(".ogcl-view"))return;
        putPreview(doc,draft,page,selected);
        const selector=selected.kind==="block"?
          '[data-ogc-editor-block-id="'+selected.id+'"]':
          selected.kind==="text"?editorTextTarget(selected.id,page)?.selector:
          EDITOR_AREAS.find(area=>area.id===selected.id)?.selector;
        const element=selector?doc.querySelector(selector):null;
        const values=element?computedEditorSnapshot(doc.defaultView.getComputedStyle(element),
          EDITOR_PROPERTIES):{};
        const text=selected.kind==="text"?
          element?.getAttribute("data-ogc-editor-original-text")||"":"";
        const tokens=Object.fromEntries(EDITOR_TOKENS.map(token=>[
          token.id,doc.defaultView.getComputedStyle(doc.documentElement)
            .getPropertyValue(token.id).trim()||token.default
        ]));
        setInspected(previous=>{
          const next={values,text,tokens};
          return JSON.stringify(previous)===JSON.stringify(next)?previous:next;
        });
        const available=EDITOR_TEXT_TARGETS.filter(t=>editorTextTarget(t.id,page)&&
          [...doc.querySelectorAll(t.selector)].some(el=>!el.children.length))
          .map(t=>t.id);
        setAvailableText(prev=>JSON.stringify(prev)===JSON.stringify(available)?prev:available);
      }catch{ /* Preview may be remounting while route loads. */ }
    };
    render();
    const interval=window.setInterval(render,350);
    return()=>window.clearInterval(interval);
  },[draft,page,selected,frameVersion]);
  const blocks=draft.pages[page]||[];
  const sharedGroups=[
    ["Site background & logo",["siteBackground","brand"]],
    ["Left column",["leftRail","mainNavigation","mainNavLinks","publicNavigation","leftPromos","leftEditorial"]],
    ["Top account links",["accountBar","accountLinks","accountActions"]],
    ["Right column",["rightRail","profileFloater","rightCard","rightEditorial"]],
    ["Center frame & legal footer",["centerSheet","legalFooter","footerLinks","footerLinkLabels"]]
  ];
  function chooseWorkspace(next){
    setWorkspace(next);
    setSelected({kind:"area",id:next==="shell"?"brand":"pageHeader"});
    setNotice("");
  }
  const chosenBlock=selected.kind==="block"?blocks.find(b=>b.id===selected.id):null;
  const chosenArea=selected.kind==="area"?EDITOR_AREAS.find(a=>a.id===selected.id):null;
  const chosenText=selected.kind==="text"?editorTextTarget(selected.id,page):null;
  const textScope=chosenText?.scope==="shell"?"*":page;
  const currentText=chosenText?
    draft.texts[textScope]?.[chosenText.id]??inspected.text:"";
  function updateText(value){
    if(!chosenText||chosenText.scope!==workspace)return;
    // Text only, no HTML editing or control characters.
    const cleaned=value.replace(/\s*\r?\n+\s*/g," ");
    commit(next=>{(next.texts[textScope]??={})[chosenText.id]=cleaned;return next;});
  }
  function resetText(){
    if(!chosenText)return;
    commit(next=>{if(next.texts[textScope])delete next.texts[textScope][chosenText.id];return next;});
  }
  function styleRelatedText(){
    if(!chosenText)return;
    const id=chosenText.scope==="page"?
      chosenText.id==="page.heading"?"pageTitle":"pageHeader":
      chosenText.id.startsWith("shell.footer.")?"footerLinkLabels":
      chosenText.id.startsWith("shell.account.")?"accountActions":
      chosenText.id.startsWith("shell.nav.")?"mainNavLinks":
      chosenText.id.startsWith("shell.public.")?"publicNavigation":
      chosenText.id.startsWith("shell.promo.left.")?"leftEditorial":
      chosenText.id.startsWith("shell.promo.right.")?"rightEditorial":"leftPromos";
    setSelected({kind:"area",id});
  }
  const areaScope=chosenArea&&editorAreaScope(chosenArea.id)==="shell"?"*":page;
  const activeStyle=chosenBlock?.style||draft.areas[areaScope]?.[selected.id]||{};
  const updateArea=(property,value)=>commit(next=>{
    const target=selected.kind==="block"&&workspace==="page"?
      next.pages[page]?.find(b=>b.id===selected.id)?.style:
      selected.kind==="area"&&editorAreaScope(selected.id)===workspace?
        ((next.areas[areaScope]??={})[selected.id]??={}):null;
    if(!target)return next;
    if(value===null||value==="")delete target[property];
    else target[property]=value;
    return next;
  });
  const updateBlock=(id,patch)=>commit(next=>{
    const item=workspace==="page"?next.pages[page]?.find(b=>b.id===id):null;
    if(item)Object.assign(item,patch);
    return next;
  });
  function addBlock(){
    if(workspace!=="page")return;
    const block=newBlock(addType);
    commit(next=>{(next.pages[page]??=[]).push(block);return next;});
    setSelected({kind:"block",id:block.id});
  }
  function removeBlock(id){
    if(workspace!=="page")return;
    commit(next=>{next.pages[page]=(next.pages[page]||[]).filter(b=>b.id!==id);return next;});
    setSelected({kind:"area",id:"mainContent"});
  }
  function moveBlock(id,to){
    if(workspace!=="page")return;
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
  function acceptServerState(state,replaceDraft=true){
    setServerVersion(state.draftVersion);
    setPublishedRevision(state.publishedRevision??null);
    setPublishedHistory(Array.isArray(state.history)?state.history:[]);
    if(replaceDraft){
      const clean=sanitizeEditorDraft(state.draft);
      setDraft(clean);
      setSavedText(JSON.stringify(clean));
      undoStack.current=[];redoStack.current=[];
    }
  }
  async function persistDraft(){
    if(serverVersion===null)throw new Error("Server draft is not ready.");
    const value=sanitizeEditorDraft(draft);
    const state=await adminRequest("/admin/ui-design","PUT",
      {document:value,expectedVersion:serverVersion});
    acceptServerState(state,false);
    setSavedText(JSON.stringify(value));
    // Browser snapshots are backups only. The server owns the latest draft.
    try{
      window.localStorage.setItem(storageKey(user.id),JSON.stringify(value));
      const records=[{at:new Date().toISOString(),draft:value},...history].slice(0,10);
      window.localStorage.setItem(recordKey(user.id),JSON.stringify(records));
      setHistory(records);
    }catch{/* The committed server draft is authoritative. */}
    return state;
  }
  async function save(){
    if(!user?.id||busy||serverVersion===null)return;
    setBusy(true);setNotice("");
    try{
      await persistDraft();
      setNotice("Draft saved to the server. The live site has not changed.");
    }catch{
      setNotice("Draft wasn't saved. Check your connection, or reload if another browser edited it.");
    }finally{setBusy(false);}
  }
  async function publish(){
    if(busy||serverVersion===null)return;
    if(!window.confirm("Publish this design to ALL visitors now?"))return;
    setBusy(true);setNotice("");
    try{
      const state=hasChanges?await persistDraft():{draftVersion:serverVersion};
      const published=await adminRequest("/admin/ui-design/publish","POST",
        {expectedVersion:state.draftVersion});
      acceptServerState(published);
      window.dispatchEvent(new Event("ogc-design-published"));
      setNotice("Published revision #"+published.publishedRevision+". The public site will show it on refresh.");
    }catch{
      setNotice("Publish failed. Your draft remains private; reload if another administrator changed it.");
    }finally{setBusy(false);}
  }
  async function rollback(){
    const revision=Number(rollbackId);
    if(!Number.isSafeInteger(revision)||revision<1||busy||serverVersion===null)return;
    if(hasChanges){
      setNotice("Save or discard your unsaved changes before restoring a published version.");
      return;
    }
    if(!window.confirm("Restore revision #"+revision+" to the LIVE website? This creates a new release."))return;
    setBusy(true);setNotice("");
    try{
      const state=await adminRequest("/admin/ui-design/rollback","POST",
        {revision,expectedVersion:serverVersion});
      acceptServerState(state);setRollbackId("");
      window.dispatchEvent(new Event("ogc-design-published"));
      setNotice("Restored revision #"+revision+" as new live release #"+state.publishedRevision+".");
    }catch{
      setNotice("Rollback failed. Reload to check whether another administrator published a change.");
    }finally{setBusy(false);}
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
        <p>Edit the shared site shell separately from each page’s center content. All three columns remain permanently present.</p></div>
      <span className="ogcl-ui-draft-label">{serverVersion===null?"CONNECTING…":
          busy?"SAVING…":"SERVER DRAFT · "+(publishedRevision===null?"NOT YET PUBLISHED":"LIVE #"+publishedRevision)}</span>
    </header>
    <nav className="ogcl-ui-editor-workspaces" aria-label="Editing workspace">
      <button type="button" className={workspace==="shell"?"selected":""}
        aria-current={workspace==="shell"?"page":undefined} onClick={()=>chooseWorkspace("shell")}>
        Site Shell <small>Shared across every page</small>
      </button>
      <button type="button" className={workspace==="page"?"selected":""}
        aria-current={workspace==="page"?"page":undefined} onClick={()=>chooseWorkspace("page")}>
        Page Content <small>Center column only</small>
      </button>
    </nav>
    <div className="ogcl-ui-editor-toolbar">
      <label>{workspace==="shell"?"Page used for preview":"Editing center page"}
        <select value={page} onChange={e=>{setPage(e.target.value);if(workspace==="page")setSelected({kind:"area",id:"pageHeader"});}}>
          {EDITOR_PAGES.map(item=><option key={item.path} value={item.path}>{item.label}</option>)}
        </select>
      </label>
      <label>Preview resolution
        <select aria-label="Preview resolution" value={viewportId}
          onChange={e=>setViewportId(e.target.value)}>
          {EDITOR_VIEWPORTS.map(preset=><option key={preset.id} value={preset.id}>
            {preset.label}
          </option>)}
        </select>
      </label>
      <label>Zoom
        <select value={zoomMode} onChange={e=>setZoomMode(e.target.value)}>
          <option value="fit">Fit</option><option value="50">50%</option><option value="75">75%</option><option value="100">100%</option>
        </select>
      </label>
      <button type="button" onClick={()=>setCompact(v=>!v)}>{compact?"Show inspector":"Larger preview"}</button>
      <button type="button" onClick={undo} disabled={!undoStack.current.length}>Undo</button>
      <button type="button" onClick={redo} disabled={!redoStack.current.length}>Redo</button>
      <button className="ogcl-button" type="button" onClick={save}
        disabled={!hasChanges||busy||serverVersion===null}>Save draft</button>
      <button className="ogcl-button ogcl-ui-editor-publish" type="button" onClick={publish}
        disabled={busy||serverVersion===null}>Publish to live site</button>
    </div>
    <div className={"ogcl-ui-editor-grid"+(compact?" is-compact":"")}>
      {!compact&&<aside className="ogcl-ui-editor-panel" aria-label={workspace==="shell"?"Shared site shell structure":"Page content structure"}>
        <h3>{workspace==="shell"?"Site Shell":"Center Page Content"}</h3>
        <p className="ogcl-admin-muted">{workspace==="shell"?
          "These regions stay the same when you navigate. Changes here apply everywhere.":
          "Only the routed center page is editable here. Outer columns, account links and footer are protected."}</p>
        {workspace==="shell"?
          sharedGroups.map(([title,ids])=><section key={title}>
            <p className="ogcl-ui-editor-panel-caption">{title}</p>
            <div className="ogcl-ui-editor-elements">
              {ids.map(id=>{
                const area=EDITOR_SHELL_AREAS.find(a=>a.id===id);
                return <button key={id} type="button"
                  className={selected.kind==="area"&&selected.id===id?"selected":""}
                  onClick={()=>setSelected({kind:"area",id})}>{area.label}</button>;
              })}
            </div>
          </section>):
          <>
            <p className="ogcl-ui-editor-panel-caption">Center page regions</p>
            <div className="ogcl-ui-editor-elements">
              {EDITOR_PAGE_AREAS.map(area=><button key={area.id} type="button"
                className={selected.kind==="area"&&selected.id===area.id?"selected":""}
                onClick={()=>setSelected({kind:"area",id:area.id})}>{area.label}</button>)}
            </div>
            <p className="ogcl-ui-editor-panel-caption">Added center blocks · {blocks.length}/24</p>
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
          </>}
        <section className="ogcl-ui-editor-text-list" aria-label="Editable site text">
          <h3>Text and labels</h3>
          <p className="ogcl-admin-muted">Select a heading or label in the preview, or choose one below.</p>
          <div className="ogcl-ui-editor-elements">
            {EDITOR_TEXT_TARGETS.filter(target=>target.scope===workspace&&availableText.includes(target.id)).map(target=>
              <button key={target.id} type="button" className={selected.kind==="text"&&selected.id===target.id?"selected":""}
                onClick={()=>setSelected({kind:"text",id:target.id})}>{target.label}</button>)}
          </div>
          {!EDITOR_TEXT_TARGETS.some(target=>target.scope===workspace&&availableText.includes(target.id))&&
            <p className="ogcl-admin-muted">No editable static text on this preview yet.</p>}
        </section>
      </aside>}
      <div className="ogcl-ui-editor-stage-wrap">
        <p className="ogcl-ui-editor-panel-caption">{workspace==="shell"?"Shared site shell preview":"Center page preview"} · {viewport.width} × {viewport.height} CSS px · {Math.round(scale*100)}% · click text to edit · links disabled</p>
        <div className="ogcl-ui-editor-stage" ref={stage}>
          <div className="ogcl-ui-editor-frame-viewport"
            style={{width:viewport.width*scale,height:viewport.height*scale}}>
            <iframe ref={frame} key={page} title={"OG Cupid "+page+" editor preview"}
              src={previewUrl} onLoad={()=>setFrameVersion(v=>v+1)}
              style={{width:viewport.width,height:viewport.height,transform:"scale("+scale+")",transformOrigin:"top left"}}
              tabIndex={-1}/>
          </div>
        </div>
      </div>
      {!compact&&<aside className="ogcl-ui-editor-panel" aria-label="Selected element properties">
        <h3>Properties</h3>
        <p className="ogcl-ui-editor-selection">{chosenBlock?
          editorBlockHtmlLabel(chosenBlock):chosenArea?.label||chosenText?.label||"Choose an element"}</p>
        {chosenArea&&<p className="ogcl-ui-editor-scope">
          {workspace==="shell"?"Applies to every page · shared site shell":
            "Applies only to the center of "+EDITOR_PAGES.find(x=>x.path===page)?.label}
        </p>}
        {chosenText&&<div className="ogcl-ui-editor-text-edit">
          <label>Edit text · {chosenText.scope==="shell"?"all pages":EDITOR_PAGES.find(p=>p.path===page)?.label}
            <textarea rows={chosenText.max>160?5:2} maxLength={chosenText.max}
              value={currentText} onChange={e=>updateText(e.target.value)}
              aria-label={"Edit "+chosenText.label}/>
          </label>
          <p className="ogcl-admin-muted">Links retain their destinations and buttons retain their behavior. Save privately, then Publish to make these changes public.</p>
          <div className="ogcl-ui-editor-text-actions">
            <button type="button" onClick={resetText}>Restore original text</button>
            <button type="button" onClick={styleRelatedText}>Style this region</button>
          </div>
        </div>}
        {chosenBlock&&<>
          {chosenBlock.type!=="divider"&&<label>Text
            <textarea rows={4} maxLength={500} value={chosenBlock.text}
              onChange={e=>updateBlock(chosenBlock.id,{text:e.target.value})}/>
          </label>}
          {chosenBlock.type==="button"&&<label>Button destination
            <select aria-label="Button destination" value={chosenBlock.href||""}
              onChange={e=>updateBlock(chosenBlock.id,{href:e.target.value})}>
              <option value="">No action (disabled)</option>
              {EDITOR_LINK_ROUTES.map(route=><option key={route.path} value={route.path}>{route.label}</option>)}
            </select>
          </label>}
          <label className="ogcl-ui-editor-check"><input type="checkbox" checked={chosenBlock.hidden}
            onChange={e=>updateBlock(chosenBlock.id,{hidden:e.target.checked})}/> Hide block in preview</label>
        </>}
        {(chosenBlock||chosenArea)&&<>
        <p className="ogcl-ui-editor-computed-note">Current live values from the preview. Resetting a property restores its CSS value.</p>
        <div className="ogcl-ui-editor-properties">
          {EDITOR_PROPERTIES.map(property=>{
            const override=activeStyle[property.key];
            const live=inspected.values[property.key]||{value:"",raw:"Not available"};
            const shown=override??live.value;
            const value=shown??"";
            return <label key={property.key}>{property.label}
              <div className="ogcl-ui-editor-property">
                {property.kind==="select"?
                  <select value={value} onChange={e=>updateArea(property.key,e.target.value||null)}>
                    {value===""&&<option value="">Current: {live.raw}</option>}
                    {property.options.map(option=><option key={option} value={option}>{option}</option>)}
                  </select>:
                  <input type={property.kind==="color"?"color":"number"}
                    min={property.kind==="number"?0:undefined}
                    max={property.kind==="number"?property.max:undefined}
                    step={property.kind==="number"?"0.1":undefined}
                    value={property.kind==="color"?(value||"#ffffff"):value}
                    onChange={e=>updateArea(property.key,property.kind==="color"?
                      e.target.value:e.target.value===""?null:Number(e.target.value))}/>}
                <button type="button" title={"Reset "+property.label} onClick={()=>updateArea(property.key,null)}>↺</button>
              </div>
              <span className="ogcl-ui-editor-computed-value" title="Computed from the preview">
                Current: {live.raw}
              </span>
            </label>;
          })}
        </div></>}
        {workspace==="shell"&&<><h3>Global palette</h3>
        <p className="ogcl-admin-muted">These colors are shared across all pages, including their center content.</p>
        <div className="ogcl-ui-editor-properties">
          {EDITOR_TOKENS.map(token=><label key={token.id}>{token.label}
            <div className="ogcl-ui-editor-property">
              <input type="color" value={draft.tokens[token.id]||inspected.tokens[token.id]||token.default}
                onChange={e=>commit(next=>{next.tokens[token.id]=e.target.value;return next;})}/>
              <button type="button" title={"Reset "+token.label}
                onClick={()=>commit(next=>{delete next.tokens[token.id];return next;})}>↺</button>
            </div>
          </label>)}
        </div></>}
      </aside>}
    </div>
    <footer className="ogcl-ui-editor-footer">
      <strong>{hasChanges?"Unsaved draft changes":"Draft up to date"}</strong>
      <span>Drafts are saved privately on the server. Publishing updates the public site's design without a Render rebuild.</span>
      <label>Published versions
        <select aria-label="Published versions" value={rollbackId} onChange={e=>setRollbackId(e.target.value)}>
          <option value="">Select a revision to restore…</option>
          {publishedHistory.map(entry=><option key={entry.revision} value={entry.revision}>
            #{entry.revision} · {new Date(entry.publishedAt).toLocaleString()}
          </option>)}
        </select>
      </label>
      <button type="button" onClick={rollback} disabled={!rollbackId||busy||serverVersion===null}>Restore live version</button>
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
