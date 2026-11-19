import React,{useEffect,useMemo,useState} from "react";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {loadPublishedBank} from "./published-question-bank.mjs";
import {buildAnswer,checkedSavedAnswers,QUESTION_IMPORTANCE} from "./question-serving.mjs";
import {pageMembers} from "./member-directory.mjs";

const SIZE=24;
function answerLabel(question,optionId){
  const index=question.optionIds.indexOf(optionId);
  return index<0?"Unknown answer":question.options[index];
}
function AnswerEditor({question,existing,onSave,onCancel,busy}){
  const [selected,setSelected]=useState(existing.optionId);
  const [accepted,setAccepted]=useState([...existing.acceptableOptions]);
  const [importance,setImportance]=useState(existing.importance);
  const [privateAnswer,setPrivateAnswer]=useState(existing.isPrivate);
  const [note,setNote]=useState(existing.note);
  const [error,setError]=useState("");
  const changeAccepted=(option,checked)=>{
    setAccepted(previous=>checked?[...new Set([...previous,option])]:previous.filter(x=>x!==option));
    if(importance===0)setImportance(1);
  };
  async function save(e){
    e.preventDefault();setError("");
    try{
      const effective=accepted.includes(selected)?accepted:[...accepted,selected];
      const value=buildAnswer({question,optionId:selected,acceptableOptions:effective,
        importance,isPrivate:privateAnswer,note});
      await onSave(value);
    }catch{setError("This answer couldn't be saved. Your changes are still here.");}
  }
  return <form className="ogcl-profile-question-edit" onSubmit={save}>
    <fieldset><legend>Your answer</legend>
      {question.options.map((title,i)=><label key={question.optionIds[i]}>
        <input type="radio" name={"answer-"+question.id} disabled={busy}
          checked={selected===question.optionIds[i]}
          onChange={()=>setSelected(question.optionIds[i])}/> {title}
      </label>)}
    </fieldset>
    <fieldset><legend>Answers you'd accept</legend>
      {question.options.map((title,i)=><label key={question.optionIds[i]}>
        <input type="checkbox" disabled={busy} checked={accepted.includes(question.optionIds[i])}
          onChange={e=>changeAccepted(question.optionIds[i],e.target.checked)}/> {title}
      </label>)}
      <label><input type="checkbox" disabled={busy} checked={importance===0}
        onChange={e=>{
          setImportance(e.target.checked?0:1);
          if(e.target.checked)setAccepted([...question.optionIds]);
        }}/> Any of the above — irrelevant</label>
    </fieldset>
    <fieldset disabled={busy||importance===0}><legend>Importance</legend>
      <div className="ogcl-question-importance">{QUESTION_IMPORTANCE.filter(x=>x.value!==0).map(x=>
        <label key={x.value}><input type="radio" name={"importance-"+question.id}
          checked={importance===x.value} onChange={()=>setImportance(x.value)}/> {x.label}</label>)}</div>
    </fieldset>
    <label className="ogcl-question-note">Optional explanation
      <textarea value={note} maxLength={400} rows={3} disabled={busy}
        onChange={e=>setNote(e.target.value)}/>
    </label>
    <label><input type="checkbox" checked={privateAnswer} disabled={busy}
      onChange={e=>setPrivateAnswer(e.target.checked)}/> Keep my answer private</label>
    {error&&<p role="alert" className="ogcl-error">{error}</p>}
    <div className="ogcl-essay-actions"><button type="submit" disabled={busy}>{busy?"Saving…":"Save answer"}</button>
      <button type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>;
}
export default function ProfileQuestions({profile}){
  const {loadMatchAnswers,saveMatchAnswer}=useMemberSession();
  const [bank,setBank]=useState(null),[own,setOwn]=useState(new Map());
  const [visible,setVisible]=useState(profile.publicAnswers);
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  const [filter,setFilter]=useState("all"),[page,setPage]=useState(1);
  const [editing,setEditing]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");

  useEffect(()=>{
    let mounted=true;setBank(null);setOwn(new Map());setVisible(profile.publicAnswers);
    setFilter("all");setPage(1);setEditing("");setNotice("");setError("");setLoading(true);
    void loadPublishedBank().then(async questions=>{
      const result=await Promise.allSettled([loadMatchAnswers()]);
      if(!mounted)return;
      setBank(questions);
      if(result[0].status==="fulfilled")
        setOwn(checkedSavedAnswers(result[0].value,questions));
      else if(profile.isOwner)
        setError("Your saved answer details couldn't load. Editing is temporarily unavailable.");
      setLoading(false);
    }).catch(()=>{
      if(mounted){setError("The published question text couldn't load.");setLoading(false);}
    });
    return()=>{mounted=false;};
  },[profile.userId,profile.isOwner,loadMatchAnswers]);

  const items=useMemo(()=>{
    if(!bank)return [];
    const lookup=new Map(bank.map(q=>[q.id,q]));
    return visible.map(answer=>({answer,question:lookup.get(answer.questionId)}))
      .filter(x=>x.question&&x.question.optionIds.includes(x.answer.optionId)&&
        (filter==="all"||own.has(x.answer.questionId)));
  },[visible,bank,filter,own]);
  const pagination=pageMembers(items,page,SIZE);

  async function save(answer){
    setBusy(true);setError("");setNotice("");
    try{
      await saveMatchAnswer(answer);
      setOwn(prev=>new Map(prev).set(answer.questionId,Object.freeze(answer)));
      setVisible(prev=>prev.map(item=>item.questionId===answer.questionId
        ?{...item,optionId:answer.optionId,note:answer.note,isPrivate:answer.isPrivate}:item));
      setEditing("");setNotice("Answer saved.");
    }finally{setBusy(false);}
  }
  return <div className="ogcl-profile-subpage ogcl-answered-questions">
    <h2>Questions</h2>
    {loading&&<p role="status">Loading published questions…</p>}
    {error&&<p role="alert" className="ogcl-error">{error}</p>}
    {notice&&<p role="status" className="ogcl-save-confirmation">{notice}</p>}
    {bank&&<>
      <div className="ogcl-answered-controls">
        <label>Show
          <select value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);setEditing("");}}>
            <option value="all">All visible answered questions</option>
            <option value="both">Questions we've both answered</option>
          </select>
        </label>
        <span>{items.length} answered question{items.length===1?"":"s"}</span>
      </div>
      {pagination.items.length===0&&<p>No answered questions in this view yet.</p>}
      {pagination.items.map(({answer,question})=>{
        const myAnswer=own.get(question.id);
        const isEditing=profile.isOwner&&editing===question.id;
        const agreed=myAnswer&&myAnswer.acceptableOptions.includes(answer.optionId);
        return <article className="ogcl-answered-item" key={question.id}>
          <div className="ogcl-answered-heading">
            <h3>{question.prompt}</h3>
            {profile.isOwner&&myAnswer&&<button type="button" className="ogcl-profile-pencil"
              aria-label={"Edit answer to "+question.prompt} title="Edit this answer"
              disabled={busy} onClick={()=>{setEditing(question.id);setNotice("");}}>✎</button>}
            {profile.isOwner&&answer.isPrivate&&<small title="Only you can see this answer" aria-label="Private answer">🔒 Private</small>}
          </div>
          {isEditing?<AnswerEditor key={question.id} question={question} existing={myAnswer}
            busy={busy} onSave={save} onCancel={()=>setEditing("")}/>:
            <>
              <p className="ogcl-answered-selected"><strong>{profile.isOwner?"Your answer":"Their answer"}:</strong> {answerLabel(question,answer.optionId)}</p>
              {answer.note&&<p className="ogcl-answered-note">{answer.note}</p>}
              {!profile.isOwner&&myAnswer&&<div className={"ogcl-answered-compare "+(agreed?"yes":"no")}>
                <span>{agreed?"✓ Acceptable to you":"× Outside your accepted answers"}</span>
                <span>Your answer: {answerLabel(question,myAnswer.optionId)}</span>
              </div>}
            </>}
        </article>;
      })}
      {pagination.totalPages>1&&<nav aria-label="Answered question pages" className="ogcl-pages">
        {Array.from({length:pagination.totalPages},(_,i)=><button key={i} type="button"
          aria-current={pagination.page===i+1?"page":undefined}
          onClick={()=>{setPage(i+1);setEditing("");}}>{i+1}</button>)}
      </nav>}
    </>}
  </div>;
}
