import pageCopyCatalog from "virtual:ogc-page-copy";
import {applySitePageCopy} from "./site-page-copy.mjs";
import React,{useCallback,useEffect,useMemo,useRef,useState} from "react";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {
  blankEditorDraft,sanitizeEditorDraft,editorPreviewCss,navButtonOverrides,
  moveEditorBlock,editorBlockHtmlLabel,EDITOR_PAGES,EDITOR_AREAS,
  EDITOR_SHELL_AREAS,EDITOR_PAGE_AREAS,EDITOR_MAIN_NAV_AREAS,EDITOR_SCHEMA,editorAreaScope,
  EDITOR_TOKENS,EDITOR_BLOCK_TYPES,EDITOR_PROPERTIES,editorPropertyAvailable,editorStyleEntries,editorStyleValue,styleShorthand,
  EDITOR_VIEWPORTS,EDITOR_TEXT_TARGETS,EDITOR_LINK_ROUTES,editorTextTarget
} from "./admin-ui-editor-model.mjs";
import {computedEditorSnapshot} from "./admin-ui-editor-inspector.mjs";
import {formatEditorCss,parseEditorCss,parseEditorJson,setNavStyle} from "./admin-ui-editor-source.mjs";
import AdminUiCodePane from "./AdminUiCodePane.jsx";
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
  for(const [key,value] of editorStyleEntries(block.style))element.style[key]=editorStyleValue(value);
  if(selected?.kind==="block"&&selected.id===block.id)element.classList.add("ogcl-editor-preview-selected");
  return element;
}
const EDITOR_OVERLAY_STYLE=[
  ".ogcl-editor-preview-block{position:relative;}",
  ".ogcl-editor-preview-block:hover{outline:2px dashed #f83265!important;outline-offset:2px;cursor:crosshair;}",
  ".ogcl-editor-preview-selected,[data-ogc-editor-selected]{outline:3px solid #f83265!important;outline-offset:2px;}",
  "[data-ogc-edit-text]:hover{outline:2px dashed #f83265!important;outline-offset:2px;cursor:text;}",
  ".ogcl-nav-link[data-ogc-editor-selected]{outline-width:1px!important;outline-offset:-4px;}",
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
  const view=doc.querySelector(".ogcl-sheet .ogcl-view");
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
  applySitePageCopy(doc,draft,page);
  for(const target of EDITOR_TEXT_TARGETS){
    if(!editorTextTarget(target.id,page))continue;
    for(const element of doc.querySelectorAll(target.selector)){
    if(!element || element.children.length)continue;
    if(!element.hasAttribute("data-ogc-editor-original-text"))
      element.setAttribute("data-ogc-editor-original-text",(target.attribute?element.getAttribute(target.attribute):element.textContent)||"");
    element.setAttribute("data-ogc-edit-text",target.id);
    const scope=target.scope==="shell"?"*":page;
    const chosen=draft.texts[scope]?.[target.id];
    const text=chosen??element.getAttribute("data-ogc-editor-original-text");
    if(target.attribute){if(element.getAttribute(target.attribute)!==text)element.setAttribute(target.attribute,text);}
    else if(element.textContent!==text)element.textContent=text;
    }
  }
  doc.querySelectorAll("[data-ogc-editor-selected]").forEach(el=>el.removeAttribute("data-ogc-editor-selected"));
  if(selected?.kind==="text"){
    const target=editorTextTarget(selected.id,page);
    if(target)doc.querySelector(target.selector)?.setAttribute("data-ogc-editor-selected","true");
  }
  if(selected?.kind==="area"){
    const selector=EDITOR_MAIN_NAV_AREAS.some(area=>area.id===selected.id)?
      EDITOR_AREAS.find(area=>area.id==="mainNavLinks").selector:EDITOR_AREAS.find(area=>area.id===selected.id)?.selector;
    if(selector)doc.querySelectorAll(selector).forEach(el=>el.setAttribute("data-ogc-editor-selected","true"));
  }
}
function NumericStyleInput({property,value,change}){
  const percent=typeof value==="string"&&value.endsWith("%");
  const unit=percent?"%":"px";
  const current=value===""?"":String(parseFloat(value));
  // Keep partial keyboard input (a minus sign or decimal point) until blur.
  const [editing,setEditing]=useState(null);
  const limit=percent?100:property.max;
  const commitValue=(raw,nextUnit)=>{
    if(raw===""){change(null);return;}
    const number=Number(raw);
    if(Number.isFinite(number)&&number>=property.min&&number<=(nextUnit==="%"?100:property.max)){
      const rounded=Math.round(number*10)/10;
      change(nextUnit==="%"?rounded+"%":rounded);
    }
  };
  return <span className="ogcl-studio-number">
    <input id={"ogc-style-"+property.key} type="number" aria-label={property.label} min={property.min} max={limit} step="0.1"
      value={editing??current}
      onChange={event=>{
        const input=event.currentTarget;
        setEditing(input.value);
        if(!input.validity.badInput)commitValue(input.value,unit);
      }}
      onBlur={()=>setEditing(null)}/>
    {property.percent&&<select aria-label={property.label+" unit"} value={unit}
      onChange={event=>commitValue(String(Math.min(Number(current),event.target.value==="%"?100:property.max)),event.target.value)}>
      <option value="px">px</option><option value="%">%</option>
    </select>}
  </span>;
}

