import {checkedQuestionBank} from "./question-serving.mjs";
// Public, owner-curated static bank; served from the Vite staging build.
// The sensitive ANSWERS remain on the authenticated Neon member service.
let bankPromise;
export function loadPublishedBank() {
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

