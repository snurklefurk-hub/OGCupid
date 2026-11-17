/* Inline owner question editor on /profiles/{slug}. JWT-gated and writes only to
 * the existing owner-only /answers endpoint. Peer profiles remain read-only. */
(() => {
  "use strict";
  const AUTH="https://ep-hidden-breeze-bbdn5nsb.neonauth.c-15.us-east-1.aws.neon.tech/neondb/auth";
  const API="https://br-plain-unit-bbcbxpqq-members.compute.c-15.us-east-1.aws.neon.tech";
  const $=id=>document.getElementById(id);
  const questions=()=>window.OGCQuestionBank?.questions||[];
  let saved=[],token="",current=null,ready=false;
  const el=(tag,cls="",text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;};
  const record=id=>saved.find(a=>a.questionId===id);
  const findQuestion=id=>questions().find(q=>q.id===id);
  const errorMessage=(text)=>{const target=$("ogc-answer-error");if(target){target.textContent=text;target.hidden=!text;}};
  async function getToken(){
    const response=await fetch(AUTH+"/token",{credentials:"include",cache:"no-store"});
    if(!response.ok)throw Error("Your session has expired.");
    const data=await response.json(),value=data.token||data.data?.token;
    if(typeof value!=="string"||value.split(".").length!==3)throw Error("Sign in again.");
    return value;
  }
  async function request(method,path,body){
    const options={method,cache:"no-store",credentials:"omit",headers:{
      Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})
    }};
    if(body)options.body=JSON.stringify(body);
    let response=await fetch(API+path,options);
    if(response.status===401){token=await getToken();options.headers.Authorization="Bearer "+token;response=await fetch(API+path,options);}
    if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||"Couldn't update your answers.");}
    return response.json();
  }
  function choice(target,kind,value,label,checked=false){
    const item=el("label","ogc-answer-choice"),input=el("input");
    input.name=kind;input.type=kind==="acceptable"||kind==="private"?"checkbox":"radio";
    input.value=String(value);input.checked=checked;
    item.append(input,el("span","",label));target.append(item);return input;
  }
  function renderSaved(){
    const list=$("question-list");list.replaceChildren();
    const note=$("question-privacy-note");
    if(note)note.textContent="All your saved answers appear here, including private ones. Only public answers are shown to other members.";
    saved.forEach(answer=>{
      const q=findQuestion(answer.questionId);if(!q)return;
      const index=q.optionIds.indexOf(answer.optionId);
      const row=el("li"),heading=el("strong","",q.prompt);
      const body=el("span","","Answer: "+(q.options[index]||"Unknown")+(answer.isPrivate?" · Private":""));
      const button=el("button","ogc-answer-edit-link","Edit answer");button.type="button";
      button.addEventListener("click",()=>{draw(q.id);$("owner-question-editor").scrollIntoView({block:"start",behavior:"auto"});});
      row.append(heading,body,button);list.append(row);
    });
    if(!list.childElementCount)list.append(el("li","muted","No answers saved yet."));
  }
  function draw(id=null){
    const box=$("owner-question-editor");if(!box||!ready)return;
    box.replaceChildren();box.hidden=false;
    const byId=new Set(saved.map(a=>a.questionId));
    const next=!id?window.OGCQuestionOrder?.pickNext(questions(),byId)?.question:null;
    const question=id?findQuestion(id):next;
    current=question;
    const card=el("section","ogc-question-edit-card");
    card.append(el("h2","","Answer or reanswer questions"));
    const controls=el("div","ogc-answer-tools"),label=el("label","","Review a saved answer: ");
    const picker=el("select");picker.setAttribute("aria-label","Review saved answer");
    picker.add(new Option("New unanswered question",""));
    saved.forEach(a=>{const q=findQuestion(a.questionId);if(q)picker.add(new Option(q.prompt,q.id));});
    picker.value=id||"";picker.addEventListener("change",()=>draw(picker.value||null));
    label.append(picker);
    const random=el("button","","Another new question");random.type="button";
    random.addEventListener("click",()=>draw());
    controls.append(label,random);card.append(controls);
    if(!question){card.append(el("p","muted","You've answered all published questions. Select an earlier answer to revise it."));box.append(card);return;}
    const existing=record(question.id);
    const form=el("form","ogc-inline-answer-form");
    form.append(el("h3","",question.prompt));
    const own=el("fieldset","ogc-answer-group"),accept=el("fieldset","ogc-answer-group");
    own.append(el("legend","","Your answer..."));accept.append(el("legend","","Answers you'll accept..."));
    question.optionIds.forEach((optionId,i)=>{
      choice(own,"answer",optionId,question.options[i],existing?.optionId===optionId);
      choice(accept,"acceptable",optionId,question.options[i],existing?.acceptableOptions?.includes(optionId)===true);
    });
    own.addEventListener("change",event=>{
      if(event.target?.name!=="answer")return;
      if(!accept.querySelector('input[name="acceptable"]:checked')){
        const first=[...accept.querySelectorAll('input[name="acceptable"]')].find(a=>a.value===event.target.value);
        if(first)first.checked=true;
      }
    });
    const importance=el("fieldset","ogc-answer-group");importance.append(el("legend","","This question is..."));
    for(const [value,label] of [[0,"Irrelevant"],[1,"A little important"],[10,"Somewhat important"],[50,"Very important"],[250,"Dealbreaker"]]){
      choice(importance,"importance",value,label,Number(existing?.importance??1)===value);
    }
    const privacy=el("label","ogc-answer-choice"),privateInput=el("input");
    privateInput.type="checkbox";privateInput.name="private";privateInput.checked=existing?.isPrivate===true;
    privacy.append(privateInput,el("span","","Keep this answer private"));
    const note=el("label","ogc-answer-note","Explain your answer (optional private note)");
    const textarea=el("textarea");textarea.name="note";textarea.maxLength=400;textarea.rows=3;textarea.value=existing?.note||"";note.append(textarea);
    const error=el("p","ogc-answer-error");error.id="ogc-answer-error";error.hidden=true;error.setAttribute("role","alert");
    const submit=el("button","cta",existing?"Save revised answer":"Submit answer");submit.type="submit";
    form.append(own,accept,importance,privacy,note,error,submit);card.append(form);box.append(card);
    form.addEventListener("submit",async event=>{
      event.preventDefault();if(submit.disabled||question!==current)return;
      const answer=form.querySelector('input[name="answer"]:checked');
      const accepted=[...form.querySelectorAll('input[name="acceptable"]:checked')].map(c=>c.value);
      if(!answer||!accepted.length){errorMessage("Choose your answer and at least one acceptable answer.");return;}
      const payload={questionId:question.id,optionId:answer.value,acceptableOptions:accepted,
        importance:Number(form.querySelector('input[name="importance"]:checked')?.value??1),
        isPrivate:privateInput.checked,note:textarea.value.trim()};
      submit.disabled=true;errorMessage("");
      try {
        await request("PUT","/answers",payload);
        const result=await request("GET","/answers");
        saved=Array.isArray(result.answers)?result.answers:[];
        renderSaved();draw();
        box.prepend(el("p","ogc-answer-success","Your answer was saved."));
        box.scrollIntoView({block:"start",behavior:"auto"});
      } catch(e) {errorMessage(e.message||"Save failed.");submit.disabled=false;}
    });
  }
  async function start(){
    if(ready||!$("owner-question-editor"))return;
    ready=true;
    const box=$("owner-question-editor");box.hidden=false;
    box.textContent="Loading your saved answers…";
    try{
      token=await getToken();
      const data=await request("GET","/answers");
      saved=Array.isArray(data.answers)?data.answers:[];
      renderSaved();draw();
      const link=$("answer-more");if(link)link.hidden=true;
    }catch(e){box.replaceChildren(el("p","muted","Your question editor is temporarily unavailable."));}
  }
  window.addEventListener("ogc:profile-ready",event=>{if(event.detail?.isOwner===true)start();});
})();