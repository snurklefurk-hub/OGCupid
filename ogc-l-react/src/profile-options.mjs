// Shared profile choices. Persist the existing intention keys to keep saved
// profiles and search compatibility intact; display the current labels only.
export const PROFILE_GENDERS=Object.freeze(["Man","Woman","Transman","Transwoman","Intersex","Enby","Something else"]);
export const PROFILE_ORIENTATIONS=Object.freeze(["Straight","Gay","Bi","Ace","Something else"]);
export const PROFILE_LOOKING_GENDERS=Object.freeze(PROFILE_GENDERS.map((value,i)=>Object.freeze({
  value,label:["Men","Women","Transmen","Transwomen","Intersex","Enbies","Something else"][i]
})));
export const PROFILE_INTENTIONS=Object.freeze([
  {value:"long-term dating",label:"long term dating"},
  {value:"short-term dating",label:"short term dating"},
  {value:"new friends",label:"friends"},
  {value:"casual sex",label:"freaky stuff"}
].map(Object.freeze));
export function presentIntentions(raw){
  if(typeof raw!=="string")return "";
  return raw.split(",").map(x=>x.trim()).filter(x=>x&&x.toLowerCase()!=="activity partners")
    .map(x=>PROFILE_INTENTIONS.find(c=>c.value.toLowerCase()===x.toLowerCase())?.label||x).join(", ");
}
export function storageIntentions(raw){
  if(typeof raw!=="string")return "";
  return raw.split(",").map(x=>x.trim()).filter(x=>x&&x.toLowerCase()!=="activity partners")
    .map(x=>PROFILE_INTENTIONS.find(c=>c.value.toLowerCase()===x.toLowerCase()||c.label.toLowerCase()===x.toLowerCase())?.value||x).join(", ");
}
export function signupLookingDefaults(gender,orientation){
  if(!["Man","Woman"].includes(gender))return [];
  if(orientation==="Straight")return [gender==="Man"?"Woman":"Man"];
  if(orientation==="Gay")return [gender];
  if(orientation==="Bi")return ["Man","Woman"];
  return [];
}
export function validSignupPreferences(body){
  const valid=(items,allowed)=>Array.isArray(items)&&items.length<=allowed.length&&
    new Set(items).size===items.length&&items.every(x=>allowed.includes(x));
  return PROFILE_GENDERS.includes(body?.gender)&&PROFILE_ORIENTATIONS.includes(body?.orientation)&&
    valid(body?.interestedIn,PROFILE_GENDERS)&&valid(body?.intentions,PROFILE_INTENTIONS.map(x=>x.value));
}

export const SIGNUP_DISTANCE_CHOICES=Object.freeze([10,25,50,100,250,500,0]);
export const SIGNUP_AGE_CHOICES=Object.freeze(Array.from({length:82},(_,i)=>18+i));
export function validSignupFilters(body){
  return SIGNUP_DISTANCE_CHOICES.includes(body?.distanceMiles)&&Number.isInteger(body.ageMin)&&Number.isInteger(body.ageMax)&&body.ageMin>=18&&body.ageMax<=99&&body.ageMin<=body.ageMax;
}
