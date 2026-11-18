import React,{useEffect,useMemo,useState} from "react";
import {NavLink} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {checkedQuestionBank,checkedSavedAnswers,nextQuestion,buildAnswer,QUESTION_IMPORTANCE} from "./question-serving.mjs";

// Public, owner-curated static bank; served from the Vite staging build.
// The sensitive ANSWERS remain on the authenticated Neon member service.
let bankPromise;
function loadPublishedBank() {
  if(window.OGCQuestionBank?.questions) {
    return Promise.resolve(checkedQuestionBank(window.OGCQuestionBank.questions));
  }
  if(bankPromise)return bankPromise;
  bankPromise=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.async=true;
    script.src=import.meta.env.BASE_URL+"questions/question-bank.js";
    script.onload=()=>{
      try{resolve(checkedQuestionBank(window.OGCQuestionBank?.questions));}
      catch(error){reject(error);}
    };
    script.onerror=()=>reject(Error("Published questions couldn't be loaded"));
    document.head.append(script);
  }).catch(error=>{bankPromise=null;throw error;});
  return bankPromise;
}

export default function MatchQuestions() {
  const {loadMatchAnswers,saveMatchAnswer} = useMemberSession();
  const [bank,setBank] = useState(null);
  const [answers,setAnswers] = useState(new Map());
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [selected,setSelected] = useState("");
  const [acceptable,setAcceptable] = useState([]);
  const [importance,setImportance] = useState(1);
  const [isPrivate,setIsPrivate] = useState(false);
  const [note,setNote] = useState("");
  const current = useMemo(()=>bank?nextQuestion(bank,answers):null,[bank,answers]);

  useEffect(()=>{
    let alive=true;
    void Promise.all([loadPublishedBank(),loadMatchAnswers()]).then(([questions,response])=>{
      if(!alive)return;
      setBank(questions);
      setAnswers(checkedSavedAnswers(response,questions));
      setLoading(false);
    }).catch(()=>{
      if(!alive)return;
      setError("Your match questions couldn't be loaded. No answers have been changed.");
      setLoading(false);
    });
    return ()=>{alive=false;};
  },[loadMatchAnswers]);

  useEffect(()=>{
    setSelected("");setAcceptable([]);setImportance(1);setIsPrivate(false);setNote("");
  },[current?.question.id]);

  async function submit(event) {
    event.preventDefault();
    if(busy || !current || !selected)return;
    let response;
    try {
      const accepted=acceptable.includes(selected)?acceptable:[...acceptable,selected];
      response=buildAnswer({
        question:current.question,optionId:selected,acceptableOptions:accepted,
        importance,isPrivate,note
      });
    } catch {
      setError("Choose a valid answer and acceptable match answers.");
      return;
    }
    setBusy(true);setError("");
    try {
      await saveMatchAnswer(response);
      setAnswers(previous=>new Map(previous).set(response.questionId,response));
    } catch {
      setError("Answer wasn't saved. Your choices are still here; please retry.");
    } finally {setBusy(false);}
  }

  const progress=bank ? answers.size : 0;
  const stageLabel=current ? current.stage===10 ? "First 10" : "Next "+current.stage : "Complete";
  return <section className="ogcl-view">
    <header className="ogcl-view-head">
      <h1>Match Questions</h1>
      <p>Learn what matters to each other, one answer at a time.</p>
    </header>
    <div className="ogcl-content-panel">
      {loading && <p role="status">Loading the original question collection and your saved answers…</p>}
      {error && <p className="ogcl-error" role="alert">{error}</p>}
      {bank && <>
        <div className="ogcl-question-progress">
          <strong>{stageLabel}</strong>
          <span>{progress} / {bank.length} answered</span>
          <progress max={bank.length} value={progress} aria-label="Match questions answered" />
        </div>
        {current ? <form className="ogcl-question-form" onSubmit={submit}>
          <div className="ogcl-question-topic">{current.question.topic}</div>
          <h2>{current.question.prompt}</h2>
          {current.detour && <p className="ogcl-quiet">A question from a later set.</p>}
          <fieldset>
            <legend>Your answer</legend>
            {current.question.options.map((label,index)=>{
              const id=current.question.optionIds[index];
              return <label className="ogcl-question-answer" key={id}>
                <input type="radio" name="answer" value={id} checked={selected===id} disabled={busy}
                  onChange={()=>{
                    setSelected(id);
                    setAcceptable(previous=>previous.includes(id)?previous:[...previous,id]);
                  }} />
                <span>{label}</span>
              </label>;
            })}
          </fieldset>
          <fieldset>
            <legend>Answers you'd accept from someone else</legend>
            <p className="ogcl-quiet">Choose all that you'd consider compatible.</p>
            {current.question.options.map((label,index)=>{
              const id=current.question.optionIds[index];
              return <label className="ogcl-question-answer" key={id}>
                <input type="checkbox" value={id} checked={acceptable.includes(id)} disabled={busy}
                  onChange={event=>setAcceptable(previous=>
                    event.target.checked?[...new Set([...previous,id])]:previous.filter(v=>v!==id))} />
                <span>{label}</span>
              </label>;
            })}
          </fieldset>
          <fieldset>
            <legend>How important is this question?</legend>
            <div className="ogcl-question-importance">
              {QUESTION_IMPORTANCE.map(option=>
                <label key={option.value}>
                  <input type="radio" name="importance" value={option.value}
                    checked={importance===option.value} disabled={busy}
                    onChange={()=>setImportance(option.value)} />
                  {option.label}
                </label>)}
            </div>
          </fieldset>
          <label className="ogcl-question-note">Optional explanation (up to 400 characters)
            <textarea maxLength={400} rows={3} value={note} disabled={busy}
              onChange={event=>setNote(event.target.value)} />
          </label>
          <label className="ogcl-question-private">
            <input type="checkbox" checked={isPrivate} disabled={busy}
              onChange={event=>setIsPrivate(event.target.checked)} />
            Keep my answer private on my profile
          </label>
          <button type="submit" className="ogcl-button" disabled={busy || !selected}>
            {busy?"Saving answer…":"Save answer & next question"}
          </button>
        </form> : <>
          <h2>All 410 answered</h2>
          <p>All published match questions have been saved to your member account.</p>
          <p><NavLink to="/matches">Explore your matches</NavLink></p>
        </>}
      </>}
    </div>
  </section>;
}
