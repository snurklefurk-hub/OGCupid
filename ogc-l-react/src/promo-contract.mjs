// Shared pure validation and placement for public/editorial promo cards.
// All rendered copy is plain text. Links are either same-site SPA paths or
// ordinary HTTPS URLs; never executable schemes, protocol-relative URLs or HTML.
const CATEGORIES=new Set(["editorial","refinement"]);
const SIDES=new Set(["left","right","both"]);
const cleanText=(value,max)=>typeof value==="string"&&value.trim().length>0&&value.trim().length<=max&&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)?value.trim():null;

export function validPromoUrl(value){
  if(typeof value!=="string"||value.length>2048||/[\s\\\u0000-\u001f]/.test(value))
    return false;
  if(!value)return true;
  if(value[0]==="/"){
    if(value.startsWith("//")||value.includes("..")||value.includes("#")||
       /%2f|%5c|%0a|%0d/i.test(value))return false;
    const hasSlug=value.includes("{slug}");
    if(hasSlug&&!/^\/profiles\/\{slug\}(?:\?tab=(?:about|photos|questions|personality))?$/.test(value))
      return false;
    return /^\/[a-zA-Z0-9_\/{}?=&%.-]*$/.test(value);
  }
  try{
    const parsed=new URL(value);
    return parsed.protocol==="https:"&&!parsed.username&&!parsed.password&&
      Boolean(parsed.hostname);
  }catch{return false;}
}

export function validatePromoCard(value){
  if(!value||typeof value!=="object"||Array.isArray(value)||
     Object.keys(value).sort().join(",")!=="body,category,enabled,side,title,url")return null;
  const title=cleanText(value.title,120),body=cleanText(value.body,500);
  const url=typeof value.url==="string"?value.url.trim():null;
  if(!title||!body||!CATEGORIES.has(value.category)||!SIDES.has(value.side)||
     (value.category==="refinement"&&value.side!=="right")||
     typeof value.enabled!=="boolean"||url===null||!validPromoUrl(url))return null;
  return {title,body,url,category:value.category,side:value.side,enabled:value.enabled};
}

export function resolvePromoUrl(url,slug){
  if(!validPromoUrl(url)||!url)return null;
  if(url.startsWith("/")){
    if(url.includes("{slug}")){
      if(typeof slug!=="string"||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return null;
      return {to:url.replace("{slug}",slug),external:false};
    }
    return {to:url,external:false};
  }
  return {to:url,external:true};
}

// Stable slot selection for both columns: no repeated editorial tile within a
// six-card draw. Fixed-side cards are prioritized, then flexible ones fill gaps.
const sample=(pool,count,rng)=>{
  const copy=pool.slice(),out=[];
  while(copy.length&&out.length<count){
    const i=Math.max(0,Math.min(copy.length-1,Math.floor(rng()*copy.length)));
    out.push(copy.splice(i,1)[0]);
  }
  return out;
};
export function choosePromoCards(cards,rng=Math.random){
  const source=Array.isArray(cards)?cards.filter(c=>c&&c.enabled!==false&&
    typeof c.title==="string"&&typeof c.body==="string"&&validPromoUrl(c.url||"")):[];
  const editorial=source.filter(c=>c.category==="editorial");
  const selected=new Set();
  const pickSide=side=>{
    const fixed=sample(editorial.filter(c=>c.side===side&&!selected.has(c.id)),3,rng);
    fixed.forEach(c=>selected.add(c.id));
    const flex=sample(editorial.filter(c=>c.side==="both"&&!selected.has(c.id)),3-fixed.length,rng);
    flex.forEach(c=>selected.add(c.id));
    return [...fixed,...flex];
  };
  return {
    left:pickSide("left"),right:pickSide("right"),
    refinement:sample(source.filter(c=>c.category==="refinement"),1,rng)[0]||null
  };
}
