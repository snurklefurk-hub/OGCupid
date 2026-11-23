import React,{useState,useRef} from "react";
import {useSearchParams,NavLink} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {questions,PAGE_SIZE,PAGE_COUNT,archetypes,order,sides,originalWriteups,revivalSummaries,partialHistoricWriteups,historicalGuidance,historicalArtwork,historicCrops,scoreAnswers} from "./persona-content.mjs";

function PersonaArtwork({code,style}){
  const key=code+style;
  const label=archetypes[code][style][0];
  const art=historicalArtwork[key];
  const frame={display:"block",maxWidth:"100%",maxHeight:320};
  if(Number.isInteger(art?.spriteIndex)){
    return <span role="img" aria-label={label} style={{display:"block",width:145,aspectRatio:"100 / 220",
      backgroundImage:"url("+art.url+")",backgroundSize:"300% 100%",backgroundPosition:(art.spriteIndex*50)+"% 0"}}/>;
  }
  if(art)return <img src={art.url} alt={label} style={frame}/>;
  const crop=historicCrops[key];
  if(!crop)return null;
  const [file,width,height,x,y,cropWidth,cropHeight]=crop;
  return <svg role="img" aria-label={label} width={cropWidth} height={cropHeight}
    style={frame} viewBox={[x,y,cropWidth,cropHeight].join(" ")}>
    <image href={"/persona-assets/"+file} width={width} height={height} preserveAspectRatio="none"/>
  </svg>;
}

