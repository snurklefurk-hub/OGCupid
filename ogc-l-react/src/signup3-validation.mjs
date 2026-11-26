import {validSignupPreferences,validSignupFilters} from "./profile-options.mjs";

// Keep the signup UI gate stricter than legacy preference payload validation.
export function birthDateLimit(years,now=new Date()){
  return new Date(Date.UTC(now.getUTCFullYear()-years,now.getUTCMonth(),now.getUTCDate())).toISOString().slice(0,10);
}
export function canContinueSignup3(draft,now=new Date()){
  if(!validSignupPreferences(draft)||!validSignupFilters(draft)||
     !draft.interestedIn.length||!draft.intentions.length)return false;
  const birthDate=draft.birthDate;
  if(typeof birthDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(birthDate))return false;
  const parsed=new Date(birthDate+"T00:00:00Z");
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===birthDate&&
    birthDate>=birthDateLimit(120,now)&&birthDate<=birthDateLimit(18,now);
}
