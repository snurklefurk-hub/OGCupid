import React,{useCallback,useEffect,useId,useMemo,useState} from "react";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {blankEditorDraft,sanitizeEditorDraft} from "./admin-ui-editor-model.mjs";
import {COMPONENT_FAMILIES,COMPONENT_PROPERTIES,COMPONENT_STATES,componentAreaId,
  componentCss,setComponentProperty,resetComponentState} from "./shared-ui-components.mjs";
import "./admin-component-editor.css";

function PropertyField({property,value,onChange,disabled}){
  const id=useId();
  const [raw,setRaw]=useState(value===undefined?"":String(value));
  const [error,setError]=useState("");
  const commit=next=>{
    try{
      onChange(next===""?undefined:property.kind==="number"&&!next.endsWith("%")?Number(next):next);
      setError("");
    }catch(e){setError(e.message);}
  };
  const placeholder=property.kind==="gradient"?"linear-gradient(180deg, #ffffff, #cccccc)":
    property.kind==="shadow"?"0px 2px 4px 0px #00000055":
    property.kind==="color"?"#336699 or transparent":property.kind==="number"?
      (property.percent?"px or %":"px"):"Inherited";
  return <div className="ogcl-components-property">
    <label htmlFor={id}>{property.label}</label>
    <div className="ogcl-components-value">
      {property.kind==="choice"?<select id={id} value={raw} disabled={disabled} onChange={e=>{
        setRaw(e.target.value);commit(e.target.value);
      }}><option value="">Inherited</option>{property.options.map(x=><option key={x}>{x}</option>)}</select>:
        <>
          {property.kind==="color"&&<input type="color" aria-label={property.label+" picker"}
            value={/^#[\da-f]{6}$/i.test(raw)?raw:"#336699"} disabled={disabled}
            onChange={e=>{setRaw(e.target.value);commit(e.target.value);}}/>}
          <input id={id} type="text" value={raw} placeholder={placeholder} disabled={disabled}
            onChange={e=>setRaw(e.target.value)}
            onBlur={()=>{if(raw!==String(value??""))commit(raw.trim());}}
            onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.currentTarget.blur();}}}
            aria-invalid={!!error} />
        </>}
      <button type="button" disabled={disabled||(!raw&&value===undefined)}
        aria-label={"Reset "+property.label} onClick={()=>{setRaw("");commit("");}}>Reset</button>
    </div>
    {error&&<small role="alert">{error}</small>}
  </div>;
}

