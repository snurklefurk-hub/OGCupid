// In-memory stale-while-revalidate cache. Valid only inside the active,
// server-verified member session; never persisted to localStorage/IndexedDB.
// All entries originated from the authenticated, block-filtered server route.
import {searchCacheKey} from "./search-contract.mjs";
const entries=new Map();
const MAX_ENTRIES=40;
const MAX_AGE_MS=60_000;
export function readSearchCache(viewerId,criteria,page,now=Date.now()){
  const key=searchCacheKey(viewerId,criteria,page);
  const cached=entries.get(key);
  if(!cached||now-cached.savedAt>MAX_AGE_MS){entries.delete(key);return null;}
  entries.delete(key);entries.set(key,cached);
  return cached.result;
}
export function storeSearchCache(viewerId,criteria,page,result,now=Date.now()){
  const key=searchCacheKey(viewerId,criteria,page);
  if(!result||!Array.isArray(result.profiles)||result.profiles.length>20)return;
  entries.delete(key);
  entries.set(key,{savedAt:now,result});
  while(entries.size>MAX_ENTRIES)entries.delete(entries.keys().next().value);
}
export function clearSearchCache(){entries.clear();}
export function invalidateSearchCacheForMember(viewerId){
  const prefix=String(viewerId||"").toLowerCase()+"|";
  for(const key of entries.keys())if(key.startsWith(prefix))entries.delete(key);
}
