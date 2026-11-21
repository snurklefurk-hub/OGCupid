import {PET_CHOICES,selectedPets} from "./member-pets.mjs";
import {ETHNICITY_CHOICES,presentEthnicity} from "./member-settings.mjs";
// Directory operations on *real, already authenticated* discovery results.
// The backend alone decides who is eligible. No inferred location, offline
// activity, profile preference, or score is manufactured in this module.
export const DIRECTORY_PAGE_SIZE = 20;

export const SEARCH_ADVANCED_GROUPS = Object.freeze([
  Object.freeze({name:"Appearance",fields:Object.freeze([
    {key:"bodyType",label:"Body type",options:["Thin","Athletic","Average","Jacked","Chubby","Overweight"]},
    {key:"height",label:"Height",type:"text"}
  ])}),
  Object.freeze({name:"Lifestyle",fields:Object.freeze([
    {key:"smoking",label:"Smoking",options:["Never","Sometimes","Often"]},
    {key:"drinking",label:"Drinking",options:["Never","Sometimes","Often"]},
    {key:"vaping",label:"Vaping",options:["Never","Sometimes","Often","Just weed","Just weed · Sometimes","Just weed · Often","Just weed · Never"]},
    {key:"drugs",label:"Drugs",options:["Never","Sometimes","Often","Just weed","Just weed · Sometimes","Just weed · Often","Just weed · Never"]},
    {key:"diet",label:"Diet",type:"text"}
  ])}),
  Object.freeze({name:"Background",fields:Object.freeze([
    {key:"education",label:"Education",type:"text"},
    {key:"religion",label:"Religion",type:"text"},
    {key:"ethnicity",label:"Race",options:ETHNICITY_CHOICES},
    {key:"languages",label:"Languages",type:"text"}
  ])}),
  Object.freeze({name:"Personal Life",fields:Object.freeze([
    {key:"status",label:"Relationship status",options:["Single","Seeing someone","Married"]},
    {key:"relationshipType",label:"Relationship style",options:["Monogamous","Polyamorous"]},
    {key:"kids",label:"Children",type:"text"},
    {key:"pets",label:"Pets",options:PET_CHOICES},
    {key:"income",label:"Income",options:["Broke","Pocket money","Fuck you money"]}
  ])})
]);
export const SEARCH_SORTS=Object.freeze([
  Object.freeze({value:"match",label:"Match %"}),
  Object.freeze({value:"distance",label:"Distance"}),
  Object.freeze({value:"lastOnline",label:"Last Online"}),
  Object.freeze({value:"newest",label:"Newest"})
]);
export const SEARCH_RADII=Object.freeze([10,25,50,100,250,500,0]);
export const SEARCH_GENDERS=Object.freeze(["Man","Woman","Transman","Transwoman","Something else"]);
export const SEARCH_INTENTIONS=Object.freeze([
  "new friends","short-term dating","long-term dating","casual sex","activity partners"
]);
const keyText=value=>String(value??"").toLocaleLowerCase().trim();
const splitChoices=value=>typeof value==="string"
  ?value.split(",").map(keyText).filter(Boolean):[];
