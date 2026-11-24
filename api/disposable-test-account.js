// Only Neon's authenticated schedule delivery may initiate cleanup.
// The database independently restricts deletion to the exact test email.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export async function handleTestAccountPurge(request,withDeletionAuthority,removePhotoPrefix,json,now=Date.now()){
  if(request.method!=="POST")return json(request,{error:"Method not allowed"},405);
  const invocation=request.headers.get("x-neon-trigger-invocation-id");
  if(!invocation)return json(request,{error:"Unauthorized"},401);
  let event;
  try{
    const raw=await request.text();
    if(raw.length>16000)throw Error("Invalid event");
    event=JSON.parse(raw);
    if(event?.version!==1||event.invocation_id!==invocation||
       event.trigger?.type!=="schedule"||event.trigger?.name!=="ogc-disposable-test-account")throw Error("Invalid event");
  }catch{return json(request,{error:"Invalid trigger delivery"},400);}
  const cutoff=Date.parse(event.data?.scheduled_at);
  if(!Number.isFinite(cutoff)||cutoff>now||cutoff<now-86400000||cutoff%900000!==0)
    return json(request,{error:"Invalid scheduled time"},400);
  try{
    const pending=await withDeletionAuthority("",client=>client.query(
      "SELECT app_private.purge_disposable_test_account($1::timestamptz) AS user_id",[new Date(cutoff).toISOString()]));
    let failed=0;
    for(const row of pending.rows){
      if(!UUID.test(row.user_id)){failed++;continue;}
      try{
        await removePhotoPrefix(row.user_id);
        await withDeletionAuthority("",client=>client.query(
          "SELECT app_private.finish_disposable_test_photo_cleanup($1::uuid)",[row.user_id]));
      }catch{failed++;}
    }
    if(failed)return json(request,{error:"Test account storage cleanup must retry"},503);
    return json(request,{ok:true,cleaned:pending.rows.length});
  }catch{return json(request,{error:"Test account cleanup failed"},503);}
}