function Sample({family,state}){
  const [checked,setChecked]=useState(false);
  const [selected,setSelected]=useState("one");
  const [range,setRange]=useState(35);
  const [text,setText]=useState("");
  const [pressed,setPressed]=useState(false);
  const [open,setOpen]=useState(false);
  const group=useId();
  const attrs={"data-ogc-preview-state":state==="normal"?undefined:state};
  const disabled=state==="disabled";
  const instance=family.startsWith("matches.")||family.startsWith("settings.")?family:undefined;
  const common={...attrs,"data-ogc-control-id":instance};
  const label={
    "matches.search":"Search","matches.reset":"Reset","matches.advanced":"Advanced",
    "settings.edit":"Edit","settings.save":"Save","settings.cancel":"Cancel"
  }[family]||"Example button";
  if(family==="select"||family==="settings.select")return <select aria-label="Example dropdown"
    {...common} disabled={disabled} value={selected} onChange={e=>setSelected(e.target.value)}>
    <option value="one">Within 25 miles</option><option value="two">Within 50 miles</option></select>;
  if(family==="input"||family==="settings.input")return <input type="text" {...common} disabled={disabled}
    aria-label="Example text field" value={text} placeholder="Enter a location" onChange={e=>setText(e.target.value)}/>;
  if(family==="textarea")return <textarea {...common} disabled={disabled} aria-label="Example text area" rows={3}
    value={text} placeholder="Write something…" onChange={e=>setText(e.target.value)}/>;
  if(family==="checkbox"||family==="settings.checkbox")return <label><input type="checkbox" {...common}
    checked={checked||state==="selected"} disabled={disabled} onChange={e=>setChecked(e.target.checked)}/> Has photos</label>;
  if(family==="radio")return <div className="ogcl-components-options">
    {["one","two"].map((v,i)=><label key={v}><input type="radio" name={group} {...(i===0?attrs:{})} value={v}
      checked={selected===v} disabled={disabled} onChange={()=>setSelected(v)}/> {i===0?"Yes":"No"}</label>)}</div>;
  if(family==="range")return <label>Age <input type="range" min={18} max={99} {...common}
    disabled={disabled} value={range} onChange={e=>setRange(Number(e.target.value))}/> {range}</label>;
  if(family==="switch")return <button type="button" role="switch" {...common} disabled={disabled}
    aria-checked={checked||state==="selected"} onClick={()=>setChecked(!checked)}>{checked?"On":"Off"}</button>;
  if(family==="tabs"||family==="pagination")return <nav className={family==="tabs"?"ogcl-period-tabs":"ogcl-pages"}
    aria-label="Example navigation">{["one","two","three"].map((v,i)=><button type="button" key={v}
      {...(i===0?attrs:{})} disabled={disabled} aria-current={selected===v?"page":undefined}
      onClick={()=>setSelected(v)}>{family==="tabs"?["Search","Quiver","Favorites"][i]:i+1}</button>)}</nav>;
  if(family==="filter"||family==="filter.advanced"||family==="matches.advanced")return <div className="classic-search">
    <div className={"filter-chip "+(family==="filter"?"":"green")}>
      <button type="button" {...common} disabled={disabled} aria-expanded={open} onClick={()=>setOpen(!open)}>
        {family==="filter"?"Within 25 miles":"Advanced"} <span aria-hidden="true">▾</span></button>
      {open&&<div className="chip-editor" role="group" aria-label="Example choices">
        <button type="button" className="chip-option" onClick={()=>setOpen(false)}>Any</button>
      </div>}
    </div></div>;
  if(family==="option")return <div className="classic-search"><button type="button" className="chip-option"
    {...common} disabled={disabled} aria-pressed={pressed} onClick={()=>setPressed(!pressed)}>Within 25 miles</button></div>;
  if(family==="tooltip")return <span role="tooltip" {...common}>Example help text</span>;
  const variant=family==="button.danger"?"danger":family==="button.secondary"||
    ["matches.reset","settings.edit","settings.cancel"].includes(family)?"secondary":
    family==="button.primary"||["matches.search","settings.save"].includes(family)?"primary":undefined;
  return <button type={variant==="primary"?"submit":"button"} {...common} data-ogc-control={variant}
    className={"ogcl-button"+(variant==="secondary"?" ogcl-secondary":variant==="danger"?" ogcl-danger":"")}
    disabled={disabled} aria-pressed={pressed} onClick={e=>{e.preventDefault();setPressed(!pressed);}}>{label}</button>;
}

