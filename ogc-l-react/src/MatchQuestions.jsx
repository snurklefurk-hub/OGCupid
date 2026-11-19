import React,{useEffect,useMemo,useState} from "react";
import {NavLink} from "react-router-dom";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {loadPublishedBank} from "./published-question-bank.mjs";
import {checkedSavedAnswers,nextQuestion,buildAnswer,QUESTION_IMPORTANCE} from "./question-serving.mjs";

export default function MatchQuestions() {
  const {kind,loadMatchAnswers,saveMatchAnswer} = useMemberSession();
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
  const [reviewId,setReviewId] = useState("");
  const [savedNotice,setSavedNotice] = useState("");
  const next = useMemo(()=>bank?nextQuestion(bank,answers):null,[bank,answers]);
  const selectedReview = reviewId && bank?.find(q=>q.id===reviewId);
  const current = selectedReview ? {question:selectedReview,stage:null,detour:false} : next;

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
    // Only the owner can see their own saved answers, through /answers.
    const prior=reviewId?answers.get(reviewId):null;
    setSelected(prior?.optionId||"");
    setAcceptable(prior?[...prior.acceptableOptions]:[]);
    setImportance(prior?.importance??1);
    setIsPrivate(prior?.isPrivate??false);
    setNote(prior?.note||"");
    setSavedNotice("");
  },[current?.question.id,reviewId]);

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
    setBusy(true);setError("");setSavedNotice("");
    try {
      await saveMatchAnswer(response);
      setAnswers(previous=>new Map(previous).set(response.questionId,response));
      setSavedNotice(reviewId?"Saved changes to your answer.":"Answer saved to your account.");
    } catch {
      setError("Answer wasn't saved. Your choices are still here; please retry.");
    } finally {setBusy(false);}
  }

  const progress=bank ? answers.size : 0;
  const reviewed=bank?.filter(q=>answers.has(q.id))||[];
  return <section className="ogcl-view">
    <header className="ogcl-view-head">
      <h1>Match Questions</h1>
      <p>Learn what matters to each other, one answer at a time.</p>
      {kind==="onboarding"&&<p><NavLink to="/onboarding">← Back to onboarding</NavLink> · Your first 25 saved answers complete the question step.</p>}
    </header>
    <div className="ogcl-content-panel">
      {loading && <p role="status">Loading the original question collection and your saved answers…</p>}
      {error && <p className="ogcl-error" role="alert">{error}</p>}
      {savedNotice && <p role="status" className="ogcl-save-confirmation">{savedNotice}</p>}
      {bank && <>
        <div className="ogcl-question-progress">
          <strong>{progress} question{progress===1?"":"s"} answered</strong>
        </div>
        <label className="ogcl-question-review">
          Edit a previously answered question
          <select value={reviewId} disabled={busy}
            onChange={event=>{setReviewId(event.target.value);setError("");setSavedNotice("");}}>
            <option value="">Continue with unanswered questions</option>
            {reviewed.map(q=><option key={q.id} value={q.id}>{q.prompt}</option>)}
          </select>
        </label>
        {current ? <form className="ogcl-question-form" onSubmit={submit}>
          <div className="ogcl-question-topic">{current.question.topic}</div>
          <h2>{current.question.prompt}</h2>
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
                  onChange={event=>{
                    setAcceptable(previous=>event.target.checked
                      ? [...new Set([...previous,id])] : previous.filter(v=>v!==id));
                    if(importance===0)setImportance(1);
                  }} />
                <span>{label}</span>
              </label>;
            })}
            <label className="ogcl-question-answer ogcl-question-any">
              <input type="checkbox" checked={importance===0} disabled={busy}
                onChange={event=>{
                  setImportance(event.target.checked?0:1);
                  if(event.target.checked)setAcceptable([...current.question.optionIds]);
                }} />
              <span>Any of the above — irrelevant to compatibility</span>
            </label>
          </fieldset>
          <fieldset>
            <legend>How important is this question?</legend>
            <div className="ogcl-question-importance">
              {QUESTION_IMPORTANCE.filter(option=>option.value!==0).map(option=>
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
            {busy?"Saving answer…":reviewId?"Update saved answer":"Save answer & next question"}
          </button>
        </form> : <>
          <h2>All published questions answered</h2>
          <p>All published match questions have been saved to your member account.</p>
          <p><NavLink to="/matches">Explore your matches</NavLink></p>
        </>}
      </>}
    </div>
  </section>;
}
