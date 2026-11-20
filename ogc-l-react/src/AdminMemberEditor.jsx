import React,{useEffect,useMemo,useRef,useState} from "react";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {LIVE_ESSAYS} from "./member-essays.mjs";
import {PROFILE_SETTINGS_FIELDS} from "./member-settings.mjs";
import {QUESTION_IMPORTANCE} from "./question-serving.mjs";
import {loadPublishedBank} from "./published-question-bank.mjs";
import {preparePhoto} from "./PhotoManager.jsx";

const toColumn=key=>key.replace(/[A-Z]/g,char=>"_"+char.toLowerCase());
const PROFILE_FIELDS=[
  ...LIVE_ESSAYS.map(x=>({...x,column:toColumn(x.key),section:"Essays"})),
  ...PROFILE_SETTINGS_FIELDS.map(x=>({...x,column:toColumn(x.key),section:"Details"})),
  {key:"interestedIn",column:"interested_in",label:"Interested in (comma-separated)",max:200,section:"Preferences"},
  {key:"relationshipGoal",column:"relationship_goal",label:"Relationship intentions (comma-separated)",max:200,section:"Preferences"},
  {key:"lookingFor",column:"looking_for",label:"Legacy looking-for summary",max:200,section:"Preferences"}
];
const urlFor=(memberId,path)=>"/admin/members/"+memberId+"/"+path;
const stamp=raw=>raw?new Date(raw).toLocaleString():"—";
const initialAnswer=()=>({optionId:"",acceptableOptions:[],importance:1,isPrivate:false,note:""});

