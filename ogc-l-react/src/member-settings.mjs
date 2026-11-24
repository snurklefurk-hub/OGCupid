import {PROFILE_GENDERS,PROFILE_ORIENTATIONS} from "./profile-options.mjs";
import {validAgeRange} from "./member-looking-for.mjs";
import {PET_CHOICES,selectedPets} from "./member-pets.mjs";
// Staging Profile Settings: only fields stored by the established Neon /profile API.
// Signup display name, DOB, and derived age are deliberately NOT writable here.
const genders=PROFILE_GENDERS;
// Original profile categories from the November 13 structured details editor.
// Keep the established ethnicity API/storage key; no database migration needed.
export const ETHNICITY_CHOICES=Object.freeze([
  "Asian","Black","Hispanic","Indian","Native American",
  "Middle Eastern","Pacific Islander","White","Other"
]);
// Keep legacy saved values intact; present the approved label in current UI.
// This only normalizes displayed strings and never writes or migrates stored data.
export function presentEthnicity(value) {
  return typeof value==="string" ? value.split(",")
    .map(choice=>choice.trim()==="Hispanic / Latin"?"Hispanic":choice.trim())
    .filter(Boolean).join(", ") : "";
}
const habits=["Never","Sometimes","Often","Just weed",
  "Just weed · Sometimes","Just weed · Often","Just weed · Never"];
const fields=[
  {key:"gender",label:"Gender",max:60,group:"identity",options:genders},
  {key:"orientation",label:"Orientation",max:60,group:"identity",
    options:PROFILE_ORIENTATIONS},
  {key:"relationshipType",label:"Relationship style",max:50,group:"details",
    options:["Monogamous","Polyamorous"]},
  {key:"work",label:"Job",max:160,group:"details"},
  {key:"education",label:"Education",max:120,group:"details"},
  {key:"height",label:"Height",max:50,group:"details"},
  {key:"bodyType",label:"Body type",max:30,group:"details",
    options:["Thin","Athletic","Average","Jacked","Chubby","Overweight"]},
  {key:"ethnicity",label:"Race / ethnicity",max:200,group:"details",multi:ETHNICITY_CHOICES},
  {key:"kids",label:"Children",max:80,group:"details"},
  {key:"pets",label:"Pets",max:80,group:"details",multi:PET_CHOICES},
  {key:"smoking",label:"Smoking",max:60,group:"details",options:["Never","Sometimes","Often"]},
  {key:"vaping",label:"Vaping",max:30,group:"details",options:habits},
  {key:"drinking",label:"Drinking",max:60,group:"details",options:["Never","Sometimes","Often"]},
  {key:"drugs",label:"Drugs",max:30,group:"details",options:habits},
  {key:"diet",label:"Diet",max:100,group:"details"},
  {key:"religion",label:"Religion",max:160,group:"details"},
  {key:"languages",label:"Languages",max:160,group:"details"},
  {key:"income",label:"Income",max:30,group:"details",
    options:["Broke","Pocket money","Fuck you money"]},
  {key:"status",label:"Relationship status",max:30,group:"details",
    options:["Single","Seeing someone","Married"]}
];
export const PROFILE_SETTINGS_FIELDS=Object.freeze(fields.map(field=>Object.freeze({
  ...field,
  ...(field.options?{options:Object.freeze(field.options.slice())}:{}),
  ...(field.multi?{multi:Object.freeze(field.multi.slice())}:{})
})));
export function profileSettingField(key) {
  return PROFILE_SETTINGS_FIELDS.find(f=>f.key===key)||null;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function sanitizeOwnProfileSettings(payload,memberId) {
  const p=payload?.profile;
  if(!UUID.test(String(memberId||"")) || !p ||
    String(p.userId||"").toLowerCase()!==memberId.toLowerCase() ||
    typeof p.displayName!=="string" || typeof p.aboutMe!=="string" || p.aboutMe.length>5000 ||
    (p.age!==null && (!Number.isInteger(p.age)||p.age<18||p.age>120))) {
    throw Error("Verified member profile settings are unavailable");
  }
  if(!validAgeRange(p.preferredAgeMin??null,p.preferredAgeMax??null) ||
    (p.searchRadiusMiles!==null && p.searchRadiusMiles!==undefined &&
     ![0,10,25,50,100,250,500].includes(p.searchRadiusMiles)))
    throw Error("Saved looking-for preferences are invalid");
  const values={};
  for(const def of PROFILE_SETTINGS_FIELDS){
    if(typeof p[def.key]!=="string" || p[def.key].length>def.max)
      throw Error("Saved profile settings contain invalid data");
    values[def.key]=def.key==="ethnicity"?presentEthnicity(p[def.key]):p[def.key];
  }
  return Object.freeze({
    userId:memberId.toLowerCase(),displayName:p.displayName.slice(0,60),
    slug:typeof p.slug==="string"&&SLUG.test(p.slug)?p.slug:null,
    age:p.age,aboutMe:p.aboutMe,fields:Object.freeze(values),
    lookingFor:Object.freeze({
      interestedIn:typeof p.interestedIn==="string"?p.interestedIn:"",
      relationshipGoal:typeof p.relationshipGoal==="string"?p.relationshipGoal:"",
      preferredAgeMin:p.preferredAgeMin??null,
      preferredAgeMax:p.preferredAgeMax??null,
      searchRadiusMiles:p.searchRadiusMiles??null,
      hasValidatedLocality:p.hasValidatedLocality===true
    })
  });
}
export function composeSettingUpdate(profile,key,value) {
  const def=profileSettingField(key);
  if(!def || typeof value!=="string" || value.trim().length>def.max ||
     !profile || typeof profile.aboutMe!=="string" ||
     !Number.isInteger(profile.age) && profile.age!==null)
    throw Error("Invalid profile setting update");
  if(def.options && value.trim() && !def.options.includes(value.trim()) &&
     value.trim()!==profile.fields?.[key])
    throw Error("Choose a valid profile option");
  if(def.multi && value.trim() &&
    value.split(", ").some(x=>!def.multi.includes(x)) &&
    value.trim()!==profile.fields?.[key])
    throw Error("Choose valid profile preferences");
  // Partial profile PUT: only this field + required aboutMe/age. All other
  if(key==="pets"&&value&&value!==profile.fields?.pets&&!selectedPets(value).length)
    throw Error("Choose pet types or Doesn’t have pets");
  // essays, locality, identity, and preferences are untouched server-side.
  return {aboutMe:profile.aboutMe,age:profile.age,[key]:value.trim()};
}
