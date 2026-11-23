// Published design is public; drafts, publication and rollback are admin-only.
// All SQL access uses SECURITY DEFINER functions with independent live role checks.
import {sanitizeEditorDraft,EDITOR_SCHEMA} from "../ogc-l-react/src/admin-ui-editor-model.mjs";

const base="/admin/ui-design";
export const isAdminUiDesignPath=path=>/^\/admin\/ui-design(?:\/(?:publish|rollback))?\/?$/.test(path);
export function adminUiDesignMethodAllowed(path,method){
  if(/^\/admin\/ui-design\/?$/.test(path))return method==="GET"||method==="PUT";
  if(/^\/admin\/ui-design\/(?:publish|rollback)\/?$/.test(path))return method==="POST";
  return false;
}
const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==="object"?
  Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
export function validatedDesign(value){
  if(!value||typeof value!=="object"||Array.isArray(value)||value.version!==EDITOR_SCHEMA)
    return null;
  const safe=sanitizeEditorDraft(value);
  if(JSON.stringify(sorted(value))!==JSON.stringify(sorted(safe)))return null;
  return safe;
}
async function readBody(request,keys){
  if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))
    return {error:"Expected JSON",status:415};
  if(Number(request.headers.get("content-length")||0)>120000)
    return {error:"Design too large",status:413};
  const text=await request.text();
  if(new TextEncoder().encode(text).byteLength>120000)
    return {error:"Design too large",status:413};
  let body;
  try{body=JSON.parse(text);}catch{return {error:"Invalid JSON",status:400};}
  if(!body||typeof body!=="object"||Array.isArray(body)||
     Object.keys(body).sort().join(",")!==keys.slice().sort().join(","))
    return {error:"Invalid request",status:400};
  return {body};
}
const versionOk=v=>Number.isSafeInteger(v)&&v>=0;
export async function handleAdminUiDesign(request,userId,url,withMember,json){
  const path=url.pathname;
  if(!isAdminUiDesignPath(path))return json(request,{error:"Not found"},404);
  if(!adminUiDesignMethodAllowed(path,request.method))
    return json(request,{error:"Method not allowed"},405);
  let sql="SELECT app_private.ui_design_admin_state() AS data",params=[];
  if(request.method==="PUT"){
    const parsed=await readBody(request,["document","expectedVersion"]);
    if(parsed.error)return json(request,{error:parsed.error},parsed.status);
    const document=validatedDesign(parsed.body.document);
    if(!document||!versionOk(parsed.body.expectedVersion))
      return json(request,{error:"Unsupported design schema or invalid draft version"},400);
    sql="SELECT app_private.ui_design_save_draft($1::jsonb,$2::bigint) AS data";
    params=[JSON.stringify(document),parsed.body.expectedVersion];
  }else if(path.includes("/publish")){
    const parsed=await readBody(request,["expectedVersion"]);
    if(parsed.error)return json(request,{error:parsed.error},parsed.status);
    if(!versionOk(parsed.body.expectedVersion))
      return json(request,{error:"Invalid draft version"},400);
    sql="SELECT app_private.ui_design_publish($1::bigint) AS data";
    params=[parsed.body.expectedVersion];
  }else if(path.includes("/rollback")){
    const parsed=await readBody(request,["revision","expectedVersion"]);
    if(parsed.error)return json(request,{error:parsed.error},parsed.status);
    if(!versionOk(parsed.body.expectedVersion)||
       !Number.isSafeInteger(parsed.body.revision)||parsed.body.revision<=0)
      return json(request,{error:"Invalid revision"},400);
    sql="SELECT app_private.ui_design_rollback($1::bigint,$2::bigint) AS data";
    params=[parsed.body.revision,parsed.body.expectedVersion];
  }
  try{
    const result=await withMember(userId,client=>client.query(sql,params));
    return json(request,{data:result.rows[0]?.data??null});
  }catch(error){
    if(error?.code==="42501")return json(request,{error:"Administrator access required"},403);
    if(error?.code==="22023")return json(request,{error:"Design changed; reload and try again"},409);
    console.error("UI design request failed",error instanceof Error?error.name:"unknown");
    return json(request,{error:"Design service unavailable"},503);
  }
}
export async function handlePublicUiDesign(request,pool,json){
  if(request.method!=="GET")return json(request,{error:"Method not allowed"},405);
  try{
    // No JWT, no member identity and no draft/history data in public response.
    const r=await pool.query("SELECT app_private.ui_design_public() AS data");
    const response=r.rows[0]?.data;
    return json(request,{data:{revision:response?.revision??null,
      document:sanitizeEditorDraft(response?.document)}});
  }catch(error){
    console.error("Published design unavailable",error instanceof Error?error.name:"unknown");
    return json(request,{error:"Published design unavailable"},503);
  }
}
