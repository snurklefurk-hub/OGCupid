// Authenticated photo album routes. The caller has already verified the JWT
// and current Neon member liveness; no browser-supplied owner ID is trusted for
// mutations. RLS enforces owner writes and active-member reads.
import { sanitizeCroppedJpeg } from "./photo-sanitize.js";
import { putPhoto, fetchPhoto, removePhoto } from "./photo-storage.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idOk = id => typeof id === "string" && UUID.test(id);
const SELECT = "SELECT id, user_id, object_key, width, height, sort_order, is_primary, created_at FROM app_private.member_photos";
const publicPhoto = row => ({
  id:row.id,width:row.width,height:row.height,
  sortOrder:row.sort_order,isPrimary:row.is_primary,
  createdAt:row.created_at,
});
function err(text,status=400){return {error:text,status};}
async function jsonInput(request,max=1200){
  if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json")) throw err("Expected JSON",415);
  const raw=await request.text();
  if(new TextEncoder().encode(raw).length>max) throw err("Request too large",413);
  try {
    const data=JSON.parse(raw);
    if(!data || typeof data!=="object" || Array.isArray(data)) throw Error();
    return data;
  } catch{ throw err("Invalid JSON"); }
}
export function isPhotoPath(path){
  return path==="/photos" || path==="/photos/" ||
    /^\/photos\/member\/[0-9a-f-]{36}\/?$/i.test(path) ||
    /^\/photos\/[0-9a-f-]{36}\/bytes\/?$/i.test(path) ||
    /^\/photos\/[0-9a-f-]{36}\/primary\/?$/i.test(path) ||
    /^\/photos\/[0-9a-f-]{36}\/?$/i.test(path) ||
    path==="/photos/order" || path==="/photos/order/";
}
export function photoMethodAllowed(path,method){
  if(path==="/photos"||path==="/photos/")return method==="GET"||method==="POST";
  if(path==="/photos/order"||path==="/photos/order/")return method==="PUT";
  if(/^\/photos\/member\//.test(path)||/\/bytes\/?$/.test(path))return method==="GET";
  if(/\/primary\/?$/.test(path))return method==="POST";
  return method==="DELETE";
}
export async function handlePhotoRequest(request,userId,url,withMember,jsonResponse) {
  const path=url.pathname;
  try{
    const ownList=path==="/photos" || path==="/photos/";
    const otherList=path.match(/^\/photos\/member\/([0-9a-f-]{36})\/?$/i);
    if((ownList && request.method==="GET") || otherList){
      const owner=otherList?otherList[1]:userId;
      if(!idOk(owner)) return jsonResponse(request,{error:"Invalid member"},400);
      const result=await withMember(userId,client=>client.query(
        SELECT+" WHERE user_id=$1::uuid ORDER BY sort_order,created_at,id",
        [owner]));
      return jsonResponse(request,{photos:result.rows.map(publicPhoto)});
    }
    const img=path.match(/^\/photos\/([0-9a-f-]{36})\/bytes\/?$/i);
    if(img){
      const row=await withMember(userId,async client=>{
        const found=await client.query(SELECT+" WHERE id=$1::uuid",[img[1]]);
        return found.rows[0] ?? null;
      });
      if(!row)return jsonResponse(request,{error:"Photo not found"},404);
      const jpeg=await fetchPhoto(row.object_key);
      const headers=new Headers({
        "Content-Type":"image/jpeg",
        "Cache-Control":"private, no-store",
        "X-Content-Type-Options":"nosniff",
        "Referrer-Policy":"no-referrer",
        "Content-Length":String(jpeg.byteLength),
      });
      const origin=request.headers.get("origin");
      const allowed=new Set(["https://ogcupid.com","https://www.ogcupid.com","https://ogcupid.onrender.com"]);
      if(process.env.NEON_BRANCH==="dev/private-member-accounts")allowed.add("http://localhost:5173");
      if(origin&&allowed.has(origin)){
        headers.set("Access-Control-Allow-Origin",origin);
        headers.set("Vary","Origin");
      }
      return new Response(jpeg,{status:200,headers});
    }
    if(ownList && request.method==="POST"){
      if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("image/jpeg")){
        return jsonResponse(request,{error:"Upload a cropped JPEG"},415);
      }
      const advertised=Number(request.headers.get("content-length") || 0);
      if(advertised>2_500_000) return jsonResponse(request,{error:"Photo is too large"},413);
      const raw=new Uint8Array(await request.arrayBuffer());
      let jpeg;
      try{ jpeg=sanitizeCroppedJpeg(raw); }
      catch{ return jsonResponse(request,{error:"Invalid photo; try cropping it again"},400); }
      const photoId=crypto.randomUUID();
      const key="profile-photos/"+userId+"/"+photoId+".jpg";
      await putPhoto(key,jpeg.bytes);
      try{
        const result=await withMember(userId,async client=>{
          // Lock the user's saved profile so concurrent uploads cannot exceed
          // the five-photo limit. The database trigger enforces it again.
          const owner=await client.query("SELECT user_id FROM app_private.member_profiles WHERE user_id=$1::uuid FOR UPDATE",[userId]);
          if(!owner.rowCount)throw err("Save your written profile before adding photos",409);
          const rows=await client.query(
            "SELECT sort_order FROM app_private.member_photos WHERE user_id=$1::uuid ORDER BY sort_order",[userId]);
          if(rows.rowCount>=5)throw err("Five photos is the current limit",409);
          const used=new Set(rows.rows.map(x=>Number(x.sort_order)));
          const position=[1,2,3,4,5].find(x=>!used.has(x));
          const ins=await client.query(
            "INSERT INTO app_private.member_photos (id,user_id,object_key,photo_bytes,width,height,sort_order,is_primary) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8) RETURNING id,width,height,sort_order,is_primary,created_at",
            [photoId,userId,key,jpeg.bytes.length,jpeg.width,jpeg.height,position,rows.rowCount===0]);
          return ins.rows[0];
        });
        return jsonResponse(request,{photo:publicPhoto(result)},201);
      }catch(error){
        await removePhoto(key).catch(()=>{ /* private orphan may require maintenance cleanup */ });
        throw error;
      }
    }
    if(path==="/photos/order" || path==="/photos/order/"){
      const body=await jsonInput(request);
      const order=body.order;
      if(!Array.isArray(order)||order.length>5||new Set(order).size!==order.length||
         !order.every(idOk))throw err("Invalid photo order");
      const result=await withMember(userId,async client=>{
        const owner=await client.query("SELECT user_id FROM app_private.member_profiles WHERE user_id=$1::uuid FOR UPDATE",[userId]);
        if(!owner.rowCount)throw err("Profile not found",404);
        const rows=await client.query("SELECT id FROM app_private.member_photos WHERE user_id=$1::uuid",[userId]);
        if(rows.rowCount!==order.length ||
           rows.rows.some(x=>!order.includes(x.id)))throw err("Photo list changed; refresh and try again",409);
        for(let i=0;i<order.length;i++){
          await client.query("UPDATE app_private.member_photos SET sort_order=$3 WHERE user_id=$1::uuid AND id=$2::uuid",[userId,order[i],i+1]);
        }
        return true;
      });
      return jsonResponse(request,{updated:result});
    }
    const primary=path.match(/^\/photos\/([0-9a-f-]{36})\/primary\/?$/i);
    if(primary){
      const updated=await withMember(userId,async client=>{
        const owner=await client.query("SELECT user_id FROM app_private.member_profiles WHERE user_id=$1::uuid FOR UPDATE",[userId]);
        if(!owner.rowCount)throw err("Profile not found",404);
        const candidate=await client.query(
          "SELECT id FROM app_private.member_photos WHERE user_id=$1::uuid AND id=$2::uuid",[userId,primary[1]]);
        if(!candidate.rowCount)throw err("Photo not found",404);
        await client.query("UPDATE app_private.member_photos SET is_primary=false WHERE user_id=$1::uuid AND is_primary=true",[userId]);
        await client.query("UPDATE app_private.member_photos SET is_primary=true WHERE user_id=$1::uuid AND id=$2::uuid",[userId,primary[1]]);
        return true;
      });
      return jsonResponse(request,{updated});
    }
    const photo=path.match(/^\/photos\/([0-9a-f-]{36})\/?$/i);
    if(photo && request.method==="DELETE"){
      const row=await withMember(userId,async client=>{
        const found=await client.query(SELECT+" WHERE user_id=$1::uuid AND id=$2::uuid",[userId,photo[1]]);
        return found.rows[0] ?? null;
      });
      if(!row) return jsonResponse(request,{error:"Photo not found"},404);
      await removePhoto(row.object_key);
      await withMember(userId,async client=>{
        const owner=await client.query("SELECT user_id FROM app_private.member_profiles WHERE user_id=$1::uuid FOR UPDATE",[userId]);
        if(!owner.rowCount)throw err("Profile no longer exists",404);
        await client.query("DELETE FROM app_private.member_photos WHERE user_id=$1::uuid AND id=$2::uuid",[userId,photo[1]]);
        if(row.is_primary){
          await client.query(
            "UPDATE app_private.member_photos SET is_primary=true WHERE id=("+
            "SELECT id FROM app_private.member_photos WHERE user_id=$1::uuid ORDER BY sort_order,created_at LIMIT 1)",[userId]);
        }
      });
      return jsonResponse(request,{deleted:true});
    }
    return jsonResponse(request,{error:"Not found"},404);
  }catch(error){
    if(error && typeof error==="object" && "status" in error && Number.isInteger(error.status)){
      return jsonResponse(request,{error:error.error},error.status);
    }
    // No storage credentials, paths, emails, SQL errors or member data in client errors.
    console.error("Profile photo API failed",error instanceof Error?error.name:"unknown");
    return jsonResponse(request,{error:"Photo service unavailable"},503);
  }
}
