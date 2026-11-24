// Shared, transport-safe MATCHES search contract. No stored account data, tokens,
// or untrusted SQL fragments: the server rechecks membership and eligibility.
import {SEARCH_ADVANCED_GROUPS,SEARCH_SORTS,SEARCH_RADII,SEARCH_GENDERS,
  SEARCH_INTENTIONS} from "./member-directory.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVITY=new Set(["","Online now","Past hour","Past day","Past week","Past month","Past year","Long ago"]);
const CHILD=new Set(["","Wants children","Doesn’t want children","Undecided"]);
const FIELDS=new Map(SEARCH_ADVANCED_GROUPS.flatMap(g=>g.fields).map(f=>[f.key,f]));
const GENDER=new Set(SEARCH_GENDERS);
const INTENT=new Set(SEARCH_INTENTIONS);
const SORT=new Set(SEARCH_SORTS.map(x=>x.value));
export const SEARCH_PAGE_SIZE=20;
export const MAX_SERVER_SEARCH_CANDIDATES=1000;

const invalid=()=>{throw new Error("Invalid MATCHES search criteria");};
function chosen(source,allowed){
  if(!Array.isArray(source)||source.length>allowed.size||new Set(source).size!==source.length||
     source.some(x=>typeof x!=="string"||!allowed.has(x)))invalid();
  return [...source].sort();
}
export function normalizeSearchCriteria(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))invalid();
  const keys=new Set(["search","sort","whoLike","activity","kidPlans",
    "genders","intentions","ageMin","ageMax","radius","advanced"]);
  if(Object.keys(raw).some(key=>!keys.has(key)))invalid();
  const search=raw.search??"";
  if(typeof search!=="string"||search.length>80)invalid();
  const sort=raw.sort??"match";
  if(!SORT.has(sort))invalid();
  const ageMin=raw.ageMin??18,ageMax=raw.ageMax??99,radius=raw.radius??0;
  if(!Number.isInteger(ageMin)||!Number.isInteger(ageMax)||
     ageMin<18||ageMax>99||ageMin>ageMax||!SEARCH_RADII.includes(radius))invalid();
  const activity=raw.activity??"",kidPlans=raw.kidPlans??"";
  if(!ACTIVITY.has(activity)||!CHILD.has(kidPlans))invalid();
  const advanced=raw.advanced??{};
  if(!advanced||typeof advanced!=="object"||Array.isArray(advanced)||
     Object.keys(advanced).some(key=>!FIELDS.has(key)))invalid();
  const normalizedAdvanced={};
  for(const key of [...FIELDS.keys()].sort()){
    const value=advanced[key];
    if(value===undefined||value==="")continue;
    const field=FIELDS.get(key);
    if(typeof value!=="string"||value.length>200||
       field.options&&!field.options.includes(value))invalid();
    normalizedAdvanced[key]=value;
  }
  return {search:search.trim(),sort,whoLike:chosen(raw.whoLike??[],GENDER),
    activity,kidPlans,genders:chosen(raw.genders??[],GENDER),
    intentions:chosen(raw.intentions??[],INTENT),
    ageMin,ageMax,radius,advanced:normalizedAdvanced};
}
export function searchCacheKey(viewerId,criteria,page){
  if(!UUID.test(String(viewerId||""))||!Number.isInteger(page)||page<1||page>1000)invalid();
  return viewerId.toLowerCase()+"|"+JSON.stringify(normalizeSearchCriteria(criteria))+"|"+page;
}
export function validSearchPage(page){
  return Number.isInteger(page)&&page>=1&&page<=1000;
}