export default function AdminComponentEditor({onUnsavedChange}){
  const {adminRequest}=useMemberSession();
  const [draft,setDraft]=useState(blankEditorDraft);
  const [saved,setSaved]=useState("");
  const [version,setVersion]=useState(null);
  const [revision,setRevision]=useState(null);
  const [history,setHistory]=useState([]);
  const [restore,setRestore]=useState("");
  const [family,setFamily]=useState("button");
  const [state,setState]=useState("normal");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [filter,setFilter]=useState("");
  const accept=useCallback(result=>{
    const next=sanitizeEditorDraft(result.draft);
    setDraft(next);setSaved(JSON.stringify(next));setVersion(result.draftVersion);
    setRevision(result.publishedRevision??null);setHistory(Array.isArray(result.history)?result.history:[]);
  },[]);
  const load=useCallback(async()=>{
    setBusy(true);setError("");setNotice("");
    try{accept(await adminRequest("/admin/ui-design"));setNotice("Server draft loaded. Changes remain private until published.");}
    catch{setVersion(null);setError("Could not load the server draft. Retry before editing.");}
    finally{setBusy(false);}
  },[adminRequest,accept]);
  useEffect(()=>{void load();},[load]);
  const dirty=version!==null&&JSON.stringify(draft)!==saved;
  useEffect(()=>{onUnsavedChange?.(dirty||busy);return()=>onUnsavedChange?.(false);},[dirty,busy,onUnsavedChange]);
  useEffect(()=>{
    if(!dirty&&!busy)return;
    const warn=e=>{e.preventDefault();e.returnValue="";};
    window.addEventListener("beforeunload",warn);
    return()=>window.removeEventListener("beforeunload",warn);
  },[dirty,busy]);
  const area=componentAreaId(family,state);
  const styles=draft.areas["*"]?.[area]||{};
  const css=useMemo(()=>componentCss(draft.areas["*"],true),[draft]);
  const selectedFamily=COMPONENT_FAMILIES.find(f=>f.id===family);
  const update=(key,value)=>{
    // Validate synchronously so the property field can report invalid input.
    const next=setComponentProperty(draft,family,state,key,value);
    setDraft(next);setNotice("");
  };
  async function persist(){
    const result=await adminRequest("/admin/ui-design","PUT",{document:sanitizeEditorDraft(draft),expectedVersion:version});
    accept(result);return result;
  }
  async function action(kind){
    if(busy||version===null)return;
    if(kind==="publish"&&!window.confirm("Publish the entire current site design draft, including UI Editor changes?"))return;
    if(kind==="rollback"&&(!restore||dirty||!window.confirm("Restore this entire site design revision to the live website?")))return;
    setBusy(true);setError("");setNotice("");
    try{
      if(kind==="save"){await persist();setNotice("Draft saved. The public website has not changed.");}
      else if(kind==="publish"){
        const current=dirty?await persist():{draftVersion:version};
        const result=await adminRequest("/admin/ui-design/publish","POST",{expectedVersion:current.draftVersion});
        accept(result);window.dispatchEvent(new Event("ogc-design-published"));
        setNotice("Published revision #"+result.publishedRevision+".");
      }else{
        const result=await adminRequest("/admin/ui-design/rollback","POST",{revision:Number(restore),expectedVersion:version});
        accept(result);setRestore("");window.dispatchEvent(new Event("ogc-design-published"));
        setNotice("Restored as revision #"+result.publishedRevision+".");
      }
    }catch{
      setError("The operation failed. Your server draft may have changed in another editor. Reload to check before retrying.");
    }finally{setBusy(false);}
  }
  const properties=COMPONENT_PROPERTIES.filter(p=>!filter||(p.label+" "+p.group).toLowerCase().includes(filter.toLowerCase()));
  return <section className="ogcl-components-editor" aria-label="Shared UI component editor">
    <header><h2>UI Components</h2><p>Sitewide control styles, named variants and registered instance overrides. Page content and behavior are unchanged.</p>
      <p>Published revision: {revision??"None"} · {dirty?"Unsaved changes":"Server draft"} · UI Editor and UI Components share one versioned design.</p></header>
    <div className="ogcl-components-actions">
      <button type="button" disabled={busy} onClick={()=>{if(!dirty||window.confirm("Discard unsaved changes and reload?"))void load();}}>Reload draft</button>
      <button type="button" disabled={busy||!dirty||version===null} onClick={()=>void action("save")}>Save draft</button>
      <button type="button" disabled={busy||version===null} onClick={()=>void action("publish")}>Publish design</button>
      <label>Restore revision <select value={restore} disabled={busy||dirty} onChange={e=>setRestore(e.target.value)}>
        <option value="">Choose revision</option>{history.map(h=><option key={h.id} value={h.id}>#{h.id}</option>)}</select></label>
      <button type="button" disabled={busy||dirty||!restore||version===null} onClick={()=>void action("rollback")}>Restore</button>
    </div>
    {error&&<p role="alert" className="ogcl-error">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    <div className="ogcl-components-grid">
      <aside className="ogcl-components-families" aria-label="Component families">
        <h3>Shared controls</h3>
        {COMPONENT_FAMILIES.filter(f=>!f.instance).map(f=><button key={f.id} type="button"
          aria-pressed={family===f.id} onClick={()=>{setFamily(f.id);setState("normal");}}>{f.label}</button>)}
        <h3>Instance overrides</h3>
        {COMPONENT_FAMILIES.filter(f=>f.instance).map(f=><button key={f.id} type="button"
          aria-pressed={family===f.id} onClick={()=>{setFamily(f.id);setState("normal");}}>{f.label}</button>)}
      </aside>
      <div className="ogcl-components-inspector">
        <h3>{selectedFamily.label}</h3>
        <label>Interaction state <select value={state} onChange={e=>setState(e.target.value)}>
          {COMPONENT_STATES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <div className="ogcl-component-preview">
          <style>{css}</style>
          <Sample key={family+state} family={family} state={state}/>
        </div>
        <p className="ogcl-components-hint">Preview uses real browser controls. Native dropdown menus, radio buttons and range thumbs have browser-specific styling limits. Unset values inherit the current site's styling.</p>
        <div className="ogcl-components-actions">
          <button type="button" disabled={busy||version===null||!Object.keys(styles).length}
            onClick={()=>setDraft(resetComponentState(draft,family,state))}>Reset entire state to inherited</button>
          <label>Find property <input value={filter} onChange={e=>setFilter(e.target.value)} type="search"/></label>
        </div>
        {[...new Set(properties.map(p=>p.group))].map(group=><fieldset key={group} disabled={busy||version===null}>
          <legend>{group}</legend>
          {properties.filter(p=>p.group===group).map(p=><PropertyField
            key={area+":"+p.key+":"+String(styles[p.key]??"")} property={p} value={styles[p.key]}
            onChange={value=>update(p.key,value)} disabled={busy||version===null}/>)}
        </fieldset>)}
      </div>
    </div>
  </section>;
}
