// These routes are maintained by the React shell. Historic HTML links keep
// their canonical public URLs on disk, but browser navigation uses HashRouter.
export function reactPathForLegacy(href){
  if(typeof href!=="string")return null;
  if(href.startsWith("#")||href.startsWith("mailto:")||href.startsWith("tel:"))return null;
  let url;
  try{url=new URL(href,"https://ogcupid.onrender.com");}
  catch{return null;}
  if(url.origin!=="https://ogcupid.onrender.com")return null;
  const path=url.pathname.replace(/\/index\.html$/,"/").replace(/\/+$/,"")||"/";
  if(path==="/account")return url.searchParams.get("join")==="1"?"/#/join":"/#/signin";
  if(path==="/account/persona.html"||path==="/quiz")return "/#/persona"+(url.search?url.search:"");
  if(path==="/questions")return "/#/questions";
  if(path==="/")return "/#/matches";
  const allowed=["/ogtrends","/ogtrends/zero","/ogtrends/perfect-profile","/ogtrends/references",
    "/contact","/privacy","/terms"];
  if(allowed.includes(path))return "/#"+path+(url.hash?"?section="+encodeURIComponent(url.hash.slice(1)):"");
  const slug=/^\/profiles\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
  if(slug)return "/#/profiles/"+slug[1];
  return null;
}

