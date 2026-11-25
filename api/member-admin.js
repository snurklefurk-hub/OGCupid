import {handleHomeAdmin} from "./member-home.js";
const homeAdminPath=path=>/^\/admin\/home-posts\/?$/.test(path);
import {isAdminEditorPath,adminEditorMethodAllowed,handleAdminEditor} from "./admin-member-editor.js";
import {isAdminUiDesignPath,adminUiDesignMethodAllowed,handleAdminUiDesign} from "./member-ui-design.js";
import {isAdminPromosPath,adminPromosMethodAllowed,handleAdminPromos} from "./member-promos.js";
// Administrator-only member API. JWT identity and liveness are verified
// upstream; SQL SECURITY DEFINER functions independently check the live
// Neon Auth admin role for every read and write.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions=new Set(["start_review","dismiss","warn","suspend_24h","suspend_7d","suspend_30d","ban"]);
const adminRoute=/^\/admin(?:\/(members|reports)(?:\/([0-9a-f-]{36})(?:\/(action|reinstate))?)?)?\/?$/i;

function validReason(value){
  return typeof value==="string" && value.trim().length>=8 && value.trim().length<=500;
}
async function bodyFor(request,keys){
  if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))
    return {error:"Expected JSON",status:415};
  const text=await request.text();
  if(new TextEncoder().encode(text).byteLength>1500) return {error:"Request too large",status:413};
  let parsed;
  try {parsed=JSON.parse(text);}catch{return {error:"Invalid JSON",status:400};}
  if(!parsed || typeof parsed!=="object" || Array.isArray(parsed) ||
     Object.keys(parsed).sort().join(",")!==keys.slice().sort().join(","))
    return {error:"Invalid request",status:400};
  return {body:parsed};
}

export function isAdminPath(pathname){return homeAdminPath(pathname)||adminRoute.test(pathname)||isAdminEditorPath(pathname)||isAdminUiDesignPath(pathname)||isAdminPromosPath(pathname);}
export function adminMethodAllowed(pathname,method){
  if(homeAdminPath(pathname))return ["GET","POST"].includes(method);
  if(isAdminEditorPath(pathname))return adminEditorMethodAllowed(pathname,method);
  if(isAdminUiDesignPath(pathname))return adminUiDesignMethodAllowed(pathname,method);
  if(isAdminPromosPath(pathname))return adminPromosMethodAllowed(pathname,method);
  const m=pathname.match(adminRoute);
  if(!m)return false;
  return m[3] ? method==="POST" && (m[3]==="action"||m[3]==="reinstate")
    : method==="GET";
}
export async function handleAdmin(request,userId,url,withMember,json){
  if(homeAdminPath(url.pathname))return handleHomeAdmin(request,userId,withMember,json);
  if(isAdminEditorPath(url.pathname))return handleAdminEditor(request,userId,url,withMember,json);
  if(isAdminUiDesignPath(url.pathname))return handleAdminUiDesign(request,userId,url,withMember,json);
  if(isAdminPromosPath(url.pathname))return handleAdminPromos(request,userId,url,withMember,json);
  const m=url.pathname.match(adminRoute);
  if(!m)return json(request,{error:"Not found"},404);
  if(!adminMethodAllowed(url.pathname,request.method))
    return json(request,{error:"Method not allowed"},405);
  const section=m[1]||"";
  const id=m[2]?.toLowerCase();
  const operation=m[3]||"";
  if(id && !UUID.test(id))return json(request,{error:"Invalid resource"},400);
  if(operation==="reinstate" && (section!=="members"||!id) ||
     operation==="action" && (section!=="reports"||!id) ||
     id && section==="members" && !operation)
    return json(request,{error:"Not found"},404);
  let sql,params=[];
  if(request.method==="GET"){
    if(!section)sql="SELECT app_private.admin_dashboard() AS data";
    else if(section==="members"&&!id){
      sql="SELECT app_private.admin_members($1::text) AS data";
      params=[(url.searchParams.get("q")||"").slice(0,80)];
    }else if(section==="reports"&&!id)sql="SELECT app_private.admin_reports() AS data";
    else if(section==="reports"&&id){
      sql="SELECT app_private.admin_report_evidence($1::uuid) AS data";params=[id];
    }else return json(request,{error:"Not found"},404);
  }else if(operation==="action"){
    const input=await bodyFor(request,["action","reason"]);
    if(input.error)return json(request,{error:input.error},input.status);
    if(!actions.has(input.body.action)||!validReason(input.body.reason))
      return json(request,{error:"Invalid moderation action"},400);
    sql="SELECT app_private.admin_review_report($1::uuid,$2::text,$3::text) AS data";
    params=[id,input.body.action,input.body.reason.trim()];
  }else if(operation==="reinstate"){
    const input=await bodyFor(request,["reason"]);
    if(input.error)return json(request,{error:input.error},input.status);
    if(!validReason(input.body.reason))return json(request,{error:"Explain the reinstatement"},400);
    sql="SELECT app_private.admin_reinstate_member($1::uuid,$2::text) AS data";
    params=[id,input.body.reason.trim()];
  }else return json(request,{error:"Not found"},404);
  try{
    const rows=await withMember(userId,client=>client.query(sql,params));
    const result=rows.rows[0]?.data??null;
    if(result===null)return json(request,{error:"Not found"},404);
    return json(request,{data:result});
  }catch(err){
    if(err?.code==="42501")return json(request,{error:"Administrator access required"},403);
    if(err?.code==="22023")return json(request,{error:"This action is no longer available"},409);
    console.error("Admin request failed",err instanceof Error?err.name:"unknown");
    return json(request,{error:"Admin service unavailable"},503);
  }
}