export default function PersonaQuiz({onboarding}){
  const [params,setParams]=useSearchParams();
  const shared=params.get("persona")||new URLSearchParams(window.location.search).get("persona")||"";
  const sharedCode=shared.slice(0,4);
  const {accountRequest,refresh}=useMemberSession();
  const [style,setStyle]=useState(shared.endsWith("f")||["B","f"].includes(params.get("style"))?"f":"m");
  const [result,setResult]=useState(Object.hasOwn(archetypes,sharedCode)?sharedCode:null);
  const [screen,setScreen]=useState(result?"result":"intro");
  const [catalogOrigin,setCatalogOrigin]=useState("intro");
  const [answers,setAnswers]=useState(()=>Array(questions.length).fill(null));
  const [page,setPage]=useState(0);
  const [saveState,setSaveState]=useState("");
  const [scored,setScored]=useState(null);
  const title=useRef(null);
  const focusTitle=()=>requestAnimationFrame(()=>title.current?.focus());
  const changeScreen=next=>{setScreen(next);focusTitle();};
  const visible=questions.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  const key=result+style;
  const art=historicalArtwork[key];
  const opposite=result?.split("").map((letter,i)=>sides[i].code.find(choice=>choice!==letter)).join("");

  async function save(code){
    setSaveState("saving");
    try {
      const response=await accountRequest("/onboarding","PUT",{step:"persona",answers,code});
      if(!response?.saved)throw Error("Save not confirmed");
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }
  function next(event){
    event.preventDefault();
    if(page<PAGE_COUNT-1){setPage(page+1);focusTitle();return;}
    const score=scoreAnswers(answers);
    setScored(score);setResult(score.code);changeScreen("result");
    void save(score.code);
  }
  function catalog(){
    setCatalogOrigin(screen);changeScreen("catalog");
  }
  function retake(){
    setParams({}, {replace:true});
    setAnswers(Array(questions.length).fill(null));setScored(null);setResult(null);
    setPage(0);setSaveState("");changeScreen("intro");
  }
  return <section className="ogcl-view ogcl-editorial">
    <header className="ogcl-view-head"><h1 ref={title} tabIndex={-1}>The Dating Persona Test</h1><p>40 questions. 32 dating personas.</p></header>
    <div className="ogcl-content-panel">
      {screen==="intro"&&<>
        <fieldset><legend><span data-ogc-edit-text="copy.persona.choose-your-dating-persona-results">Choose your Dating Persona results</span></legend>
          {["m","f"].map(value=><label key={value}><input type="radio" name="persona-style" checked={style===value} onChange={()=>setStyle(value)}/>{value==="m"?"Male":"Female"}</label>)}
        </fieldset>
        <button className="ogcl-button" onClick={()=>changeScreen("quiz")}><span data-ogc-edit-text="copy.persona.start-the-test">Start the test</span></button>{" "}
        <button className="ogcl-button" onClick={catalog}><span data-ogc-edit-text="copy.persona.see-all-32-personas">See all 32 personas</span></button>
      </>}
      {screen==="quiz"&&<form className="ogcl-account-form" onSubmit={next}>
        <p>Page {page+1} of {PAGE_COUNT} · {answers.filter(Number.isInteger).length} of {questions.length} answered</p>
        {visible.map((question,offset)=>{
          const index=page*PAGE_SIZE+offset;
          return <fieldset key={question.id}><legend>{index+1}. {question.prompt}</legend>
            {question.note&&<p>{question.note}</p>}
            {question.options.map((option,value)=><label className="ogcl-account-check" key={value}>
              <input type="radio" name={"persona-"+index} required checked={answers[index]===value}
                onChange={()=>setAnswers(previous=>previous.map((answer,i)=>i===index?value:answer))}/>{option.label}
            </label>)}
          </fieldset>;
        })}
        {page>0&&<button type="button" onClick={()=>{setPage(page-1);focusTitle();}}><span data-ogc-edit-text="copy.persona.back">Back</span></button>}
        <button>{page===PAGE_COUNT-1?"Reveal my persona":"Next questions"}</button>
      </form>}
      {screen==="catalog"&&<>
        <h2><span data-ogc-edit-text="copy.persona.all-32-dating-personas">All 32 dating personas</span></h2>
        <button className="ogcl-button" onClick={()=>changeScreen(catalogOrigin)}><span data-ogc-edit-text="copy.persona.back">Back</span></button>
        <ul>{order.flatMap(code=>["m","f"].map(value=><li key={code+value}>
          <button type="button" disabled={saveState==="saving"} onClick={()=>{setResult(code);setStyle(value);setScored(null);changeScreen("result");}}>{archetypes[code][value][0]} ({code+value})</button>
        </li>))}</ul>
      </>}
      {screen==="result"&&result&&<>
        <h2>{archetypes[result][style][0]}</h2>
        <p>{key} · {result.split("").map((letter,i)=>sides[i].labels[sides[i].code.indexOf(letter)]).join(" · ")}</p>
        {(art||historicCrops[key])&&<figure><PersonaArtwork code={result} style={style}/>
          {art?.source&&<figcaption><a href={art.source}>Original illustration source</a></figcaption>}</figure>}
        {(originalWriteups[key]||partialHistoricWriteups[key]||[]).map((paragraph,i)=><p key={i}>{paragraph}</p>)}
        {(revivalSummaries[key]||[archetypes[result].story]).map((paragraph,i)=><p key={i}>{paragraph}</p>)}
        <p>{archetypes[result][style][1]}</p>
        {opposite&&<p>Your exact opposite: {archetypes[opposite][style][0]} ({opposite+style}).</p>}
        {historicalGuidance[key]&&<><p>Always avoid: {historicalGuidance[key].avoid}</p><p>Consider: {historicalGuidance[key].consider}</p>
          {historicalGuidance[key].source&&<a href={historicalGuidance[key].source}>Archived result source</a>}</>}
        {scored&&<p>Directional scores: {sides.map((axis,i)=>axis.description+": "+scored.sum[i]).join(" · ")}</p>}
        <button className="ogcl-button" onClick={()=>setStyle(style==="m"?"f":"m")}><span data-ogc-edit-text="copy.persona.switch-result-style">Switch result style</span></button>{" "}
        <button className="ogcl-button" disabled={saveState==="saving"} onClick={retake}><span data-ogc-edit-text="copy.persona.retake-the-test">Retake the test</span></button>{" "}
        <button className="ogcl-button" disabled={saveState==="saving"} onClick={catalog}><span data-ogc-edit-text="copy.persona.see-all-personas">See all personas</span></button>
        <p><NavLink to={"/persona?persona="+key}><span data-ogc-edit-text="copy.persona.link-to-this-result">Link to this result</span></NavLink></p>
        {saveState==="saving"&&<p role="status">Saving your Persona result…</p>}
        {saveState==="saved"&&<p role="status">Saved to your OG Cupid profile. {onboarding&&<NavLink to="/onboarding" onClick={()=>void refresh()}><span data-ogc-edit-text="copy.persona.continue-onboarding">Continue onboarding</span></NavLink>}</p>}
        {saveState==="error"&&scored&&<p role="alert">Your result couldn’t be saved. <button className="ogcl-button" onClick={()=>void save(scored.code)}><span data-ogc-edit-text="copy.persona.retry-save">Retry save</span></button></p>}
      </>}
    </div>
  </section>;
}
