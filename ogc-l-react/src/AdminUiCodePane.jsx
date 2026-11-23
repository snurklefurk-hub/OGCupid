import React,{useRef} from "react";

export default function AdminUiCodePane({
  language,changeLanguage,source,edit,dirty,error,locked,scopeLabel,apply,discard,
}){
  const lineNumbers=useRef(null);
  const lineCount=source.split("\n").length;

  function editKey(event){
    if((event.ctrlKey||event.metaKey)&&event.key==="Enter"){
      event.preventDefault();
      if(!locked&&dirty)apply();
    }
  }

  return <section className="ogcl-studio-code" aria-label="Code editor">
    <div className="ogcl-studio-code-tabs" role="group" aria-label="Code format">
      <button type="button" aria-pressed={language==="css"} onClick={()=>changeLanguage("css")}
        disabled={dirty||locked}>CSS</button>
      <button type="button" aria-pressed={language==="json"} onClick={()=>changeLanguage("json")}
        disabled={dirty||locked}>Design JSON</button>
    </div>
    <p className="ogcl-studio-code-scope" id="ogcl-studio-code-help">
      {language==="css"?scopeLabel+" CSS · Remove a declaration to reset it.":"All pages · Palette, regions, text and custom blocks."}
    </p>
    <div className="ogcl-studio-source" key={language}>
      <pre ref={lineNumbers} aria-hidden="true">{Array.from({length:lineCount},(_,i)=>i+1).join("\n")}</pre>
      <textarea aria-label={language==="css"?"CSS source":"Design JSON source"} value={source}
        aria-describedby={error?"ogcl-studio-code-help ogcl-studio-code-error":"ogcl-studio-code-help"}
        aria-invalid={Boolean(error)} spellCheck={false} readOnly={locked} wrap="off"
        onChange={event=>edit(event.target.value)} onKeyDown={editKey}
        onScroll={event=>{if(lineNumbers.current)lineNumbers.current.scrollTop=event.currentTarget.scrollTop;}}/>
    </div>
    {error&&<p role="alert" className="ogcl-studio-code-error" id="ogcl-studio-code-error">{error}</p>}
    <div className="ogcl-studio-code-actions">
      <button type="button" onClick={discard} disabled={!dirty||locked}>Discard code edits</button>
      <button className="ogcl-studio-accent" type="button" onClick={apply} disabled={!dirty||locked}>Apply to draft</button>
    </div>
  </section>;
}