export default function AdminMemberEditor({member,onClose}){
  const {adminRequest}=useMemberSession();
  const [revision,setRevision]=useState(0);
  const photoUrls=useRef(new Map());
  const [content,setContent]=useState(null);
  const [drafts,setDrafts]=useState({});
  const [images,setImages]=useState({});
  const [bank,setBank]=useState([]);
  const [questionId,setQuestionId]=useState("");
  const [answer,setAnswer]=useState(initialAnswer);
  const [minAge,setMinAge]=useState("");
  const [maxAge,setMaxAge]=useState("");
  const [tab,setTab]=useState("profile");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const memberId=member.id;
  const path=part=>urlFor(memberId,part);

  // One content fetch on opening a member. An explicit Reload is the only
  // action that re-fetches all saved profile/answer metadata.
  useEffect(()=>{
    let alive=true;
    setLoading(true);setError("");
    void adminRequest(urlFor(memberId,"content")).then(data=>{
      if(!alive)return;
      setContent(data);
      setDrafts(data.profile||{});
      setMinAge(data.profile?.preferred_age_min??"");
      setMaxAge(data.profile?.preferred_age_max??"");
    }).catch(e=>{
      if(alive)setError(e?.code==="forbidden"?"Administrator access was revoked.":
        "Could not load this member's saved content.");
    }).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[memberId,adminRequest,revision]);

  // Sensitive photo blobs live only for this editor's lifetime. Text and
  // answer edits never clear or re-download them.
  useEffect(()=>()=>{
    for(const url of photoUrls.current.values())URL.revokeObjectURL(url);
    photoUrls.current.clear();
  },[memberId]);

  // The published question definitions are public static data. Load them
  // only when the administrator actually opens Questions.
  useEffect(()=>{
    if(tab!=="questions"||bank.length)return;
    let alive=true;
    void loadPublishedBank().then(questions=>{
      if(alive)setBank(questions);
    }).catch(()=>{if(alive)setError("Could not load published questions.");});
    return()=>{alive=false;};
  },[tab,bank.length]);

  const photoIds=(content?.photos||[]).map(photo=>photo.id).join("|");
  useEffect(()=>{
    if(tab!=="photos"||!content)return;
    let alive=true;
    for(const photo of content.photos){
      if(photoUrls.current.has(photo.id))continue;
      void adminRequest(urlFor(memberId,"photos/"+photo.id+"/bytes")).then(blob=>{
        if(!alive||photoUrls.current.has(photo.id))return;
        const objectUrl=URL.createObjectURL(blob);
        photoUrls.current.set(photo.id,objectUrl);
        setImages(old=>({...old,[photo.id]:objectUrl}));
      }).catch(()=>{/* A missing private image gets a placeholder. */});
    }
    return()=>{alive=false;};
  },[tab,memberId,photoIds,adminRequest]);

  function updatePreview(id,blob){
    const old=photoUrls.current.get(id);
    if(old)URL.revokeObjectURL(old);
    const url=URL.createObjectURL(blob);
    photoUrls.current.set(id,url);
    setImages(state=>({...state,[id]:url}));
  }
  function removePreview(id){
    const old=photoUrls.current.get(id);
    if(old)URL.revokeObjectURL(old);
    photoUrls.current.delete(id);
    setImages(state=>{
      const next={...state};delete next[id];return next;
    });
  }

  const selected=useMemo(()=>bank.find(x=>x.id===questionId),[bank,questionId]);
  const answerRows=useMemo(()=>content?.answers||[],[content]);
  const answerById=useMemo(()=>new Map(answerRows.map(x=>[x.questionId,x])),[answerRows]);
  const questionLookup=useMemo(()=>new Map(bank.map(x=>[x.id,x])),[bank]);
  const supported=!!content?.profile;
  const canSave=!busy;

  function chooseQuestion(id){
    setQuestionId(id);setError("");setNotice("");
    const saved=answerById.get(id);
    setAnswer(saved?{
      optionId:saved.optionId,
      acceptableOptions:Array.isArray(saved.acceptableOptions)?[...saved.acceptableOptions]:[],
      importance:saved.importance,
      isPrivate:saved.isPrivate,
      note:saved.note||""
    }:initialAnswer());
  }
  async function perform(work,success,applyResult=()=>{}){
    if(!canSave)return;
    setBusy(true);setError("");setNotice("");
    try{
      const result=await work();
      // Update only the confirmed record; don't invalidate this member's
      // entire profile, answers, question bank and protected photo previews.
      applyResult(result);
      setNotice(success);
    }catch(e){
      setError(e?.code==="forbidden"?"Administrator access was revoked.":
        e?.message||"The edit wasn't saved.");
    }finally{setBusy(false);}
  }
  function saveField(field){
    const value=String(drafts[field.column]??"").trim();
    void perform(()=>adminRequest(path("field"),"PUT",{
      field:field.column,value
    }),field.label+" updated.",()=>{
      setContent(old=>({...old,profile:{...old.profile,[field.column]:value}}));
      setDrafts(old=>({...old,[field.column]:value}));
    });
  }
  function saveAgeRange(e){
    e.preventDefault();
    const empty=minAge===""&&maxAge==="";
    const min=empty?null:Number(minAge),max=empty?null:Number(maxAge);
    if(!empty && (!Number.isInteger(min)||!Number.isInteger(max)||
       min<18||max>99||min>max)){
      setError("Choose an age range from 18–99, minimum first.");return;
    }
    void perform(()=>adminRequest(path("age-range"),"PUT",{min,max}),
      "Age preferences updated.",()=>{
        setContent(old=>({...old,profile:{...old.profile,
          preferred_age_min:min,preferred_age_max:max}}));
      });
  }
  function saveAnswer(e){
    e.preventDefault();
    if(!selected||!selected.optionIds.includes(answer.optionId)){
      setError("Select a valid answer.");return;
    }
    if(answer.acceptableOptions.some(x=>!selected.optionIds.includes(x))){
      setError("An acceptable answer is no longer available.");return;
    }
    const saved={questionId,optionId:answer.optionId,
      acceptableOptions:[...answer.acceptableOptions],
      importance:answer.importance,isPrivate:answer.isPrivate,note:answer.note};
    void perform(()=>adminRequest(path("answers"),"PUT",saved),
      "Question answer saved.",()=>{
        setContent(old=>({...old,answers:[
          ...old.answers.filter(x=>x.questionId!==saved.questionId),
          {...saved,updatedAt:new Date().toISOString()}
        ].sort((a,b)=>a.questionId.localeCompare(b.questionId))}));
      });
  }
  function deleteAnswer(){
    if(!answerById.has(questionId)||!window.confirm(
      "Delete this member's saved answer? This changes compatibility results."))return;
    const deletedQuestion=questionId;
    void perform(()=>adminRequest(path("answers/"+deletedQuestion),"DELETE"),
      "Question answer deleted.",()=>{
        setContent(old=>({...old,answers:old.answers.filter(x=>x.questionId!==deletedQuestion)}));
        setQuestionId("");setAnswer(initialAnswer());
      });
  }
  async function savePhoto(file,replaceId=null){
    if(!file||!canSave)return;
    await perform(async()=>{
      const jpeg=await preparePhoto(file);
      const form=new FormData();
      form.append("photo",jpeg,"profile.jpg");
      const endpoint=replaceId?"photos/"+replaceId+"/replace":"photos";
      const saved=await adminRequest(path(endpoint),replaceId?"PUT":"POST",form);
      if(replaceId ? saved!==true : !saved?.id)
        throw Error("The photo update was not confirmed.");
      return {jpeg,saved};
    },replaceId?"Photo replaced.":"Photo uploaded.",({jpeg,saved})=>{
      const id=replaceId||saved.id;
      updatePreview(id,jpeg); // Use the exact uploaded JPEG, no second GET.
      if(!replaceId)setContent(old=>({...old,photos:[...old.photos,{
        id,sortOrder:saved.sortOrder,isPrimary:saved.isPrimary,
        createdAt:new Date().toISOString()
      }].sort((a,b)=>a.sortOrder-b.sortOrder)}));
    });
  }
  function photoAction(photo,operation){
    if(operation==="delete"&&!window.confirm("Delete this member's photo?"))return;
    const endpoint="photos/"+photo.id+(operation==="primary"?"/primary":"");
    void perform(async()=>{
      const result=await adminRequest(path(endpoint),operation==="primary"?"POST":"DELETE");
      if(operation==="primary" ? result!==true : result?.deleted!==true)
        throw Error("The photo change was not confirmed.");
      return result;
    },operation==="primary"?"Primary photo updated.":"Photo deleted.",()=>{
      if(operation==="primary"){
        setContent(old=>({...old,photos:old.photos.map(item=>({
          ...item,isPrimary:item.id===photo.id
        }))}));
      }else{
        removePreview(photo.id);
        setContent(old=>({...old,photos:old.photos.filter(item=>item.id!==photo.id)}));
      }
    });
  }

  return <section className="ogcl-admin-section ogcl-admin-member-editor" aria-label={"Edit member "+member.name}>
    <div className="ogcl-admin-section-head">
      <div><h2>Edit member: {member.name}</h2>
        <p className="ogcl-admin-muted">{member.email} · {member.role} · joined {stamp(member.createdAt)}</p></div>
      <button type="button" className="ogcl-button ogcl-secondary" onClick={onClose}>Back to members</button>
    </div>
    <p>These are saved changes to another member's account, not a preview. Every change is logged.
      Signup name, birth date, account role, and credentials remain outside this editor.</p>
    <div className="ogcl-admin-toolbar"><nav aria-label="Member editing sections">
      {["profile","photos","questions"].map(id=><button type="button" key={id}
        className={tab===id?"selected":""} onClick={()=>{setTab(id);setError("");}}>
        {id[0].toUpperCase()+id.slice(1)}</button>)}
    </nav><button type="button" className="ogcl-button ogcl-secondary"
      onClick={()=>setRevision(x=>x+1)} disabled={busy}>Reload saved data</button></div>
    {error&&<p role="alert" className="ogcl-error">{error}</p>}
    {notice&&<p role="status" className="ogcl-save-confirmation">{notice}</p>}
    {loading&&<p role="status">Loading protected member records…</p>}
    {!loading&&!content&&<p>Member data is unavailable.</p>}
    {!loading&&content&&!supported&&<p>This account has not created a saved profile yet.</p>}
    {!loading&&content&&tab==="profile"&&supported&&<>
      <p className="ogcl-admin-muted">Signup name: {content.profile.display_name} · age: {content.profile.age??"—"}
        · location: {content.profile.city_region||"—"}. These identity/location fields are not changed here.</p>
      {["Essays","Details","Preferences"].map(section=><div key={section}>
        <h3>{section}</h3>
        <div className="ogcl-admin-editor-fields">{PROFILE_FIELDS.filter(f=>f.section===section).map(field=>{
          const value=drafts[field.column]??"";
          return <div className="ogcl-admin-editor-field" key={field.column}>
            <label>{field.label}
              {field.max>=1000?<textarea maxLength={field.max} rows={4}
                value={value} onChange={e=>setDrafts(d=>({...d,[field.column]:e.target.value}))}/>:
                field.options?<select value={value} onChange={e=>setDrafts(d=>({...d,[field.column]:e.target.value}))}>
                  <option value="">— None —</option>
                  {value&&!field.options.includes(value)&&<option value={value}>{value} (saved legacy value)</option>}
                  {field.options.map(v=><option key={v} value={v}>{v}</option>)}
                </select>:<input maxLength={field.max} value={value}
                  onChange={e=>setDrafts(d=>({...d,[field.column]:e.target.value}))}/>}
            </label>
            <button type="button" className="ogcl-button ogcl-secondary" disabled={!canSave||
              value===(content.profile[field.column]??"")}
              onClick={()=>saveField(field)}>Save</button>
          </div>;
        })}</div>
      </div>)}
      <form className="ogcl-admin-age-range" onSubmit={saveAgeRange}>
        <h3>Preferred age range</h3>
        <label>Minimum<input type="number" min={18} max={99} value={minAge}
          onChange={e=>setMinAge(e.target.value)}/></label>
        <label>Maximum<input type="number" min={18} max={99} value={maxAge}
          onChange={e=>setMaxAge(e.target.value)}/></label>
        <button type="submit" className="ogcl-button" disabled={!canSave}>Save ages</button>
      </form>
    </>}
    {!loading&&content&&tab==="photos"&&<>
      <p>{content.photos.length} of 5 photos. The stored images remain protected by the member API.</p>
      {supported&&<label className="ogcl-admin-photo-upload">Add a photo
        <input type="file" accept="image/*" disabled={!canSave||content.photos.length>=5}
          onChange={e=>{const file=e.target.files?.[0];e.target.value="";
            if(file)void savePhoto(file);}}/></label>}
      <div className="ogcl-admin-photo-grid">
        {content.photos.map((photo,index)=><article key={photo.id} className="ogcl-admin-photo-card">
          {images[photo.id]?<img src={images[photo.id]} alt={"Saved member photo "+(index+1)}/>:
            <p>Photo preview unavailable</p>}
          <strong>{photo.isPrimary?"Primary photo":"Photo "+(index+1)}</strong>
          <label>Replace image<input type="file" accept="image/*" disabled={!canSave}
            onChange={e=>{const file=e.target.files?.[0];e.target.value="";
              if(file)void savePhoto(file,photo.id);}}/></label>
          <div>
            {!photo.isPrimary&&<button type="button" disabled={!canSave}
              onClick={()=>photoAction(photo,"primary")}>Make primary</button>}
            <button type="button" disabled={!canSave}
              onClick={()=>photoAction(photo,"delete")}>Delete</button>
          </div>
        </article>)}
      </div>
    </>}
    {!loading&&content&&tab==="questions"&&<>
      <p>{answerRows.length} saved answers. Private answers and accepted partner choices are visible only to the authorized admin.</p>
      <div className="ogcl-admin-question-picker"><label>Choose a published question
        <select value={questionId} onChange={e=>chooseQuestion(e.target.value)}>
          <option value="">Select a question…</option>
          {bank.map(q=><option key={q.id} value={q.id}>
            {answerById.has(q.id)?"✓ ":""}{q.prompt}</option>)}
        </select></label>
      </div>
      {selected&&<form className="ogcl-admin-question-form" onSubmit={saveAnswer}>
        <h3>{selected.prompt}</h3>
        <fieldset><legend>Member's answer</legend>
          {selected.optionIds.map((id,i)=><label key={id}><input type="radio"
            name={"admin-answer-"+questionId} checked={answer.optionId===id}
            disabled={busy} onChange={()=>setAnswer(a=>({...a,optionId:id,
              acceptableOptions:a.acceptableOptions.includes(id)?a.acceptableOptions:[...a.acceptableOptions,id]}))}/>
            {selected.options[i]}</label>)}
        </fieldset>
        <fieldset><legend>Answers this member accepts</legend>
          {selected.optionIds.map((id,i)=><label key={id}><input type="checkbox" disabled={busy}
            checked={answer.acceptableOptions.includes(id)}
            onChange={e=>setAnswer(a=>({...a,acceptableOptions:e.target.checked?
              [...a.acceptableOptions,id]:a.acceptableOptions.filter(x=>x!==id)}))}/>
            {selected.options[i]}</label>)}
        </fieldset>
        <label>Importance<select value={answer.importance}
          onChange={e=>setAnswer(a=>({...a,importance:Number(e.target.value)}))}>
          {QUESTION_IMPORTANCE.map(x=><option value={x.value} key={x.value}>{x.label}</option>)}
        </select></label>
        <label>Explanation<textarea rows={3} maxLength={400} value={answer.note}
          onChange={e=>setAnswer(a=>({...a,note:e.target.value}))}/></label>
        <label><input type="checkbox" checked={answer.isPrivate}
          onChange={e=>setAnswer(a=>({...a,isPrivate:e.target.checked}))}/> Private answer</label>
        <div className="ogcl-admin-action-buttons">
          <button type="submit" className="ogcl-button" disabled={!canSave||!answer.optionId}>Save answer</button>
          {answerById.has(questionId)&&<button type="button" className="ogcl-button ogcl-secondary"
            disabled={!canSave} onClick={deleteAnswer}>Delete saved answer</button>}
        </div>
      </form>}
      <h3>Saved answers</h3>
      <div className="ogcl-admin-answers-list">
        {answerRows.map(row=><button key={row.questionId} type="button"
          onClick={()=>chooseQuestion(row.questionId)}>
          <strong>{questionLookup.get(row.questionId)?.prompt||row.questionId}</strong>
          <small>Updated {stamp(row.updatedAt)} {row.isPrivate?"· Private":""}</small>
        </button>)}
        {answerRows.length===0&&<p>No answers saved.</p>}
      </div>
    </>}
  </section>;
}
