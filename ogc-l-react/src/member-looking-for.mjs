// Canonical persisted looking-for contract from the 18 Nov owner decisions.
// UI labels differ from pre-existing storage tokens; do not rewrite old records.
export const LOOKING_GENDERS=Object.freeze([
  Object.freeze({value:"Man",label:"Men"}),
  Object.freeze({value:"Woman",label:"Women"}),
  Object.freeze({value:"Transman",label:"Trans Men"}),
  Object.freeze({value:"Transwoman",label:"Trans Women"}),
  Object.freeze({value:"Something else",label:"Something Else"})
]);
export const LOOKING_INTENTIONS=Object.freeze([
  Object.freeze({value:"new friends",label:"New friends"}),
  Object.freeze({value:"short-term dating",label:"Short-term dating"}),
  Object.freeze({value:"long-term dating",label:"Long-term dating"}),
  Object.freeze({value:"casual sex",label:"Casual sex"}),
  Object.freeze({value:"activity partners",label:"Activity partners"})
]);
export const LOOKING_RADII=Object.freeze([
  Object.freeze({value:10,label:"Near me"}),
  Object.freeze({value:25,label:"25 miles"}),
  Object.freeze({value:50,label:"50 miles"}),
  Object.freeze({value:100,label:"100 miles"}),
  Object.freeze({value:250,label:"250 miles"}),
  Object.freeze({value:500,label:"500 miles"}),
  Object.freeze({value:0,label:"Anywhere"})
]);
export const AGE_CHOICES=Object.freeze(Array.from({length:82},(_,i)=>i+18));
const radiusValues=new Set(LOOKING_RADII.map(x=>x.value));
const ageOK=value=>value===null||(Number.isInteger(value)&&value>=18&&value<=99);
export function validAgeRange(min,max) {
  return (min===null&&max===null)||
    (ageOK(min)&&ageOK(max)&&min!==null&&max!==null&&max>=min);
}
export function multiChoiceString(raw,choices) {
  if(typeof raw!=="string")throw Error("Invalid profile preference");
  if(!raw.trim())return [];
  const values=raw.split(", ");
  if(values.length>5 || values.length!==new Set(values).size ||
    !values.every(x=>choices.some(c=>c.value===x)))
    throw Error("Unrecognized profile preference");
  return values;
}
export function lookingForUpdate(profile,draft) {
  if(!profile||typeof profile.aboutMe!=="string"||!ageOK(profile.age)&&profile.age!==null)
    throw Error("Invalid owner profile");
  const interestedIn=Array.isArray(draft.genders)?draft.genders:[];
  const relationshipGoal=Array.isArray(draft.intentions)?draft.intentions:[];
  if(interestedIn.length!==new Set(interestedIn).size ||
    !interestedIn.every(x=>LOOKING_GENDERS.some(c=>c.value===x))||
    relationshipGoal.length!==new Set(relationshipGoal).size||
    !relationshipGoal.every(x=>LOOKING_INTENTIONS.some(c=>c.value===x)) ||
    !validAgeRange(draft.preferredAgeMin,draft.preferredAgeMax))
    throw Error("Choose valid interested-in, relationship and age preferences");
  const out={
    aboutMe:profile.aboutMe,age:profile.age,
    // Historical "Everyone" and case-sensitive legacy intentions are not
    // reinterpreted or cleared merely because a member edits their age.
    interestedIn:draft.gendersTouched
      ?LOOKING_GENDERS.filter(x=>interestedIn.includes(x.value)).map(x=>x.value).join(", ")
      :String(profile.interestedIn||""),
    relationshipGoal:draft.intentionsTouched
      ?LOOKING_INTENTIONS.filter(x=>relationshipGoal.includes(x.value)).map(x=>x.value).join(", ")
      :String(profile.relationshipGoal||""),
    preferredAgeMin:draft.preferredAgeMin,preferredAgeMax:draft.preferredAgeMax
  };
  if(profile.hasValidatedLocality &&
     (draft.radiusTouched || radiusValues.has(profile.searchRadiusMiles))){
    if(!radiusValues.has(draft.searchRadiusMiles))
      throw Error("Choose an approved saved-location distance");
    out.searchRadiusMiles=draft.searchRadiusMiles;
  }
  return out;
}
export function formatLookingFor(profile) {
  const result=[];
  const gender=typeof profile?.interestedIn==="string"?profile.interestedIn:"";
  if(gender) {
    const values=gender.split(", ").map(v=>
      LOOKING_GENDERS.find(g=>g.value===v)?.label||v).filter(Boolean);
    if(values.length)result.push(values.join(", "));
  }
  const min=profile?.preferredAgeMin,max=profile?.preferredAgeMax;
  if(validAgeRange(min,max)&&min!==null)result.push("Ages "+min+"–"+max);
  const radius=profile?.profileSearchRadiusMiles;
  if(radiusValues.has(radius)) {
    const label=LOOKING_RADII.find(r=>r.value===radius)?.label;
    result.push(radius===10?"Near me":radius===0?"Anywhere":"Within "+label);
  }
  const goals=typeof profile?.relationshipGoal==="string"?profile.relationshipGoal:"";
  if(goals)result.push("For "+goals);
  return result;
}
