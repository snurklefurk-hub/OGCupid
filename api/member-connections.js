// Signed-in member Favorites, sitewide Blocks, and private profile reporting.
// All actor identities come from the JWT-verified request context, never input.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST=/^\/connections\/?$/;
const ACTION=/^\/(favorites|blocks|profile-reports)\/([0-9a-f-]{36})\/?$/i;
const REASONS=new Set(["spam","harassment","other"]);
export function isConnectionPath(path){return LIST.test(path)||ACTION.test(path);}
export function connectionMethodAllowed(path,method){
  if(LIST.test(path))return method==="GET";
  const found=path.match(ACTION);
  if(!found||!UUID.test(found[2]))return false;
  if(found[1]==="profile-reports")return method==="POST";
  return method==="PUT"||method==="DELETE";
}
export async function handleConnections(request,userId,url,withMember,json){
  const path=url.pathname,match=path.match(ACTION);
  if(!connectionMethodAllowed(path,request.method))
    return json(request,{error:"Method not allowed"},405);
  try {
    if(LIST.test(path)){
      const result=await withMember(userId,client=>
        client.query("SELECT app_private.member_connections() AS result"));
      return json(request,result.rows[0]?.result||{
        favorites:[],favoritedByCount:0,blockedByCount:0,blocks:[]});
    }
    const [_,kind,rawId]=match;
    const target=rawId.toLowerCase();
    if(target===userId)return json(request,{error:"Cannot select yourself"},400);
    if(kind==="blocks"){
      const blocked=request.method==="PUT";
      const result=await withMember(userId,client=>client.query(
        "SELECT app_private.set_site_block($1::uuid,$2::boolean) AS result",[target,blocked]));
      return json(request,result.rows[0].result);
    }
    if(kind==="favorites"){
      if(request.method==="DELETE"){
        await withMember(userId,client=>client.query(
          "DELETE FROM app_private.member_favorites WHERE owner_id=$1::uuid AND target_id=$2::uuid",
          [userId,target]));
        return json(request,{favorite:false});
      }
      const inserted=await withMember(userId,async client=>{
        const allowed=await client.query(
          "SELECT app_private.is_discoverable_member($1::uuid) AS available,app_private.member_pair_blocked($2::uuid,$1::uuid) AS blocked",
          [target,userId]);
        if(allowed.rows[0]?.available!==true||allowed.rows[0]?.blocked===true)return false;
        await client.query(
          "INSERT INTO app_private.member_favorites(owner_id,target_id) VALUES($1::uuid,$2::uuid) ON CONFLICT DO NOTHING",
          [userId,target]);
        return true;
      });
      return inserted?json(request,{favorite:true}):
        json(request,{error:"Member unavailable"},404);
    }
    if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))
      return json(request,{error:"Expected JSON"},415);
    const raw=await request.text();
    if(new TextEncoder().encode(raw).byteLength>200)return json(request,{error:"Request too large"},413);
    let body;
    try{body=JSON.parse(raw);}catch{return json(request,{error:"Invalid JSON"},400);}
    if(!body||typeof body!=="object"||Array.isArray(body)||
       Object.keys(body).join(",")!=="reason"||!REASONS.has(body.reason))
      return json(request,{error:"Invalid report"},400);
    const result=await withMember(userId,client=>client.query(
      "SELECT app_private.report_member_profile($1::uuid,$2::text) AS reported",[target,body.reason]));
    return json(request,{reported:result.rows[0]?.reported===true});
  }catch(error){
    if(error?.code==="22023")return json(request,{error:"Action unavailable or block is permanent"},409);
    if(error?.code==="42501")return json(request,{error:"Not authorized"},403);
    console.error("Member connections unavailable",error instanceof Error?error.name:"unknown");
    return json(request,{error:"Member connections temporarily unavailable"},503);
  }
}
