// Uses the owner's published 410-question bank, never locally invented data.
const TIERS=Object.freeze([10,50,100,250]);
export const QUESTION_IMPORTANCE=Object.freeze([
  Object.freeze({value:0,label:"Irrelevant"}),
  Object.freeze({value:1,label:"A little"}),
  Object.freeze({value:10,label:"Somewhat"}),
  Object.freeze({value:50,label:"Very"}),
  Object.freeze({value:250,label:"Dealbreaker"})
]);
const pick=(array,rng)=>array[Math.min(array.length-1,Math.floor(Math.max(0,Math.min(.999999999,rng()))*array.length))];

export function checkedQuestionBank(raw) {
  if (!Array.isArray(raw)||raw.length!==410) throw Error("Published question bank unavailable");
  const ids=new Set();
  const bank=[];
  for(const row of raw){
    if(!row || typeof row.id!=="string" || !/^vault-[0-9]{1,25}$/.test(row.id) ||
      ids.has(row.id)||!TIERS.includes(row.tier)||
      typeof row.prompt!=="string"||row.prompt.length>2500||
      !Array.isArray(row.options)||!Array.isArray(row.optionIds)||
      row.options.length<2||row.options.length!==row.optionIds.length||row.options.length>20||
      !row.options.every(v=>typeof v==="string"&&v.length>0&&v.length<=2000)||
      !row.optionIds.every(v=>typeof v==="string" && /^option-[0-9]{1,20}$/.test(v)) ||
      new Set(row.optionIds).size!==row.optionIds.length) {
      throw Error("Published question bank is invalid");
    }
    ids.add(row.id);
    bank.push(Object.freeze({id:row.id,tier:row.tier,topic:String(row.topic||"").slice(0,80),
      prompt:row.prompt,options:Object.freeze([...row.options]),optionIds:Object.freeze([...row.optionIds])}));
  }
  return Object.freeze(bank);
}
export function checkedSavedAnswers(data,bank) {
  if (!Array.isArray(data?.answers)) throw Error("Invalid saved answers response");
  const byId=new Map(bank.map(q=>[q.id,q]));
  const saved=new Map();
  for(const row of data.answers){
    const q=byId.get(row?.questionId);
    if(!q || !q.optionIds.includes(row?.optionId) ||
      !Array.isArray(row?.acceptableOptions)||
      !row.acceptableOptions.every(id=>q.optionIds.includes(id))||
      !QUESTION_IMPORTANCE.some(x=>x.value===row.importance)||
      typeof row.isPrivate!=="boolean")continue;
    saved.set(q.id,Object.freeze({
      questionId:q.id,optionId:row.optionId,
      acceptableOptions:Object.freeze([...new Set(row.acceptableOptions)]),
      importance:row.importance,isPrivate:row.isPrivate,
      note:typeof row.note==="string"?row.note.slice(0,400):""
    }));
  }
  return saved;
}
export function questionStage(bank,answers) {
  const answered=new Set(answers instanceof Map?answers.keys():answers||[]);
  return TIERS.find(t=>bank.some(q=>q.tier===t&&!answered.has(q.id)))??null;
}
export function nextQuestion(bank,answers,rng=Math.random) {
  const answered=new Set(answers instanceof Map?answers.keys():answers||[]);
  const stage=questionStage(bank,answered);
  if(stage===null)return null;
  const available=bank.filter(q=>!answered.has(q.id));
  const current=available.filter(q=>q.tier===stage);
  const later=available.filter(q=>q.tier>stage);
  const detour=(stage===50||stage===100)&&later.length>0&&rng()<0.1;
  return Object.freeze({question:pick(detour?later:current,rng),stage,detour});
}
export function buildAnswer({question,optionId,acceptableOptions,importance,isPrivate,note}) {
  if(!question || !question.optionIds.includes(optionId)||
    !Array.isArray(acceptableOptions)||acceptableOptions.length<1||
    !acceptableOptions.every(a=>question.optionIds.includes(a))||
    !QUESTION_IMPORTANCE.some(i=>i.value===importance)||
    typeof isPrivate!=="boolean"||typeof note!=="string"||note.length>400)throw Error("Invalid answer");
  return {
    questionId:question.id,optionId,
    acceptableOptions:[...new Set(acceptableOptions)],
    importance,isPrivate,note
  };
}