export const isOnlineNow=(date,now=Date.now())=>{
  const timestamp=typeof date==="string"?Date.parse(date):NaN;
  return Number.isFinite(timestamp) && timestamp<=now &&
    now-timestamp<=3*60_000;
};
export function savedSearchDefaults(profile) {
  const saved=profile?.lookingFor||{};
  const gender=splitChoices(saved.interestedIn);
  const intent=splitChoices(saved.relationshipGoal);
  const radius=profile?.lookingFor?.hasValidatedLocality===true &&
    SEARCH_RADII.includes(saved.searchRadiusMiles)?saved.searchRadiusMiles:0;
  return {
    search:"",sort:"match",whoLike:[],activity:"",kidPlans:"",
    genders:SEARCH_GENDERS.filter(x=>gender.includes(keyText(x))),
    intentions:SEARCH_INTENTIONS.filter(x=>intent.includes(keyText(x))),
    ageMin:Number.isInteger(saved.preferredAgeMin)?saved.preferredAgeMin:18,
    ageMax:Number.isInteger(saved.preferredAgeMax)?saved.preferredAgeMax:99,
    radius,advanced:{}
  };
}
function matchesAdvanced(member,advanced) {
  if(!advanced || typeof advanced!=="object")return true;
  for(const field of SEARCH_ADVANCED_GROUPS.flatMap(group=>group.fields)){
    const filter=keyText(advanced[field.key]);
    if(!filter)continue;
    const actual=keyText(member?.[field.key]);
    if(!actual)return false;
    if(field.key==="pets"){
      if(!selectedPets(member.pets).includes(advanced.pets))return false;
      continue;
    }
    if(field.key==="ethnicity"){
      if(!splitChoices(presentEthnicity(member.ethnicity)).includes(filter))return false;
      continue;
    }
    if(field.type==="text"?!actual.includes(filter):actual!==filter)return false;
  }
  return true;
}
export const ACTIVITY_WINDOWS=[
  ["Online now",180000],["Past hour",3600000],["Past day",86400000],
  ["Past week",7*86400000],["Past month",30*86400000],["Past year",365*86400000],
  ["Long ago",Infinity]
];
export function activityBucket(date,now=Date.now()){
  const age=now-(typeof date==="string"?Date.parse(date):NaN);
  if(!Number.isFinite(age)||age<0)return null;
  return ACTIVITY_WINDOWS.find(([,limit])=>age<=limit)[0];
}
// Only recognize an explicitly stated plan in legacy Children details.
export function childPlan(value){
  const phrases=String(value||"").toLowerCase().split(/[,;·]/).map(x=>x.trim());
  const plans=[
    ["Wants children",/^(?:wants?|would like) (?:more )?(?:kids|children)$/],
    ["Doesn’t want children",/^(?:doesn['’]t want|do not want|don't want) (?:more )?(?:kids|children)$/],
    ["Undecided",/^(?:undecided about|unsure about) (?:having )?(?:more )?(?:kids|children)$/]
  ];
  return plans.find(([,pattern])=>phrases.some(x=>pattern.test(x)))?.[0]||"";
}
export function filterAndSortMembers(profiles, filters={},now=Date.now()) {
  const {search="",sort="match",genders=[],intentions=[],
    ageMin=18,ageMax=99,radius=0,advanced={}}=filters;
  const query=keyText(search).slice(0,80);
  const chosenGenders=new Set((Array.isArray(genders)?genders:[]).map(keyText));
  const chosenIntentions=new Set((Array.isArray(intentions)?intentions:[]).map(keyText));
  const validAges=Number.isInteger(ageMin)&&Number.isInteger(ageMax)&&
    ageMin>=18&&ageMax<=99&&ageMin<=ageMax;
  const validRadius=SEARCH_RADII.includes(radius);
  const candidates=(Array.isArray(profiles)?profiles:[])
    .filter(member=>{
      if(!member || typeof member.displayName!=="string" ||
        (query&&!keyText(member.displayName).includes(query)))return false;
      if(chosenGenders.size&&!chosenGenders.has(keyText(member.gender)))return false;
      if(filters.whoLike?.length&&!filters.whoLike.some(x=>splitChoices(member.interestedIn).includes(keyText(x))))return false;
      if(filters.kidPlans&&childPlan(member.kids)!==filters.kidPlans)return false;
      if(filters.activity){
        const bucket=activityBucket(member.lastSeenAt,now);
        if(!bucket)return false;
        const rank=label=>ACTIVITY_WINDOWS.findIndex(([name])=>name===label);
        if(filters.activity==="Long ago"?bucket!=="Long ago":rank(bucket)>rank(filters.activity))return false;
      }
      if(chosenIntentions.size&&
        !splitChoices(member.relationshipGoal).some(goal=>chosenIntentions.has(goal)))
        return false;
      if(validAges&&(!Number.isInteger(member.age)||
        member.age<ageMin||member.age>ageMax))return false;
      if(validRadius&&radius!==0&&(!Number.isInteger(member.distanceMiles)||
        member.distanceMiles>radius))return false;
      return matchesAdvanced(member,advanced);
    });
  const byDate=(p,field)=>typeof p[field]==="string"&&Number.isFinite(Date.parse(p[field]))
    ?Date.parse(p[field]):-1;
  const tie=(a,b)=>a.displayName.localeCompare(b.displayName,undefined,{sensitivity:"base"})||
    String(a.userId).localeCompare(String(b.userId));
  return candidates.sort((a,b)=>{
    if(sort==="distance")return (a.distanceMiles??Infinity)-(b.distanceMiles??Infinity)||tie(a,b);
    if(sort==="lastOnline")return byDate(b,"lastSeenAt")-byDate(a,"lastSeenAt")||tie(a,b);
    if(sort==="newest")return byDate(b,"createdAt")-byDate(a,"createdAt")||tie(a,b);
    // The provisional score is clearly labeled in the UI; unknown is not 0%.
    return (b.matchPercent??-1)-(a.matchPercent??-1)||tie(a,b);
  });
}

export function pageMembers(profiles,requestedPage=1,size=DIRECTORY_PAGE_SIZE) {
  const count=Array.isArray(profiles)?profiles.length:0;
  const safeSize=Number.isInteger(size)&&size>0?size:DIRECTORY_PAGE_SIZE;
  const totalPages=Math.max(1,Math.ceil(count/safeSize));
  const page=Math.min(totalPages,Math.max(1,Number.isInteger(requestedPage)?requestedPage:1));
  return {page,totalPages,total:count,
    items:(profiles||[]).slice((page-1)*safeSize,page*safeSize)};
}

export function shuffledMembers(profiles,rng=Math.random) {
  const candidates=[...(Array.isArray(profiles)?profiles:[])];
  for(let i=candidates.length-1;i>0;i--){
    const j=Math.floor(Math.min(0.999999999,Math.max(0,rng()))*(i+1));
    [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
  }
  return candidates;
}