export default function AdminUiEditor({onUnsavedChange}){
  const {user,adminRequest}=useMemberSession();
  const [page,setPage]=useState("/matches");
  const [workspace,setWorkspace]=useState("shell");
  const [draft,setDraft]=useState(blankEditorDraft);
  const draftRef=useRef(draft);
  const replaceDraft=useCallback(value=>{draftRef.current=value;setDraft(value);},[]);
  const [savedText,setSavedText]=useState("");
  const [notice,setNotice]=useState("");
  const [selected,setSelected]=useState({kind:"area",id:"brand"});
  const [frameVersion,setFrameVersion]=useState(0);
  const [zoomMode,setZoomMode]=useState("fit");
  const [viewportId,setViewportId]=useState("editor");
  const viewport=EDITOR_VIEWPORTS.find(x=>x.id===viewportId)||EDITOR_VIEWPORTS[0];
  const [scale,setScale]=useState(.64);
  const [inspected,setInspected]=useState({values:{},text:"",tokens:{}});
  const [propertyFilter,setPropertyFilter]=useState("");
  const [renderedCopy,setRenderedCopy]=useState([]);
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
  const [mode,setMode]=useState("visual");
  const [language,setLanguage]=useState("css");
  const [sourceText,setSourceText]=useState(null);
  const [sourceError,setSourceError]=useState("");
  const [layerFilter,setLayerFilter]=useState("");
  const [loadingDraft,setLoadingDraft]=useState(true);
  const frame=useRef(null),stage=useRef(null);
  const undoStack=useRef([]),redoStack=useRef([]);
  const commit=useCallback(update=>{
    const previous=draftRef.current;
    const edited=sanitizeEditorDraft(update(structuredClone(previous)));
    if(JSON.stringify(edited)===JSON.stringify(previous))return;
    undoStack.current=[...undoStack.current.slice(-39),previous];
    redoStack.current=[];
    replaceDraft(edited);
    setNotice("");
  },[replaceDraft]);
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
    replaceDraft(loaded);
    setSavedText(JSON.stringify(loaded));
    const savedRecords=readStored(recordKey(user.id),[]);
    setHistory(Array.isArray(savedRecords)?savedRecords.slice(0,10)
      .filter(entry=>entry&&typeof entry.at==="string"&&[1,EDITOR_SCHEMA].includes(entry.draft?.version))
      .map(entry=>({...entry,draft:sanitizeEditorDraft(entry.draft)})):[]);
    undoStack.current=[];redoStack.current=[];
  },[user?.id,replaceDraft]);
  const hasChanges=JSON.stringify(draft)!==savedText;
  useEffect(()=>{
    if(!user?.id)return;
    let live=true;
    setServerVersion(null);
    setLoadingDraft(true);
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
        replaceDraft(local);
        setSavedText(JSON.stringify(fromServer));
        setNotice("Your earlier browser draft is ready to import. Choose Save draft to store it on the server.");
      }else{
        replaceDraft(fromServer);
        setSavedText(JSON.stringify(fromServer));
        setNotice("Server draft loaded. Changes are private until you publish.");
      }
      undoStack.current=[];redoStack.current=[];
    }).catch(()=>{
      if(live)setNotice("Could not load the server draft. Reopen the editor to retry.");
    }).finally(()=>{
      if(live)setLoadingDraft(false);
    });
    return()=>{live=false;};
  },[user?.id,adminRequest,replaceDraft]);
  const previewUrl=useMemo(()=>{
    const search=new URLSearchParams(window.location.search);
    search.set("ogc-ui-preview","1");
    // Preview the actual clean route, not a legacy HashRouter fragment.
    return page+"?"+search.toString();
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
  },[zoomMode,compact,mode,viewport.width]);
  useEffect(()=>{
    const doc=frame.current?.contentDocument;
    if(!doc)return;
    const intercept=event=>{
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
      const target=event.target;
      if(mode!=="visual"||!(target instanceof doc.defaultView.Element))return;
      const block=target.closest("[data-ogc-editor-block-id]");
      if(block){
        setWorkspace("page");
        setSelected({kind:"block",id:block.getAttribute("data-ogc-editor-block-id")});
        return;
      }
      const navItem=EDITOR_MAIN_NAV_AREAS.find(area=>target.closest(area.selector));
      if(navItem){
        setWorkspace("shell");
        setSelected({kind:"area",id:navItem.id});
        return;
      }
      const textElement=target.closest("[data-ogc-edit-text]")||target.closest("button,label")?.querySelector("[data-ogc-edit-text]");
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
      if(mode!=="visual"||!element){prevent(event);return;}
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
      if(mode==="visual"&&!busy&&!loadingDraft&&target&&source){
        commit(next=>{
          const list=next.pages[page]||[];
          const start=list.findIndex(block=>block.id===source);
          const end=list.findIndex(block=>block.id===target.getAttribute("data-ogc-editor-block-id"));
          if(start>=0&&end>=0&&start!==end)next.pages[page]=moveEditorBlock(list,start,end);
          return next;
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
  },[frameVersion,page,mode,busy,loadingDraft,commit]);
  useEffect(()=>{
    const doc=frame.current?.contentDocument;
    if(!doc?.body)return;
    const render=()=>{
      try{
        if(!doc.querySelector(".ogcl-app"))return;
        putPreview(doc,draft,page,mode==="visual"?selected:null);
        const selector=selected.kind==="block"?
          '[data-ogc-editor-block-id="'+selected.id+'"]':
          selected.kind==="text"?editorTextTarget(selected.id,page)?.selector:
          EDITOR_AREAS.find(area=>area.id===selected.id)?.selector;
        const element=selector?doc.querySelector(selector):null;
        const values=element?computedEditorSnapshot(doc.defaultView.getComputedStyle(element),
          EDITOR_PROPERTIES):{};
        const textTarget=editorTextTarget(selected.id,page);
        const text=textTarget?
          doc.querySelector(textTarget.selector)?.getAttribute("data-ogc-editor-original-text")||"":"";
        const tokens=Object.fromEntries(EDITOR_TOKENS.map(token=>[
          token.id,doc.defaultView.getComputedStyle(doc.documentElement)
            .getPropertyValue(token.id).trim()||token.default
        ]));
        setInspected(previous=>{
          const nav=doc.querySelector(".ogcl-main-nav");
          const navGap=nav?parseFloat(doc.defaultView.getComputedStyle(nav).rowGap):null;
          const next={values,text,tokens,navGap};
          return JSON.stringify(previous)===JSON.stringify(next)?previous:next;
        });
        const generated=Array.from(doc.querySelectorAll('.ogcl-sheet [data-ogc-edit-text^="site."]'),el=>{
          const id=el.getAttribute("data-ogc-edit-text"),source=el.getAttribute("data-ogc-editor-original-text")||"";
          return {id,source,label:source.slice(0,90),pages:[page]};
        });
        setRenderedCopy(previous=>JSON.stringify(previous)===JSON.stringify(generated)?previous:generated);
        const available=EDITOR_TEXT_TARGETS.filter(t=>editorTextTarget(t.id,page)&&
          [...doc.querySelectorAll(t.selector)].some(el=>!el.children.length))
          .map(t=>t.id);
        setAvailableText(prev=>JSON.stringify(prev)===JSON.stringify(available)?prev:available);
      }catch{ /* Preview may be remounting while route loads. */ }
    };
    render();
    const observer=new MutationObserver(render);
    observer.observe(doc.body,{childList:true,subtree:true,characterData:true});
    return()=>observer.disconnect();
  },[draft,page,selected,frameVersion,mode]);
  const blocks=draft.pages[page]||[];
  const sharedGroups=[
    ["Site background & logo",["siteBackground","brand"]],
    ["Left column",["leftRail","leftPromos","leftEditorial",...["0","1","2"].map(n=>"shell.promo.left."+n)]],
    ["Navigation spacing",["navSpacing"]],
    ["Main navigation",EDITOR_MAIN_NAV_AREAS.map(area=>area.id)],
    ["Top account links",["accountBar","accountLinks","accountActions"]],
    ["Right column",["rightRail","profileFloater","refinementCard","rightCard","rightEditorial",...["0","1","2"].map(n=>"shell.promo.right."+n)]],
    ["Center frame & legal footer",["centerSheet","legalFooter","footerLinks","footerLinkLabels"]]
  ];
  function chooseWorkspace(next){
    setWorkspace(next);
    setLayerFilter("");
    setSelected({kind:"area",id:next==="shell"?"brand":"pageHeader"});
    setNotice("");
  }
  const chosenBlock=selected.kind==="block"?blocks.find(b=>b.id===selected.id):null;
  const chosenArea=selected.kind!=="block"?EDITOR_AREAS.find(a=>a.id===selected.id):null;
  const pageCatalog=useMemo(()=>Array.from(new Map([...pageCopyCatalog,...renderedCopy].filter(item=>item.pages.includes(page)).map(item=>[item.id,item])).values()),[page,renderedCopy]);
  const catalogItem=pageCatalog.find(item=>item.id===selected.id&&item.pages.includes(page));
  const chosenText=selected.kind==="text"||chosenArea?.id.startsWith("shell.nav.")?
    (catalogItem?{...editorTextTarget(selected.id,page),...catalogItem}:editorTextTarget(selected.id,page)):null;
  const textScope=chosenText?.scope==="shell"?"*":page;
  const currentText=chosenText?
    draft.texts[textScope]?.[chosenText.id]??catalogItem?.source??inspected.text:"";
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
      chosenText.id==="page.heading"?"pageTitle":chosenText.id==="page.intro"?"pageHeader":"mainContent":
      chosenText.id.startsWith("shell.footer.")?"footerLinkLabels":
      chosenText.id.startsWith("shell.account.")?"accountActions":
      chosenText.id.startsWith("shell.promo.")?chosenText.id.split(".").slice(0,-1).join("."):
      chosenText.id.startsWith("shell.refinement.")?"refinementCard":"leftPromos";
    setSelected({kind:"area",id});
  }
  const areaScope=chosenArea&&editorAreaScope(chosenArea.id)==="shell"?"*":page;
  const navSelected=EDITOR_MAIN_NAV_AREAS.some(area=>area.id===chosenArea?.id);
  const navStyles=draft.areas["*"]||{};
  const activeStyle=navSelected?{...navStyles.mainNavLinks,...navButtonOverrides(navStyles[selected.id],navStyles.mainNavLinks)}:
    chosenBlock?.style||draft.areas[areaScope]?.[selected.id]||{};
  const editNavGap=navSelected||chosenArea?.id==="navSpacing";
  const updateGap=value=>commit(next=>{
    const shell=next.areas["*"]??={};
    const spacing=shell.navSpacing??={};
    if(value===null)delete spacing.rowGap;
    else spacing.rowGap=value;
    return next;
  });
  const updateArea=(property,value)=>commit(next=>{
    if(navSelected){setNavStyle(next,property,value);return next;}
    const target=selected.kind==="block"&&workspace==="page"?
      next.pages[page]?.find(b=>b.id===selected.id)?.style:
      chosenArea&&editorAreaScope(selected.id)===workspace?
        ((next.areas[areaScope]??={})[selected.id]??={}):null;
    if(!target)return next;
    if(value===null||value==="")delete target[property];
    else {
      for(const key of Object.keys(target))if(styleShorthand(key)===property)delete target[key];
      target[property]=value;
    }
    return next;
  });
  const updateBlock=(id,patch)=>commit(next=>{
    const item=workspace==="page"?next.pages[page]?.find(b=>b.id===id):null;
    if(item)Object.assign(item,patch);
    return next;
  });
  function addBlock(){
    if(workspace!=="page"||blocks.length>=24)return;
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
    redoStack.current.push(draftRef.current);replaceDraft(prior);setNotice("");
  }
  function redo(){
    const next=redoStack.current.pop();
    if(!next)return;
    undoStack.current.push(draftRef.current);replaceDraft(next);setNotice("");
  }
  function acceptServerState(state,replaceLocal=true){
    setServerVersion(state.draftVersion);
    setPublishedRevision(state.publishedRevision??null);
    setPublishedHistory(Array.isArray(state.history)?state.history:[]);
    if(replaceLocal){
      const clean=sanitizeEditorDraft(state.draft);
      replaceDraft(clean);
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
    if(!user?.id||busy||serverVersion===null||sourceDirty)return;
    setBusy(true);setNotice("");
    try{
      await persistDraft();
      setNotice("Draft saved to the server. The live site has not changed.");
    }catch{
      setNotice("Draft wasn't saved. Check your connection, or reload if another browser edited it.");
    }finally{setBusy(false);}
  }
  async function publish(){
    if(busy||serverVersion===null||sourceDirty)return;
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
    if(hasChanges||sourceDirty){
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
    if(!entry||sourceDirty)return;
    commit(()=>entry.draft);
    setNotice("Snapshot loaded as an unsaved draft.");
  }
  const cssScope=workspace==="shell"?"*":page;
  const pageLabel=EDITOR_PAGES.find(item=>item.path===page)?.label??page;
  const scopeLabel=workspace==="shell"?"Site shell":pageLabel;
  const generatedSource=useMemo(()=>language==="css"
    ?formatEditorCss(draft,cssScope)
    :JSON.stringify(draft,null,2)+"\n",[draft,cssScope,language]);
  const sourceDirty=sourceText!==null;
  const unsaved=hasChanges||sourceDirty;
  const working=busy||loadingDraft;
  const canSave=serverVersion!==null&&!working&&!sourceDirty;
  const layerMatches=label=>label.toLowerCase().includes(layerFilter.trim().toLowerCase());
  const textLayers=EDITOR_TEXT_TARGETS.filter(target=>
    target.scope===workspace&&!target.id.startsWith("shell.nav.")&&availableText.includes(target.id)&&layerMatches(target.label)
  );
  if(workspace==="page")textLayers.push(...pageCatalog.filter(item=>item.pages.includes(page)&&layerMatches(item.source)));
  const activeLabel=chosenBlock?editorBlockHtmlLabel(chosenBlock):
    chosenArea?.label||chosenText?.label||(selected.kind==="palette"?"Global palette":"Select a layer");

  useEffect(()=>{onUnsavedChange?.(unsaved&&!loadingDraft);},[unsaved,loadingDraft,onUnsavedChange]);
  useEffect(()=>()=>onUnsavedChange?.(false),[onUnsavedChange]);
  useEffect(()=>{
    if(!unsaved||loadingDraft)return;
    const warn=event=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);
    return()=>window.removeEventListener("beforeunload",warn);
  },[unsaved,loadingDraft]);

  function editSource(value){
    setSourceText(value===generatedSource?null:value);
    setSourceError("");
  }
  function discardSource(){
    setSourceText(null);
    setSourceError("");
  }
  function applySource(){
    if(!sourceDirty||working)return;
    try{
      const next=language==="css"?parseEditorCss(sourceText,draft,cssScope):parseEditorJson(sourceText,draft);
      commit(()=>next);
      discardSource();
      setNotice("Code applied to the draft.");
    }catch(error){setSourceError(error.message);}
  }

  function layerButton(kind,id,label){
    return <button key={id} type="button" className="ogcl-studio-layer"
      aria-pressed={selected.kind===kind&&selected.id===id} onClick={()=>setSelected({kind,id})}
      title={label}>{label}</button>;
  }

  function styleControl(property){
    const override=activeStyle[property.key]??(navSelected?navStyles.mainNavLinks?.[property.key]:undefined);
    const canReset=override!==undefined||navSelected&&EDITOR_MAIN_NAV_AREAS.some(({id})=>navStyles[id]?.[property.key]!==undefined);
    const live=inspected.values[property.key]||{value:"",raw:"Unavailable in this preview"};
    const value=override??live.value??"";
    return <div className="ogcl-studio-style-field" key={property.key}>
      <div className="ogcl-studio-control"><label htmlFor={"ogc-style-"+property.key} title={live.raw}>{property.label}</label>
        {property.kind==="select"?
          <select id={"ogc-style-"+property.key} value={value} onChange={event=>updateArea(property.key,event.target.value||null)}>
            {value===""&&<option value="">Inherited</option>}
            {property.options.map(option=><option key={option} value={option}>{property.key==="backgroundImage"?"None (flat fill)":option}</option>)}
          </select>:
          property.kind==="color"?
          <input id={"ogc-style-"+property.key} type="color" value={/^#[0-9a-f]{6}$/i.test(value)?value:"#ffffff"}
            onChange={event=>updateArea(property.key,event.target.value)}/>:
          <NumericStyleInput property={property} value={value}
            change={next=>updateArea(property.key,next)}/>}

      </div>
      {property.kind==="color"&&<button type="button" title={"Transparent "+property.label}
        aria-pressed={value==="transparent"||live.raw==="rgba(0, 0, 0, 0)"&&override===undefined}
        onClick={()=>updateArea(property.key,"transparent")}>Clear fill</button>}
      <button type="button" title={"Reset "+property.label} disabled={!canReset}
        onClick={()=>updateArea(property.key,null)}>Reset</button>
    </div>;
  }

  const search=propertyFilter.trim().toLowerCase();
  const gapControl=editNavGap&&"space between buttons spacing row gap (px)".includes(search);
  const styleGroups=["Colors","Size","Layout","Spacing","Type","Borders"].map(group=>[
    group,EDITOR_PROPERTIES.filter(property=>property.group===group&&
      editorPropertyAvailable(property.key,chosenArea?.id)&&
      !(editNavGap&&property.key==="rowGap")&&!(chosenArea?.id==="navSpacing"&&property.key==="columnGap")&&
      (group+" "+property.label+" "+property.key).toLowerCase().includes(search))
  ]).filter(([,properties])=>properties.length);
  const choosePage=next=>{
    setPage(next);
    if(workspace==="page")setSelected({kind:"area",id:"pageHeader"});
  };

  return <section className="ogcl-ui-editor" aria-label="OG Cupid Design Studio">
    <header className="ogcl-studio-header">
      <div>
        <h2>Design Studio</h2>
        <p className="ogcl-studio-state">
          {loadingDraft?"Loading draft":busy?"Working…":serverVersion===null?"Draft unavailable":unsaved?"Unsaved draft":"Draft saved"}
          {publishedRevision!==null&&<span>Live revision #{publishedRevision}</span>}
        </p>
      </div>
      <div className="ogcl-studio-actions">
        <button type="button" onClick={undo} disabled={working||sourceDirty||!undoStack.current.length}>Undo</button>
        <button type="button" onClick={redo} disabled={working||sourceDirty||!redoStack.current.length}>Redo</button>
        <button type="button" onClick={save} disabled={!canSave||!hasChanges}>Save draft</button>
        <button className="ogcl-studio-accent" type="button" onClick={publish} disabled={!canSave}>Publish to live site</button>
      </div>
    </header>
    <div className="ogcl-studio-command">
      <div className="ogcl-studio-segments" role="group" aria-label="Editor mode">
        <button type="button" aria-pressed={mode==="visual"} disabled={sourceDirty} onClick={()=>setMode("visual")}>Visual</button>
        <button type="button" aria-pressed={mode==="code"} onClick={()=>{setMode("code");setCompact(false);}}>Code</button>
      </div>
      <div className="ogcl-studio-segments" role="group" aria-label="Edit scope">
        <button type="button" aria-pressed={workspace==="shell"} disabled={sourceDirty}
          onClick={()=>chooseWorkspace("shell")}>Site shell</button>
        <button type="button" aria-pressed={workspace==="page"} disabled={sourceDirty}
          onClick={()=>chooseWorkspace("page")}>Page content</button>
      </div>
      <label>Page
        <select value={page} disabled={sourceDirty} onChange={event=>choosePage(event.target.value)}>
          {EDITOR_PAGES.map(item=><option key={item.path} value={item.path}>{item.label}</option>)}
        </select>
      </label>
      {mode==="visual"&&<button type="button" className="ogcl-studio-expand" aria-pressed={compact}
        onClick={()=>setCompact(value=>!value)}>{compact?"Show editing panels":"Expand preview"}</button>}
    </div>
    {notice&&<p role="status" className="ogcl-studio-notice">{notice}</p>}

    <div className={"ogcl-studio-workspace studio-"+mode+(compact&&mode==="visual"?" studio-expanded":"")}>
      {mode==="visual"&&!compact&&<aside className="ogcl-studio-layers" aria-label="Layers">
        <h3>Layers</h3>
        <label className="ogcl-studio-find">Filter layers
          <input type="search" value={layerFilter} onChange={event=>setLayerFilter(event.target.value)}/>
        </label>
        <fieldset disabled={working}>
          {workspace==="shell"?<>
            {layerMatches("Global palette")&&layerButton("palette","tokens","Global palette")}
            {sharedGroups.map(([title,ids])=>{
              const layers=ids.map(id=>EDITOR_SHELL_AREAS.find(area=>area.id===id)).filter(area=>layerMatches(area.label));
              return layers.length>0&&<details key={title} open>
                <summary>{title}</summary>
                {layers.map(area=>layerButton("area",area.id,area.label))}
              </details>;
            })}
          </>:<>
            <details open><summary>Page regions</summary>
              {EDITOR_PAGE_AREAS.filter(area=>layerMatches(area.label)).map(area=>layerButton("area",area.id,area.label))}
            </details>
            <details open><summary>Custom blocks</summary>
              <ol className="ogcl-studio-blocks">
                {blocks.map((block,index)=>layerMatches(editorBlockHtmlLabel(block))&&<li key={block.id} draggable
                  onDragStart={()=>setDragId(block.id)}
                  onDragOver={event=>event.preventDefault()}
                  onDrop={event=>{event.preventDefault();if(dragId)moveBlock(dragId,index);setDragId(null);}}
                  onDragEnd={()=>setDragId(null)}>
                  {layerButton("block",block.id,editorBlockHtmlLabel(block)+(block.hidden?" (hidden)":""))}
                  <button type="button" disabled={!index} title="Move up" aria-label={"Move "+editorBlockHtmlLabel(block)+" up"}
                    onClick={()=>moveBlock(block.id,index-1)}>↑</button>
                  <button type="button" disabled={index===blocks.length-1} title="Move down" aria-label={"Move "+editorBlockHtmlLabel(block)+" down"}
                    onClick={()=>moveBlock(block.id,index+1)}>↓</button>
                </li>)}
              </ol>
              <div className="ogcl-studio-insert">
                <select value={addType} onChange={event=>setAddType(event.target.value)} aria-label="New block type">
                  {EDITOR_BLOCK_TYPES.map(block=><option key={block.type} value={block.type}>{block.label}</option>)}
                </select>
                <button type="button" disabled={blocks.length>=24} onClick={addBlock}>Add block</button>
              </div>
            </details>
          </>}
          {textLayers.length>0&&<details open><summary>Text and labels</summary>
            {textLayers.map(target=>layerButton("text",target.id,target.label))}
          </details>}
        </fieldset>
      </aside>}

      <section className="ogcl-studio-canvas" aria-label="Preview canvas">
        <div className="ogcl-studio-canvas-bar">
          <strong>Preview</strong>
          <select aria-label="Preview resolution" value={viewportId} onChange={event=>setViewportId(event.target.value)}>
            {EDITOR_VIEWPORTS.map(preset=><option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
          <select aria-label="Preview zoom" value={zoomMode} onChange={event=>setZoomMode(event.target.value)}>
            <option value="fit">Fit width</option><option value="50">50%</option>
            <option value="75">75%</option><option value="100">100%</option>
          </select>
          <span className="ogcl-studio-zoom">{Math.round(scale*100)}%</span>
        </div>
        <div className="ogcl-studio-stage" ref={stage}>
          <div className="ogcl-studio-frame" style={{width:viewport.width*scale,height:viewport.height*scale}}>
            <iframe ref={frame} key={page} title={"OG Cupid "+page+" editor preview"} src={previewUrl}
              sandbox="allow-same-origin allow-scripts" onLoad={()=>setFrameVersion(value=>value+1)}
              style={{width:viewport.width,height:viewport.height,transform:"scale("+scale+")"}} tabIndex={-1}/>
          </div>
        </div>
      </section>

      {mode==="visual"&&!compact&&<aside className="ogcl-studio-inspector" aria-label="Inspector">
        <h3>Inspector</h3>
        <header>
          <strong>{activeLabel}</strong>
          <span>{navSelected?"Styles apply to all 5 buttons":workspace==="shell"?"All pages":pageLabel+" · Center column"}</span>
        </header>
        <fieldset disabled={working} key={selected.kind+":"+selected.id}>
          {selected.kind==="palette"&&EDITOR_TOKENS.map(token=><div className="ogcl-studio-style-field" key={token.id}>
            <label>{token.label}
              <input type="color" value={draft.tokens[token.id]||inspected.tokens[token.id]||token.default}
                onChange={event=>commit(next=>{next.tokens[token.id]=event.target.value;return next;})}/>
            </label>
            <button type="button" title={"Reset "+token.label} disabled={!draft.tokens[token.id]}
              onClick={()=>commit(next=>{delete next.tokens[token.id];return next;})}>Reset</button>
          </div>)}
          {chosenText&&<div className="ogcl-studio-copy">
            <label>Edit text
              <textarea rows={chosenText.max>160?5:2} maxLength={chosenText.max} value={currentText}
                onChange={event=>updateText(event.target.value)} aria-label={"Edit "+chosenText.label}/>
            </label>
            <button type="button" onClick={resetText}>Restore original text</button>
            {selected.kind==="text"&&<button type="button" onClick={styleRelatedText}>Style this region</button>}
          </div>}
          {chosenBlock&&<div className="ogcl-studio-copy">
            {chosenBlock.type!=="divider"&&<label>Block text
              <textarea rows={4} maxLength={500} value={chosenBlock.text}
                onChange={event=>updateBlock(chosenBlock.id,{text:event.target.value})}/>
            </label>}
            {chosenBlock.type==="button"&&<label>Button destination
              <select value={chosenBlock.href||""} onChange={event=>updateBlock(chosenBlock.id,{href:event.target.value})}>
                <option value="">No action</option>
                {EDITOR_LINK_ROUTES.map(route=><option key={route.path} value={route.path}>{route.label}</option>)}
              </select>
            </label>}
            <label className="ogcl-studio-check"><input type="checkbox" checked={chosenBlock.hidden}
              onChange={event=>updateBlock(chosenBlock.id,{hidden:event.target.checked})}/> Hide block</label>
            <button type="button" onClick={()=>removeBlock(chosenBlock.id)}>Remove block</button>
          </div>}
          {(chosenBlock||chosenArea)&&<label className="ogcl-studio-property-filter">Find a control
            <input type="search" value={propertyFilter} placeholder="Width, gap, radius…"
              onChange={event=>setPropertyFilter(event.target.value)}/>
          </label>}
          {gapControl&&<div className="ogcl-studio-style-field">
            <div className="ogcl-studio-control"><label htmlFor="ogc-style-navGap">Space between buttons (px)</label>
              <NumericStyleInput property={{key:"navGap",label:"Space between buttons (px)",min:0,max:512}}
                value={navStyles.navSpacing?.rowGap??inspected.navGap??""} change={updateGap}/>
            </div>
            <button type="button" title="Reset space between buttons" disabled={navStyles.navSpacing?.rowGap===undefined}
              onClick={()=>updateGap(null)}>Reset</button>
          </div>}
          {(chosenBlock||chosenArea)&&!styleGroups.length&&!gapControl&&<p>No matching controls.</p>}
          {(chosenBlock||chosenArea)&&styleGroups.map(([label,properties])=><details key={label} open={Boolean(search)||label==="Colors"||chosenArea?.id==="navSpacing"}>
            <summary>{label}</summary>
            {properties.map(styleControl)}
          </details>)}
        </fieldset>
      </aside>}

      {mode==="code"&&<AdminUiCodePane language={language} changeLanguage={setLanguage}
        source={sourceText??generatedSource} edit={editSource} dirty={sourceDirty} error={sourceError}
        locked={working} scopeLabel={scopeLabel} apply={applySource} discard={discardSource}/>}
    </div>

    <details className="ogcl-studio-history">
      <summary>Version history</summary>
      <div>
        <label>Published versions
          <select aria-label="Published versions" value={rollbackId} onChange={event=>setRollbackId(event.target.value)}>
            <option value="">Choose a revision…</option>
            {publishedHistory.map(entry=><option key={entry.revision} value={entry.revision}>
              #{entry.revision} · {new Date(entry.publishedAt).toLocaleString()}
            </option>)}
          </select>
        </label>
        <button type="button" onClick={rollback} disabled={!rollbackId||!canSave||hasChanges}>Restore live version</button>
        <label>Local snapshots
          <select value="" disabled={working||sourceDirty} onChange={event=>{
            if(event.target.value!=="")restore(Number(event.target.value));
          }}>
            <option value="">Choose a snapshot…</option>
            {history.map((record,index)=><option key={index} value={index}>{new Date(record.at).toLocaleString()}</option>)}
          </select>
        </label>
      </div>
    </details>
  </section>;
}
