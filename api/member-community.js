// Shared OG Cupid public-within-membership chatroom. Login/liveness/CORS
// already checked by the parent member Function. No cookies, no anonymous
// feed and no user ID accepted from the browser.
const ROOM=/^\/community\/?$/;
const REPORT=/^\/community\/([1-9]\d*)\/report\/?$/;
const ADMIN_LIST=/^\/community\/reports\/?$/;
const ADMIN_ACTION=/^\/community\/reports\/([1-9]\d*)\/action\/?$/;
const REASONS=new Set(["harassment","spam","sexual","other"]);
const ACTIONS=new Set(["hide","dismiss"]);

export function isCommunityPath(path){
  return ROOM.test(path)||REPORT.test(path)||ADMIN_LIST.test(path)||ADMIN_ACTION.test(path);
}
export function communityMethodAllowed(path,method){
  if(ROOM.test(path))return method==="GET"||method==="POST";
  if(REPORT.test(path)||ADMIN_ACTION.test(path))return method==="POST";
  if(ADMIN_LIST.test(path))return method==="GET";
  return false;
}
async function readJson(request,expected,max=1250){
  if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))
    return {error:"Expected JSON",status:415};
  const raw=await request.text();
  if(new TextEncoder().encode(raw).length>max)return {error:"Request too large",status:413};
  let body;
  try{body=JSON.parse(raw)}catch{return {error:"Invalid JSON",status:400};}
  if(!body||typeof body!=="object"||Array.isArray(body)||
    Object.keys(body).sort().join(",")!==expected.slice().sort().join(","))
    return {error:"Invalid request",status:400};
  return {body};
}
function idFor(text){
  if(!/^[1-9]\d{0,15}$/.test(String(text||"")))return null;
  const n=Number(text);
  return Number.isSafeInteger(n)?n:null;
}

export async function handleCommunity(request,userId,url,withMember,json){
  const path=url.pathname;
  if(!isCommunityPath(path))return json(request,{error:"Not found"},404);
  if(!communityMethodAllowed(path,request.method))
    return json(request,{error:"Method not allowed"},405);
  try{
    if(ROOM.test(path)&&request.method==="GET"){
      const raw=url.searchParams.get("after");
      if([...url.searchParams.keys()].some(k=>k!=="after") ||
         (raw!==null && raw!=="0" && idFor(raw)===null))
        return json(request,{error:"Invalid chat cursor"},400);
      const cursor=raw===null||raw==="0"?null:idFor(raw);
      const result=await withMember(userId,client=>client.query(
        "SELECT app_private.community_feed($1::bigint) AS messages",[cursor]));
      const messages=result.rows[0]?.messages;
      return json(request,{messages:Array.isArray(messages)?messages:[]});
    }
    if(ROOM.test(path)){
      const parsed=await readJson(request,["body"]);
      if(parsed.error)return json(request,{error:parsed.error},parsed.status);
      const body=parsed.body.body;
      if(typeof body!=="string"||!body.trim()||body.length>500||
         /[\r\n]/.test(body))
        return json(request,{error:"Chat messages must be a single line up to 500 characters"},400);
      const sent=await withMember(userId,client=>client.query(
        "SELECT app_private.community_send($1::text) AS data",[body]));
      return json(request,sent.rows[0]?.data||{sent:false},201);
    }
    const reportId=path.match(REPORT)?.[1];
    if(reportId){
      const parsed=await readJson(request,["reason"],200);
      if(parsed.error)return json(request,{error:parsed.error},parsed.status);
      if(!REASONS.has(parsed.body.reason)||!idFor(reportId))
        return json(request,{error:"Invalid report"},400);
      await withMember(userId,client=>client.query(
        "SELECT app_private.community_report($1::bigint,$2::text)",[idFor(reportId),parsed.body.reason]));
      return json(request,{reported:true});
    }
    if(ADMIN_LIST.test(path)){
      const rows=await withMember(userId,client=>client.query(
        "SELECT app_private.admin_community_reports() AS reports"));
      return json(request,{reports:rows.rows[0]?.reports||[]});
    }
    const adminReportId=path.match(ADMIN_ACTION)?.[1];
    if(adminReportId){
      const parsed=await readJson(request,["action","reason"],900);
      if(parsed.error)return json(request,{error:parsed.error},parsed.status);
      const {action,reason}=parsed.body;
      if(!ACTIONS.has(action)||typeof reason!=="string"||reason.trim().length<8||
        reason.trim().length>500||!idFor(adminReportId))
        return json(request,{error:"Invalid moderation action"},400);
      await withMember(userId,client=>client.query(
        "SELECT app_private.admin_community_moderate($1::bigint,$2::text,$3::text)",[
          idFor(adminReportId),action,reason.trim()
        ]));
      return json(request,{moderated:true});
    }
    return json(request,{error:"Not found"},404);
  }catch(err){
    if(err?.code==="42501")return json(request,{error:"Access denied"},403);
    if(err?.code==="22023")return json(request,{error:"Message or report unavailable"},409);
    if(err?.code==="P0001")return json(request,{error:"You're sending too quickly; try again shortly."},429);
    console.error("Community request failed",err instanceof Error?err.name:"unknown");
    return json(request,{error:"Chatroom temporarily unavailable"},503);
  }
}
