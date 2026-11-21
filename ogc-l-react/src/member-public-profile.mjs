// Member-to-member profile reads from the authenticated Neon Function.
// Only an explicit display whitelist enters React state. Raw email, DOB,
// preferences, private match answers and object storage keys never enter it.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PUBLIC_ESSAYS = Object.freeze([
  Object.freeze({key:"aboutMe",title:"My self-summary"}),
  Object.freeze({key:"lifeDirection",title:"What I'm doing with my life"}),
  Object.freeze({key:"goodAt",title:"I'm really good at"}),
  Object.freeze({key:"firstThings",title:"The first things people usually notice about me"}),
  Object.freeze({key:"favorites",title:"Favorite books, movies, shows, music, food"}),
  Object.freeze({key:"sixThings",title:"The six things I could never do without"}),
  Object.freeze({key:"thinkingAbout",title:"I spend a lot of time thinking about"}),
  Object.freeze({key:"fridayNight",title:"On a typical Friday night I am"}),
  Object.freeze({key:"privateThing",title:"The most private thing I’m willing to admit"}),
  Object.freeze({key:"messageMeIf",title:"You should message me if"})
]);
export const PUBLIC_DETAILS = Object.freeze([
  Object.freeze({key:"gender",label:"Gender"}),
  Object.freeze({key:"orientation",label:"Orientation"}),
  Object.freeze({key:"relationshipGoal",label:"Relationship intention"}),
  Object.freeze({key:"relationshipType",label:"Relationship type"}),
  Object.freeze({key:"height",label:"Height"}),
  Object.freeze({key:"bodyType",label:"Body type"}),
  Object.freeze({key:"ethnicity",label:"Race / ethnicity"}),
  Object.freeze({key:"diet",label:"Diet"}),
  Object.freeze({key:"smoking",label:"Smoking"}),
  Object.freeze({key:"vaping",label:"Vaping"}),
  Object.freeze({key:"drinking",label:"Drinking"}),
  Object.freeze({key:"drugs",label:"Drugs"}),
  Object.freeze({key:"religion",label:"Religion"}),
  Object.freeze({key:"education",label:"Education"}),
  Object.freeze({key:"work",label:"Job"}),
  Object.freeze({key:"income",label:"Income"}),
  Object.freeze({key:"status",label:"Relationship status"}),
  Object.freeze({key:"kids",label:"Kids"}),
  Object.freeze({key:"pets",label:"Pets"}),
  Object.freeze({key:"languages",label:"Languages"})
]);

const textValue = (raw,max=2500) => typeof raw==="string" ? raw.slice(0,max) : "";
export function sanitizePublicProfile(payload,slug) {
  if(!SLUG.test(slug)|| !payload || typeof payload!=="object")throw Error("Invalid public profile");
  const p=payload.profile;
  if(!p|| !UUID.test(String(p.userId||""))||p.slug!==slug||
    typeof p.displayName!=="string"||p.displayName.trim().length<2) {
    throw Error("Public profile identity not verified");
  }
  const age = Number.isInteger(p.age)&&p.age>=18&&p.age<=120 ? p.age : null;
  const essays=Object.freeze(Object.fromEntries(PUBLIC_ESSAYS.map(({key})=>[key,textValue(p[key],5000)])));
  const details=Object.freeze(Object.fromEntries(PUBLIC_DETAILS.map(({key})=>[key,textValue(p[key],200)])));
  const owner=payload.isOwner===true;
  const answers=Array.isArray(payload.publicAnswers) ? payload.publicAnswers.filter(a=>
    a && typeof a.questionId==="string" && /^vault-[0-9]{1,25}$/.test(a.questionId) &&
    typeof a.optionId==="string" && /^option-[0-9]{1,20}$/.test(a.optionId) &&
    (a.isPrivate!==true || owner) &&
    (a.note===undefined || (typeof a.note==="string" && a.note.length<=400))
  ).slice(0,410).map(a=>Object.freeze({
    questionId:a.questionId,optionId:a.optionId,
    note:typeof a.note==="string"?a.note:"",
    isPrivate:owner&&a.isPrivate===true
  })):[];
  return Object.freeze({
    userId:p.userId.toLowerCase(),slug,
    displayName:p.displayName.trim().slice(0,60),
    age, cityRegion:textValue(p.cityRegion,100),
    essays,details,lookingFor:Object.freeze({
      interestedIn:textValue(p.interestedIn,120),
      relationshipGoal:textValue(p.relationshipGoal,100),
      preferredAgeMin:Number.isInteger(p.preferredAgeMin) && p.preferredAgeMin>=18 && p.preferredAgeMin<=99
        ? p.preferredAgeMin : null,
      preferredAgeMax:Number.isInteger(p.preferredAgeMax) && p.preferredAgeMax>=18 && p.preferredAgeMax<=99
        ? p.preferredAgeMax : null,
      profileSearchRadiusMiles:[0,10,25,50,100,250,500].includes(p.profileSearchRadiusMiles)
        ? p.profileSearchRadiusMiles : null
    }),publicAnswers:Object.freeze(answers),
    personaCode:typeof payload.personaCode==="string" && /^[A-Za-z0-9]{4,8}$/.test(payload.personaCode)
      ? payload.personaCode:null,
    isOwner:payload.isOwner===true
  });
}
