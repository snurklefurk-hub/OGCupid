(function () {
'use strict';
const qs=window.OGCQuestionBank.questions, order=window.OGCQuestionOrder;
const byId=new Map(qs.map(q=>[q.id,q])), $=id=>document.getElementById(id);
const KEY='ogcupid_curated_match_answers_v1', weights=[['Irrelevant',0],['A little',1],['Somewhat',10],['Very',50],['Mandatory',250]];
let answers=Object.create(null),activeId=null,trail=[],reviewId=null,activeDemo=0;
const answered=()=>new Set(Object.keys(answers));
const tierName=t=>t===10?'First 10':'Next '+t;
function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function normalize(raw){
 const clean=Object.create(null);
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return clean;
 for(const q of qs){
  const a=raw[q.id];if(!a||!q.optionIds.includes(a.optionId))continue;
  clean[q.id]={optionId:a.optionId,acceptedIds:Array.isArray(a.acceptedIds)?[...new Set(a.acceptedIds.filter(id=>q.optionIds.includes(id)))]:[a.optionId],importance:weights.some(w=>w[1]===a.importance)?a.importance:10,private:a.private===true,note:typeof a.note==='string'?a.note.slice(0,400):''};
 }
 return clean;
}
function save(){
 try{localStorage.setItem(KEY,JSON.stringify({schema:2,answers,activeId,trail}));$('save-state').textContent='Saved on this device.'}
 catch(e){$('save-state').textContent='Browser storage unavailable. Export your answers to keep them.'}
}
function load(){
 try{
  const state=JSON.parse(localStorage.getItem(KEY)||'{}');
  answers=normalize(state.answers);activeId=byId.has(state.activeId)?state.activeId:null;
  trail=Array.isArray(state.trail)?state.trail.filter(id=>byId.has(id)).slice(-qs.length):[];
 }catch(e){$('save-state').textContent='Stored answers could not be loaded. You can import an exported answer file.'}
}
function chooseNext(skipId){
 const pick=order.pickNext(qs,answered(),Math.random,skipId);
 activeId=pick?pick.question.id:null;reviewId=null;
 if(activeId){trail=trail.filter(id=>id!==activeId);trail.push(activeId)}
 save();
}
function ensureCurrent(){
 const q=byId.get(activeId),stage=order.stage(qs,answered());
 // An answer can be cleared or imported after a later question was selected.
 // Reapply the mandatory first-ten gate without rerolling on ordinary renders.
 if(!q||(stage===10&&q.tier!==10)||(!answers[activeId]&&stage===null)){
  if(stage!==null)chooseNext();else activeId=null;
 }
}
function reviewList(){
 const topic=$('category').value,search=$('search').value.trim().toLowerCase();
 return qs.filter(q=>answers[q.id]&&(topic==='all'||q.topic===topic)&&(!search||(q.prompt+' '+q.options.join(' ')).toLowerCase().includes(search)));
}
function reviewing(){return $('answer-filter').value==='done'}
function currentQuestion(){
 if(reviewing()){const list=reviewList();if(!list.some(q=>q.id===reviewId))reviewId=list[0]?.id||null;return byId.get(reviewId)}
 ensureCurrent();return byId.get(activeId);
}
function displayStage(){
 const stage=order.stage(qs,answered());
 $('stage-label').textContent=stage?tierName(stage):'All 410 complete';
 $('stage-copy').textContent=stage===10?'Answer all ten essentials to unlock the next set.':stage===50||stage===100?'Your next set is shuffled, with a 10% chance of a question from a later set.':stage===250?'The final set is shuffled. Some may already be answered from earlier surprise draws.':'You have answered every published question. Review or export your answers whenever you like.';
 $('stage-counts').textContent=order.TIERS.map(t=>tierName(t)+': '+qs.filter(q=>q.tier===t&&answers[q.id]).length+' / '+t).join(' · ');
}
function render(){
 const done=Object.keys(answers).length,review=reviewing();
 $('total').textContent=done+' / '+qs.length+' answered';$('filled').style.width=(done/qs.length*100)+'%';displayStage();
 $('category').disabled=!review;$('search').disabled=!review;
 const q=currentQuestion();$('question-box').hidden=!q;$('no-questions').hidden=!!q;
 $('no-questions').textContent=review?'No answered questions match your filters.':done===qs.length?'All 410 questions answered. Thank you for putting yourself into words.':'No questions are available.';
 if(!q)return;
 const a=answers[q.id];
 $('index').textContent=tierName(q.tier);$('topic').textContent=q.topic;$('prompt').textContent=q.prompt;
 $('my-answers').replaceChildren();$('acceptable').replaceChildren();$('importance').replaceChildren();
 q.options.forEach((label,i)=>{
  const optionId=q.optionIds[i],wrap=node('label','choice'),input=node('input');input.type='radio';input.name='my-choice';input.value=optionId;input.checked=!!a&&a.optionId===optionId;
  input.onchange=()=>{if(!answers[q.id])answers[q.id]={optionId,acceptedIds:[optionId],importance:10,private:false,note:''};else answers[q.id].optionId=optionId;save();render()};
  wrap.append(input,node('span','',label));$('my-answers').append(wrap);
  const pref=node('label','pref'),check=node('input');check.type='checkbox';check.checked=!!a&&a.acceptedIds.includes(optionId);check.disabled=!a;
  check.onchange=()=>{const value=answers[q.id];value.acceptedIds=q.optionIds.filter(id=>id===optionId?check.checked:value.acceptedIds.includes(id));save();render()};
  pref.append(check,node('span','',label));$('acceptable').append(pref);
 });
 weights.forEach(([label,value])=>{
  const wrap=node('label','weight'),input=node('input');input.type='radio';input.name='importance';input.value=String(value);input.checked=!!a&&a.importance===value;input.disabled=!a;
  input.onchange=()=>{answers[q.id].importance=value;save();render()};wrap.append(input,node('span','',label));$('importance').append(wrap);
 });
 $('note').value=a?a.note:'';$('note').disabled=!a;$('private').checked=!!a&&a.private;$('private').disabled=!a;$('clear').disabled=!a;
 $('next').textContent=review?'Next answered →':'Save & next →';$('next').disabled=review?reviewList().length<2:!a;
 const previous=trail.filter(id=>id!==q.id&&answers[id]);
 $('prev').disabled=review?reviewList().length<2:previous.length===0;
 $('skip').hidden=review;$('skip').disabled=order.stage(qs,answered())===10||!qs.some(x=>x.id!==q.id&&!answers[x.id]);
 $('skip').title=order.stage(qs,answered())===10?'Complete the first ten before skipping questions.':'Leave this unanswered for now';
}
function moveReview(step){
 const list=reviewList();if(!list.length)return;
 const i=list.findIndex(q=>q.id===reviewId);reviewId=list[(Math.max(i,0)+step+list.length)%list.length].id;render();
}
function tab(name){
 for(const key of ['questions','awards','match']){$('view-'+key).hidden=key!==name;$('tab-'+key).setAttribute('aria-selected',String(key===name))}
 if(name==='questions')render();if(name==='awards')awards();if(name==='match')compare();
 history.replaceState(null,'','#'+name);
}
function awards(){
 $('award-header').textContent=Object.keys(answers).length+' curated questions answered.';
 $('award-grid').replaceChildren(node('p','small','Personality scoring for this question collection has not been assigned yet. Your choices are saved for matching; answer order is not treated as a personality score.'));
}
const demos=[
 {name:'Alex',description:'Fictional sample answers for trying the compatibility calculation.'},
 {name:'Morgan',description:'A different fictional set of answers and partner preferences.'},
 {name:'Taylor',description:'Another fictional set of answers and partner preferences.'}
];
function hash(s){let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0}
function sample(profile){
 const result=Object.create(null);
 for(const q of qs){
  const h=hash(profile.name+q.id),i=h%q.optionIds.length,acceptedIds=[q.optionIds[i]];
  if(h%3===0&&q.optionIds.length>1)acceptedIds.push(q.optionIds[(i+1)%q.optionIds.length]);
  result[q.id]={optionId:q.optionIds[i],acceptedIds,importance:[1,10,50,250][h%4]};
 }
 return result;
}
function matchup(other){
 let common=0,myPoints=0,myMax=0,theirPoints=0,theirMax=0,same=0,conflicts=0;const shared=[];
 for(const q of qs){
  const a=answers[q.id],b=other[q.id];if(!a||!b)continue;
  common++;myMax+=a.importance;theirMax+=b.importance;
  if(a.acceptedIds.includes(b.optionId))myPoints+=a.importance;
  if(b.acceptedIds.includes(a.optionId))theirPoints+=b.importance;
  if(a.optionId===b.optionId)same++;
  const conflict=!a.acceptedIds.includes(b.optionId)||!b.acceptedIds.includes(a.optionId);if(conflict)conflicts++;
  shared.push({q,a,b,conflict,weight:Math.max(a.importance,b.importance)});
 }
 const ours=myMax?myPoints/myMax:1,theirs=theirMax?theirPoints/theirMax:1;
 return {common,match:common&&(myMax||theirMax)?Math.round(100*Math.sqrt(ours*theirs)):null,friend:common?Math.round(100*same/common):null,conflicts:common?Math.round(100*conflicts/common):null,shared};
}
function compare(){
 const profile=demos[activeDemo],result=matchup(sample(profile));$('demos').replaceChildren();
 demos.forEach((p,i)=>{const b=node('button','',p.name);b.setAttribute('aria-pressed',String(i===activeDemo));b.onclick=()=>{activeDemo=i;compare()};$('demos').append(b)});
 $('demo-desc').textContent=profile.description;
 $('match-score').textContent=result.match===null?'–':result.match+'%';$('friend-score').textContent=result.friend===null?'–':result.friend+'%';$('conflict-score').textContent=result.conflicts===null?'–':result.conflicts+'%';$('common-score').textContent=result.common;
 $('match-copy').textContent=result.common?result.common+' shared questions with this fictional sample.':'Answer a question to try the compatibility preview.';
 const holder=$('shared');holder.replaceChildren();
 const label=(q,id)=>q.options[q.optionIds.indexOf(id)];
 result.shared.sort((a,b)=>b.weight-a.weight).slice(0,16).forEach(r=>{const row=node('div','comparison');row.append(node('b','',r.q.prompt),node('div','','You: '+(r.a.private?'Private answer (still counted)':label(r.q,r.a.optionId))+' · '+profile.name+': '+label(r.q,r.b.optionId)),node('span','small',r.conflict?'At least one acceptable-answer rule was not met.':"Both people's acceptable-answer rules were met."));holder.append(row)});
 if(!result.common)holder.append(node('p','small','Your shared question comparisons will appear here.'));
}
function exportAnswers(){
 const blob=new Blob([JSON.stringify({schema:2,bankVersion:window.OGCQuestionBank.version,answers},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='ogcupid-curated-match-answers.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
async function importAnswers(file){
 if(!file||file.size>2000000){$('save-state').textContent='Choose an answer file under 2 MB.';return}
 try{
  const raw=JSON.parse(await file.text());
  if(raw.schema!==2||!raw.answers||typeof raw.answers!=='object'||Array.isArray(raw.answers))throw Error('Unsupported file');
  const incoming=normalize(raw.answers);
  if(Object.keys(raw.answers).length&&!Object.keys(incoming).length)throw Error('No compatible answers');
  if(Object.keys(answers).length&&!confirm('Replace your current answers with this exported answer file?'))return;
  answers=incoming;trail=[];activeId=null;reviewId=null;$('answer-filter').value='todo';chooseNext();tab('questions');
 }catch(e){$('save-state').textContent='This is not a compatible export from the curated question collection. Existing answers were kept.'}
}
$('category').append(new Option('All topics','all'),...[...new Set(qs.map(q=>q.topic))].sort().map(topic=>new Option(topic,topic)));
$('answer-filter').onchange=()=>{reviewId=null;render()};
for(const id of ['category','search'])$(id).oninput=()=>{reviewId=null;render()};
$('next').onclick=()=>{if(reviewing()){moveReview(1);return}const q=byId.get(activeId);if(q&&answers[q.id]){chooseNext();render()}};
$('skip').onclick=()=>{if(order.stage(qs,answered())===10)return;chooseNext(activeId);render()};
$('prev').onclick=()=>{
 if(reviewing()){moveReview(-1);return}
 const previous=trail.filter(id=>id!==activeId&&answers[id]).at(-1);
 if(previous){$('answer-filter').value='done';$('category').value='all';$('search').value='';reviewId=previous;render()}
};
$('clear').onclick=()=>{const q=currentQuestion();if(q){delete answers[q.id];if(order.stage(qs,answered())===10){$('answer-filter').value='todo';activeId=null;reviewId=null;chooseNext()}save();render()}};
$('private').onchange=e=>{const q=currentQuestion();if(q&&answers[q.id]){answers[q.id].private=e.target.checked;save()}};
$('note').oninput=e=>{const q=currentQuestion();if(q&&answers[q.id]){answers[q.id].note=e.target.value.slice(0,400);save()}};
for(const name of ['questions','awards','match'])$('tab-'+name).onclick=()=>tab(name);
$('see-awards').onclick=()=>tab('awards');$('see-matches').onclick=()=>tab('match');$('more-questions').onclick=()=>tab('questions');
$('export').onclick=exportAnswers;$('import').onchange=e=>{importAnswers(e.target.files[0]);e.target.value=''};
$('erase').onclick=()=>{if(confirm('Erase your answers to this question collection on this device?')){answers=Object.create(null);trail=[];activeId=null;reviewId=null;$('answer-filter').value='todo';chooseNext();tab('questions')}};
load();
// Refresh resumes the same pending question; answer-option changes never reroll it.
ensureCurrent();
tab(['questions','awards','match'].includes(location.hash.slice(1))?location.hash.slice(1):'questions');
})();