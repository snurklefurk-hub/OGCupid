// Existing private Neon profile fields. Only server-backed essays appear here;
// never show or save a prompt until its database column and API are ready.
export const LIVE_ESSAYS = Object.freeze([
  Object.freeze({key:"aboutMe",label:"My self-summary",max:5000}),
  Object.freeze({key:"lifeDirection",label:"What I'm doing with my life",max:2000}),
  Object.freeze({key:"goodAt",label:"I'm really good at",max:1500}),
  Object.freeze({key:"firstThings",label:"The first things people usually notice about me",max:1500}),
  Object.freeze({key:"favorites",label:"Favorite books, movies, shows, music, food",max:2000}),
  Object.freeze({key:"sixThings",label:"The six things I could never do without",max:1500}),
  Object.freeze({key:"thinkingAbout",label:"I spend a lot of time thinking about",max:1500}),
  Object.freeze({key:"fridayNight",label:"On a typical Friday night I am",max:1500}),
  Object.freeze({key:"privateThing",label:"The most private thing I’m willing to admit",max:1500}),
  Object.freeze({key:"messageMeIf",label:"You should message me if",max:1500})
]);
export function essayDefinition(key) {return LIVE_ESSAYS.find(e=>e.key===key)||null;}
export function safeEssayProfile(payload, viewerId) {
  const p=payload?.profile;
  if(!p||String(p.userId).toLowerCase()!==viewerId.toLowerCase()) {
    throw new Error("Profile ownership could not be verified");
  }
  const fields={};
  for(const essay of LIVE_ESSAYS) {
    if(typeof p[essay.key]!=="string" || p[essay.key].length>essay.max) {
      throw new Error("Saved profile has an invalid essay");
    }
    fields[essay.key]=p[essay.key];
  }
  if(p.age!==null && (!Number.isInteger(p.age)||p.age<18||p.age>120)){
    throw new Error("Saved profile age is invalid");
  }
  return Object.freeze({userId:viewerId,displayName:String(p.displayName||"Member").slice(0,60),
    slug:typeof p.slug==="string"&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)?p.slug:null,
    age:p.age,fields:Object.freeze(fields)});
}
export function composeEssayUpdate(profile,key,draft) {
  const essay=essayDefinition(key);
  if(!essay || typeof draft!=="string" || draft.length>essay.max) {
    throw new Error("Invalid essay update");
  }
  // Profile PUT requires aboutMe+age even for changing another essay.
  // Supply only those required fields and the one selected essay so the server
  // keeps every OTHER profile field (especially location/preferences) intact.
  return {
    aboutMe: key==="aboutMe"?draft:profile.fields.aboutMe,
    age: profile.age,
    [key]:draft
  };
}
