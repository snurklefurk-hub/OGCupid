import {SITEMAP_PATHS} from "./sitemap-pages.mjs";
// Permanent site pages, plus the single owner-profile destination. Signup,
// sign-in, recovery and individual dynamic URLs are not repeatable destinations.
export const EXPLORER_PAGES=Object.freeze([...SITEMAP_PATHS.filter(path=>path!=="/admin"&&!/^\/signup(?:[0-9]+)?$/.test(path)&&!["/join","/signin","/recover"].includes(path)),"/profiles/me"]);
export const AWARD_DEFINITIONS=Object.freeze({
  "feature-creature":Object.freeze({label:"Feature Creature",description:"Take the Persona Test and complete every What to do activity."}),
  explorer:Object.freeze({label:"explorer",description:"Visit every permanent non-admin site page."}),
  yapper:Object.freeze({label:"yapper",description:"Write an individual essay over 500 words or more than 2000 essay words across your profile."})
});
const bounded=(n,max)=>Math.max(0,Math.min(max,Number.isFinite(Number(n))?Number(n):0));
export function homeProgress(data={}){
  const questions=bounded(data.questions,200),words=bounded(data.essayWords,1000),votes=bounded(data.quickmatchVotes,20),
    messages=bounded(data.communityMessages,100),searches=bounded(data.searchClicks,5);
  return [
    {id:"persona",label:"The persona test",href:"/persona",result:data.persona||null},
    {id:"questions",label:"Match questions!",href:"/questions",percent:Math.floor(questions/2),detail:questions+" / 200 answered"},
    {id:"essays",label:"Fill out some essays!",href:"/profile",percent:Math.floor(words/10),detail:words+" / 1000 words"},
    {id:"quickmatch",label:"Check out Quickmatch!",href:"/quickmatch",percent:Math.floor(votes*4.5)+(data.hasQuiver?10:0),detail:votes+" / 20 ratings · "+(data.hasQuiver?"Quiver earned":"Earn a Quiver")},
    {id:"community",label:"Check out the Community!",href:"/community",percent:Math.min(100,(data.communityVisited?25:0)+messages*10),detail:(data.communityVisited?"Visited":"Visit the Community")+" · "+messages+" messages sent"},
    {id:"matches",label:"Search for Matches!",href:"/matches",percent:searches*20,detail:searches+" / 5 searches"}
  ];
}
export function explorerPath(path,ownSlug){
  const canonical=String(path||"").replace(/\/$/,"")||"/";
  if(ownSlug&&canonical==="/profiles/"+ownSlug)return "/profiles/me";
  return EXPLORER_PAGES.includes(canonical)&&canonical!=="/profiles/me"?canonical:null;
}
