// Promo CRUD: public read-only catalogue, admin-only create/update/delete.
// The surrounding member Function enforces origin, signed JWT and liveness;
// SQL SECURITY DEFINER RPCs independently re-check the current admin role.
import {validatePromoCard} from "../ogc-l-react/src/promo-contract.mjs";
const route=/^\/admin\/promos(?:\/([1-9][0-9]{0,14}))?\/?$/;
export const isAdminPromosPath=path=>route.test(path);
export function adminPromosMethodAllowed(path,method){
  const match=path.match(route);
  return Boolean(match)&&(match[1]?method==="PUT"||method==="DELETE":
    method==="GET"||method==="POST");
}
async function parseBody(request){
  if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))
    return {error:"Expected JSON",status:415};
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>4600)return {error:"Promo is too large",status:413};
  let jsonBody;
  try{jsonBody=JSON.parse(raw);}catch{return {error:"Invalid JSON",status:400};}
  if(!jsonBody||typeof jsonBody!=="object"||Array.isArray(jsonBody)||
     Object.keys(jsonBody).join(",")!=="card")
    return {error:"Expected a promo card",status:400};
  const card=validatePromoCard(jsonBody.card);
  return card?{card}:{error:"Invalid promo card or unsafe URL",status:400};
}
export async function handleAdminPromos(request,userId,url,withMember,json){
  const match=url.pathname.match(route);
  if(!match)return json(request,{error:"Not found"},404);
  if(!adminPromosMethodAllowed(url.pathname,request.method))
    return json(request,{error:"Method not allowed"},405);
  const id=match[1]?Number(match[1]):null;
  if(id!==null&&!Number.isSafeInteger(id))
    return json(request,{error:"Invalid promo card ID"},400);
  let sql="SELECT app_private.promo_cards_admin() AS data",params=[];
  if(request.method==="POST"||request.method==="PUT"){
    const value=await parseBody(request);
    if(value.error)return json(request,{error:value.error},value.status);
    if(request.method==="POST"){
      sql="SELECT app_private.promo_cards_create($1::jsonb) AS data";
      params=[JSON.stringify(value.card)];
    }else{
      sql="SELECT app_private.promo_cards_update($1::bigint,$2::jsonb) AS data";
      params=[id,JSON.stringify(value.card)];
    }
  }else if(request.method==="DELETE"){
    sql="SELECT app_private.promo_cards_delete($1::bigint) AS data";
    params=[id];
  }
  try{
    const rows=await withMember(userId,client=>client.query(sql,params));
    return json(request,{data:rows.rows[0]?.data??[]});
  }catch(error){
    if(error?.code==="42501")return json(request,{error:"Administrator access required"},403);
    if(error?.code==="22023"||error?.code==="23514"||error?.code==="22001")
      return json(request,{error:"Invalid or unavailable promo card"},409);
    console.error("Promo admin request failed",error instanceof Error?error.name:"unknown");
    return json(request,{error:"Promo editor unavailable"},503);
  }
}
export async function handlePublicPromos(request,pool,json){
  if(request.method!=="GET")return json(request,{error:"Method not allowed"},405);
  try{
    const rows=await pool.query("SELECT app_private.promo_cards_public() AS data");
    return json(request,{data:rows.rows[0]?.data??[]});
  }catch(error){
    console.error("Public promos unavailable",error instanceof Error?error.name:"unknown");
    return json(request,{error:"Promotions unavailable"},503);
  }
}
