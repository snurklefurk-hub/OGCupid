// Canonical signup choices; all persisted values are profile strings.
// The legacy option labels for education and diet are preserved.
import {PROFILE_ORIENTATIONS} from './profile-options.mjs';
const freeze=Object.freeze;
export const SIGNUP_ETHNICITY_CHOICES=freeze(["White","Black","Asian","Hispanic","Native","Indian","Middle Eastern","Other"]);
export const BODY_TYPE_CHOICES=freeze(["Thin","Athletic","Average","Jacked","Chubby","Overweight","used up"]);
export const LANGUAGE_CHOICES=freeze(["English","Spanish","French","German","Russian","Italian","Polish","Ukrainian","Romanian","Dutch"]);
export const HEIGHT_CHOICES=freeze(Array.from({length:43},(_,i)=>{
  const inches=i+48;
  return `${Math.floor(inches/12)}' ${inches%12}\" (${Math.round(inches*2.54)} cm)`;
}));
export const HABIT_CHOICES=freeze(["Often","Sometimes","Rarely","Never","Trying to quit"]);
export const EDUCATION_CHOICES=freeze(["High school dropout","High school","Some college","Associate degree","Bachelor's degree","Master's degree","PhD"]);
export const INCOME_CHOICES=freeze(["Broke","Pocket money","Fuck you money"]);
export const DIET_CHOICES=freeze(["Vegan","Vegetarian","Carnivore","Omnivore","Takis","Other"]);
export const RELIGION_CHOICES=freeze(["Agnostic","Protestant","Catholic","Orthodox","Islam","Judaism","Buddhist","Hindu","Sikh","Other"]);
// Previously saved drafts remain valid; retired labels are not offered to new users.
const legacyReligionChoices=freeze(["Agnosticism","Atheism","Buddhism","Christianity","Hinduism","Sikhism"]);
export const RELIGION_IMPORTANCE_CHOICES=freeze(["but it doesn't matter","and it's kinda important","and it's really important"]);
export const RELATIONSHIP_CHOICES=freeze(["Monogamous","Polyamorous"]);
export const STATUS_CHOICES=freeze(["Single","Seeing someone","Married"]);
export const KIDS_CHOICES=freeze([
  freeze({label:"I want em",value:"Wants kids"}),
  freeze({label:"I dont want em",value:"Doesn't want kids"}),
  freeze({label:"I already have em and want more",value:"Has kids and wants more"}),
  freeze({label:"I already have em and dont want more",value:"Has kids and doesn't want more"})
]);
export const SIGNUP_PET_CHOICES=freeze(["Has dogs","Has cats","Has exotics","Likes dogs","Likes cats","Likes exotics"]);
export const SIGNUP_DETAIL_STEPS=freeze({
  5:freeze(["work","income","education"]),
  6:freeze(["diet","drugs","drinking","smoking","vaping","weed","religion","religionImportance"]),
  7:freeze(["relationshipType","kids","pets","status"]),
  8:freeze(["orientation","ethnicity","height","bodyType","languages"])
});
const choices=freeze({orientation:PROFILE_ORIENTATIONS,height:HEIGHT_CHOICES,bodyType:BODY_TYPE_CHOICES,income:INCOME_CHOICES,education:EDUCATION_CHOICES,diet:DIET_CHOICES,drugs:HABIT_CHOICES,drinking:HABIT_CHOICES,smoking:HABIT_CHOICES,vaping:HABIT_CHOICES,weed:HABIT_CHOICES,religion:RELIGION_CHOICES,religionImportance:RELIGION_IMPORTANCE_CHOICES,relationshipType:RELATIONSHIP_CHOICES,kids:KIDS_CHOICES.map(x=>x.value),status:STATUS_CHOICES});
export function validSignupDetailValue(key,value){
  if(typeof value!=="string")return false;
  if(value==="")return key!=="orientation";
  if(key==="work")return value===value.trim()&&value.length<=160;
  if(key==="ethnicity"||key==="languages"){
    const selected=value.split(", "),allowed=key==="ethnicity"?SIGNUP_ETHNICITY_CHOICES:LANGUAGE_CHOICES;
    return selected.length===new Set(selected).size&&selected.every(x=>allowed.includes(x));
  }
  if(key==="pets"){
    const selected=value.split(", ");
    return value.length<=80&&new Set(selected).size===selected.length&&selected.every(x=>SIGNUP_PET_CHOICES.includes(x));
  }
  return choices[key]?.includes(value)===true;
}
export function validSignupDetailStep(step,fields,allowLegacyReligion=false){
  const keys=SIGNUP_DETAIL_STEPS[step];
  return Boolean(keys&&fields&&typeof fields==="object"&&!Array.isArray(fields)&&Object.keys(fields).length===keys.length&&keys.every(key=>Object.hasOwn(fields,key)&&(validSignupDetailValue(key,fields[key])||(allowLegacyReligion&&key==="religion"&&legacyReligionChoices.includes(fields[key]))))&&(!fields.religionImportance||fields.religion));
}
export function nextSignupDetails(state,profileComplete=false){
  if(profileComplete)return "/onboarding";
  for(const step of [5,6,7,8])if(!validSignupDetailStep(step,state?.["signup"+step+"_details"],true))return "/signup"+step;
  return "/onboarding";
}
export function savedSignupDetails(state){
  const fields={};
  for(const step of [5,6,7,8]){
    const draft=state?.["signup"+step+"_details"];
    if(validSignupDetailStep(step,draft,true))Object.assign(fields,draft);
  }
  // Canonical orientation is updated atomically when signup8 is saved;
  // never override a newer signup3 identity answer with an old draft.
  delete fields.orientation;
  return fields;
}
