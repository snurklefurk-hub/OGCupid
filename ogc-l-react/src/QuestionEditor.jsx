import React, {useEffect,useMemo,useState} from "react";
import {NavLink} from "react-router-dom";
import "../../public/questions/question-bank.js";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {IMPORTANCE,publishedQuestions,savedAnswerMap,answerDraft,pickUnanswered} from "./member-questions.mjs";

const QUESTIONS = publishedQuestions(window.OGCQuestionBank);
const byId = new Map(QUESTIONS.map(q=>[q.id,q]));

// This view reads and writes the same protected Neon /answers endpoint used by
// the original member app. No mock answers, localStorage or parallel account DB.
export default function QuestionEditor() {
  const {loadOwnAnswers,saveOwnAnswer} = useMemberSession();
  const [answers,setAnswers] = useState(null);
  const [activeId,setActiveId] = useState(null);
  const [reviewId,setReviewId] = useState("");
  const [skipped,setSkipped] = useState(()=>new Set());
  const [draft,setDraft] = useState(answerDraft(null));
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");

  useEffect(()=>{
    let mounted=true;
    void loadOwnAnswers().then(data=>{
      if (!mounted) return;
      setAnswers(savedAnswerMap(data,QUESTIONS));
      setLoading(false);
    }).catch(()=>{
      if(mounted){setError("Your saved answers could not be loaded. Please retry.");setLoading(false);}
    });
    return ()=>{mounted=false;};
  },[loadOwnAnswers]);

  useEffect(()=>{
    if (!answers || reviewId) return;
    const current=byId.get(activeId);
    if (current && !answers.has(activeId) && !skipped.has(activeId)) return;
    const pick=pickUnanswered(QUESTIONS,answers,skipped);
    setActiveId(pick?.question.id??null);
  },[answers,reviewId,activeId,skipped]);

  const question = byId.get(reviewId || activeId) || null;
  const saved = useMemo(()=>answers?.get(reviewId || activeId),[answers,reviewId,activeId]);
  useEffect(()=>{
    setDraft(answerDraft(question,saved));
  },[question,saved]);

  const count = answers?.size ?? 0;
  const nextPick = answers && !reviewId ? pickUnanswered(QUESTIONS,answers,skipped) : null;
  const maySkip = !reviewId && nextPick?.focusTier !== "first10";
  const reviewItems = QUESTIONS.filter(q=>answers?.has(q.id));

  async function submit(event) {
    event.preventDefault();
    if(saving || !question || !draft.optionId || !draft.acceptableOptions.length) {
      setError("Choose your answer and at least one acceptable answer.");
      return;
    }
    setSaving(true);setError("");setNotice("");
    try {
      const result=await saveOwnAnswer(question,draft);
      setAnswers(current=>new Map(current).set(question.id,result));
      if(!reviewId) setActiveId(null);
      setNotice("Your answer was saved to your account.");
    } catch {
      setError("Your answer was not saved. Your choices are still here; please retry.");
    } finally {setSaving(false);}
  }

  function selectOwn(optionId) {
    setDraft(current=>({
      ...current, optionId,
      acceptableOptions:current.acceptableOptions.length
        ? current.acceptableOptions : [optionId]
    }));
    setError("");setNotice("");
  }

  function toggleAccepted(optionId, checked) {
    setDraft(current=>({
      ...current,
      acceptableOptions:checked
        ? [...new Set([...current.acceptableOptions,optionId])]
        : current.acceptableOptions.filter(id=>id!==optionId),
      importance:current.importance===0?1:current.importance
    }));
    setNotice("");
  }

  function skip() {
    if(!question || !maySkip || saving) return;
    setSkipped(current=>new Set(current).add(question.id));
    setActiveId(null);setNotice("");setError("");
  }

  return <section className="ogcl-view">
    <header className="ogcl-view-head">
      <h1>Match questions</h1>
      <p>Tell people who you are and what matters to you.</p>
    </header>
    <div className="ogcl-content-panel">
      {loading && <p role="status">Loading your saved answers…</p>}
      {!loading && !answers && <button className="ogcl-button" type="button" onClick={()=>window.location.reload()}>Retry loading</button>}
      {answers && <>
        <p className="ogcl-question-count">{count} question{count===1?"":"s"} answered</p>
        <label className="ogcl-question-review">Edit a previously answered question
          <select value={reviewId} disabled={saving} onChange={event=>{
            setReviewId(event.target.value);setError("");setNotice("");
          }}>
            <option value="">Continue with new questions</option>
            {reviewItems.map(q=><option key={q.id} value={q.id}>{q.prompt}</option>)}
          </select>
        </label>
        {question ? <form className="ogcl-question-form" onSubmit={submit}>
          <p className="ogcl-question-topic">{question.topic || "Match question"} · {reviewId ? "Editing your answer" : "New question"}</p>
          <h2>{question.prompt}</h2>
          <fieldset>
            <legend>1. Your answer</legend>
            {question.options.map((label,index)=>{
              const id=question.optionIds[index];
              return <label className="ogcl-question-choice" key={id}>
                <input type="radio" name="my-answer" value={id} checked={draft.optionId===id}
                  disabled={saving} onChange={()=>selectOwn(id)} required />
                <span>{label}</span>
              </label>;
            })}
          </fieldset>
          <fieldset>
            <legend>2. Answers you would accept from a match</legend>
            <p className="ogcl-quiet">Select all answers you would be comfortable with.</p>
            {question.options.map((label,index)=>{
              const id=question.optionIds[index];
              return <label className="ogcl-question-choice" key={id}>
                <input type="checkbox" checked={draft.acceptableOptions.includes(id)}
                  disabled={saving} onChange={event=>toggleAccepted(id,event.target.checked)} />
                <span>{label}</span>
              </label>;
            })}
            <label className="ogcl-question-choice ogcl-question-any">
              <input type="checkbox" checked={draft.importance===0} disabled={saving}
                onChange={event=>setDraft(current=>({
                  ...current,importance:event.target.checked?0:1,
                  acceptableOptions:event.target.checked?[...question.optionIds]:current.acceptableOptions
                }))} />
              <span>Any of the above — this question is irrelevant to compatibility</span>
            </label>
          </fieldset>
          <fieldset>
            <legend>3. How important is their answer?</legend>
            <div className="ogcl-importance">
              {IMPORTANCE.map(item=><label key={item.value}>
                <input type="radio" name="importance" value={item.value}
                  checked={draft.importance===item.value} disabled={saving}
                  onChange={()=>setDraft(current=>({...current,importance:item.value}))} />
                <span>{item.label}</span>
              </label>)}
            </div>
          </fieldset>
          <label className="ogcl-question-note">Explain your answer (optional)
            <textarea value={draft.note} maxLength={400} rows={3} disabled={saving}
              onChange={event=>setDraft(current=>({...current,note:event.target.value}))} />
            <small>{draft.note.length} / 400 characters</small>
          </label>
          <label className="ogcl-question-private">
            <input type="checkbox" checked={draft.isPrivate} disabled={saving}
              onChange={event=>setDraft(current=>({...current,isPrivate:event.target.checked}))} />
            Keep my answer private on my profile
          </label>
          <div className="ogcl-question-actions">
            <button className="ogcl-button" disabled={saving || !draft.optionId || !draft.acceptableOptions.length} type="submit">
              {saving?"Saving…":reviewId?"Update saved answer":"Save answer & next question"}
            </button>
            {maySkip && <button className="ogcl-button ogcl-question-skip" type="button" disabled={saving}
              onClick={skip}>Skip for now</button>}
          </div>
        </form> : <p>{count===QUESTIONS.length
          ? "You've answered every published question. You can review and change any answer above."
          : "No unanswered questions remain in the current selection."}</p>}
        <p className="ogcl-quiet">Your answers, privacy settings and partner preferences are stored in your existing OG Cupid account.</p>
        <p><NavLink to="/profile">Back to your profile editor</NavLink></p>
      </>}
      {error && <p role="alert" className="ogcl-error">{error}</p>}
      {notice && <p role="status" className="ogcl-save-confirmation">{notice}</p>}
    </div>
  </section>;
}
