// Administrator-only saved member content editing. JWT/liveness/origin checks
// happen in the parent Function; each SECURITY DEFINER RPC checks the live
// Neon Auth role again. This endpoint never uses member-owner bypass tokens.
import {sanitizeCroppedJpeg} from "./photo-sanitize.js";
import {putPhoto,fetchPhoto,removePhoto} from "./photo-storage.js";

const uuid="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const prefix=new RegExp("^/admin/members/("+uuid+")/(.+?)/?$","i");
const photoRoute=new RegExp("^photos/("+uuid+")(?:/(bytes|primary|replace))?$","i");
const answerRoute=/^answers\/(vault-[0-9]{1,25})$/;
function parseEditorPath(path){
  const m=path.match(prefix);
  if(!m)return null;
  const part=m[2],memberId=m[1].toLowerCase();
  if(["content","field","age-range","answers","photos"].includes(part))
    return {memberId,part,operation:null,resourceId:null};
  const answer=part.match(answerRoute);
  if(answer)return {memberId,part:"answers",operation:"delete",resourceId:answer[1]};
  const photo=part.match(photoRoute);
  if(photo)return {memberId,part:"photos",operation:photo[2]||"delete",
    resourceId:photo[1].toLowerCase()};
  return null;
}
export const isAdminEditorPath=path=>parseEditorPath(path)!==null;
export function adminEditorMethodAllowed(path,method){
  const route=parseEditorPath(path);
  if(!route)return false;
  const key=route.part+(route.operation?":"+route.operation:"");
  return ({
    content:"GET",field:"PUT","age-range":"PUT",answers:"PUT",
    "answers:delete":"DELETE",photos:"POST","photos:bytes":"GET",
    "photos:primary":"POST","photos:replace":"PUT","photos:delete":"DELETE"
  })[key]===method;
}
function error(message,status=400){return {error:message,status};}
async function jsonInput(request,keys,maxBytes=8200){
  if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))
    throw error("Expected JSON",415);
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>maxBytes)throw error("Request too large",413);
  let data;try{data=JSON.parse(raw);}catch{throw error("Invalid JSON");}
  if(!data||typeof data!=="object"||Array.isArray(data)||
    Object.keys(data).sort().join(",")!==keys.slice().sort().join(","))
    throw error("Invalid request");
  return data;
}
async function photoInput(request){
  const type=request.headers.get("content-type")||"";
  if(!type.toLowerCase().startsWith("multipart/form-data;"))throw error("Upload a JPEG",415);
  if(Number(request.headers.get("content-length")||0)>3_000_000)
    throw error("Photo is too large",413);
  const raw=new Uint8Array(await request.arrayBuffer());
  if(raw.byteLength>3_000_000)throw error("Photo is too large",413);
  const body=await new Request("https://internal.example/upload",{
    method:"POST",headers:{"Content-Type":type},body:raw
  }).formData().catch(()=>null);
  if(!body || [...body.keys()].sort().join(",")!=="photo")throw error("Image required");
  const file=body.get("photo");
  if(!file||typeof file!=="object"||file.type!=="image/jpeg"||
    file.size<80||file.size>2_500_000||typeof file.arrayBuffer!=="function")
    throw error("Upload a JPEG under 2.5 MB");
  let jpeg;
  try{jpeg=sanitizeCroppedJpeg(new Uint8Array(await file.arrayBuffer()));}
  catch{throw error("Invalid cropped JPEG");}
  return {jpeg};
}
function photoResponse(request,bytes){
  const headers=new Headers({
    "Content-Type":"image/jpeg","Cache-Control":"private, no-store",
    "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
    "Content-Length":String(bytes.byteLength),"Vary":"Origin"
  });
  const origin=request.headers.get("origin");
  const allowed=new Set(["https://ogcupid.com","https://www.ogcupid.com",
    "https://ogcupid.onrender.com","https://ogcupid-l-staging.onrender.com"]);
  if(["dev/private-member-accounts","dev/canonical-onboarding-2026-11-13"].includes(
    process.env.NEON_BRANCH||""))allowed.add("http://localhost:5173");
  if(origin&&allowed.has(origin))headers.set("Access-Control-Allow-Origin",origin);
  return new Response(bytes,{status:200,headers});
}
export async function handleAdminEditor(request,userId,url,withMember,json){
  const route=parseEditorPath(url.pathname);
  if(!route)return json(request,{error:"Not found"},404);
  if(!adminEditorMethodAllowed(url.pathname,request.method))
    return json(request,{error:"Method not allowed"},405);
  const target=route.memberId;
  const query=async(sql,params=[])=>{
    const r=await withMember(userId,client=>client.query(sql,params));
    return r.rows[0]?.data??null;
  };
  try{
    if(route.part==="content"){
      const data=await query("SELECT app_private.admin_member_content($1::uuid) AS data",[target]);
      return data===null?json(request,{error:"Member not found"},404):json(request,{data});
    }
    if(route.part==="field"){
      const body=await jsonInput(request,["field","value"]);
      if(typeof body.field!=="string"||typeof body.value!=="string"||
        body.value.length>5000)throw error("Invalid profile edit");
      const data=await query("SELECT app_private.admin_edit_member_field($1::uuid,$2::text,$3::text,$4::text) AS data",
        [target,body.field,body.value,null]);
      return json(request,{data});
    }
    if(route.part==="age-range"){
      const body=await jsonInput(request,["min","max"]);
      if(!((body.min===null&&body.max===null)||
           (Number.isInteger(body.min)&&Number.isInteger(body.max)&&
            body.min>=18&&body.max<=99&&body.min<=body.max)))
        throw error("Invalid age preference");
      const data=await query("SELECT app_private.admin_edit_member_age_range($1::uuid,$2::integer,$3::integer,$4::text) AS data",
        [target,body.min,body.max,null]);
      return json(request,{data});
    }
    if(route.part==="answers"&&route.operation==="delete"){
      const data=await query("SELECT app_private.admin_delete_member_answer($1::uuid,$2::text,$3::text) AS data",
        [target,route.resourceId,null]);
      return json(request,{data});
    }
    if(route.part==="answers"){
      const body=await jsonInput(request,
        ["questionId","optionId","acceptableOptions","importance","isPrivate","note"]);
      if(typeof body.questionId!=="string"||
        !/^vault-[0-9]{1,25}$/.test(body.questionId)||
        typeof body.optionId!=="string"||!/^option-[0-9]{1,20}$/.test(body.optionId)||
        !Array.isArray(body.acceptableOptions)||body.acceptableOptions.length>20||
        !body.acceptableOptions.every(x=>typeof x==="string"&&/^option-[0-9]{1,20}$/.test(x))||
        ![0,1,10,50,250].includes(body.importance)||
        typeof body.isPrivate!=="boolean"||
        typeof body.note!=="string"||body.note.length>400)
        throw error("Invalid answer");
      const data=await query("SELECT app_private.admin_save_member_answer($1::uuid,$2::text,$3::text,$4::text[],$5::integer,$6::boolean,$7::text,$8::text) AS data",
        [target,body.questionId,body.optionId,body.acceptableOptions,body.importance,
          body.isPrivate,body.note,null]);
      return json(request,{data});
    }
    if(route.part!=="photos")return json(request,{error:"Not found"},404);
    if(route.operation==="bytes"){
      const key=await query("SELECT app_private.admin_member_photo_key($1::uuid,$2::uuid) AS data",
        [target,route.resourceId]);
      if(!key)return json(request,{error:"Photo not found"},404);
      return photoResponse(request,await fetchPhoto(key));
    }
    if(route.operation==="primary"||route.operation==="delete"){
      if(route.operation==="primary"){
        const data=await query("SELECT app_private.admin_primary_member_photo($1::uuid,$2::uuid,$3::text) AS data",
          [target,route.resourceId,null]);
        return json(request,{data});
      }
      const key=await query("SELECT app_private.admin_delete_member_photo($1::uuid,$2::uuid,$3::text) AS data",
        [target,route.resourceId,null]);
      if(!key)return json(request,{error:"Photo not found"},404);
      // After the DB has removed the protected photo row, a storage failure
      // leaves only an unreachable orphan, not a broken member profile.
      let storageCleanupPending=false;
      try{await removePhoto(key);}catch{storageCleanupPending=true;}
      return json(request,{data:{deleted:true,storageCleanupPending}});
    }
    if(route.operation==="replace"){
      const key=await query("SELECT app_private.admin_member_photo_key($1::uuid,$2::uuid) AS data",
        [target,route.resourceId]);
      if(!key)return json(request,{error:"Photo not found"},404);
      const {jpeg}=await photoInput(request);
      await putPhoto(key,jpeg.bytes);
      const data=await query("SELECT app_private.admin_replace_member_photo($1::uuid,$2::uuid,$3::integer,$4::integer,$5::integer,$6::text) AS data",
        [target,route.resourceId,jpeg.bytes.length,jpeg.width,jpeg.height,null]);
      return json(request,{data});
    }
    const permitted=await query("SELECT app_private.admin_member_photo_preflight($1::uuid) AS data",[target]);
    if(permitted!==true)throw error("Profile missing or album full",409);
    const {jpeg}=await photoInput(request);
    const photoId=crypto.randomUUID();
    const key="profile-photos/"+target+"/"+photoId+".jpg";
    await putPhoto(key,jpeg.bytes);
    try{
      const data=await query("SELECT app_private.admin_add_member_photo($1::uuid,$2::uuid,$3::integer,$4::integer,$5::integer,$6::text) AS data",
        [target,photoId,jpeg.bytes.length,jpeg.width,jpeg.height,null]);
      return json(request,{data},201);
    }catch(e){
      await removePhoto(key).catch(()=>{});
      throw e;
    }
  }catch(e){
    if(e?.status)return json(request,{error:e.error},e.status);
    if(e?.code==="42501")return json(request,{error:"Administrator access required"},403);
    if(e?.code==="22023"||e?.code==="23514")return json(request,{error:"Invalid or stale content edit"},409);
    if(e?.code==="23505")return json(request,{error:"Content was updated elsewhere; reload"},409);
    console.error("Admin content editor failed",e instanceof Error?e.name:"unknown");
    return json(request,{error:"Admin content service unavailable"},503);
  }
}
