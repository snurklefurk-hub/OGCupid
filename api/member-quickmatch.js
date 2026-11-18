// Quickmatch votes are private member decisions, NOT public matches or messages.
// Caller supplies a JWT-verified user id and the existing transaction-scoped
// withMember callback; client-supplied user ids never establish ownership.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECISIONS=new Set(["like","dislike"]);

export async function handleQuickmatch(request,userId,withMember,json) {
  if(request.method!=="GET" && request.method!=="PUT")
    return json(request,{error:"Method not allowed"},405);
  if(request.method==="GET") {
    const result=await withMember(userId,async client=>{
      const eligible=await client.query(
        "SELECT app_private.is_discoverable_member($1::uuid) AS eligible",[userId]);
      if(eligible.rows[0]?.eligible!==true)return null;
      return client.query(
        `SELECT target_user_id,decision FROM app_private.member_quickmatch_decisions
         WHERE user_id=$1::uuid ORDER BY updated_at DESC, target_user_id LIMIT 5000`,[userId]);
    });
    if(!result)return json(request,{error:"Complete onboarding before Quickmatch"},403);
    return json(request,{decisions:result.rows.map(row=>({
      targetUserId:String(row.target_user_id).toLowerCase(),decision:row.decision
    }))});
  }

  if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))
    return json(request,{error:"Expected JSON"},415);
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>512)
    return json(request,{error:"Request too large"},413);
  let data;
  try{data=JSON.parse(raw);}
  catch{return json(request,{error:"Invalid JSON"},400);}
  if(!data || typeof data!=="object" || Array.isArray(data) ||
      Object.keys(data).sort().join(",")!=="decision,targetUserId" ||
      typeof data.targetUserId!=="string" || !UUID.test(data.targetUserId) ||
      !DECISIONS.has(data.decision))
    return json(request,{error:"Invalid Quickmatch decision"},400);
  const targetId=data.targetUserId.toLowerCase();
  if(targetId===userId)return json(request,{error:"Cannot rate yourself"},400);

  // The active-member and completed-onboarding checks are in the database
  // transaction, so an unavailable, deleted or draft target cannot be rated.
  const saved=await withMember(userId,async client=>{
    const result=await client.query(
      `INSERT INTO app_private.member_quickmatch_decisions
         (user_id,target_user_id,decision)
       SELECT $1::uuid,$2::uuid,$3::text
       WHERE app_private.is_discoverable_member($1::uuid)
         AND app_private.is_discoverable_member($2::uuid)
       ON CONFLICT (user_id,target_user_id)
       DO UPDATE SET decision=EXCLUDED.decision,updated_at=now()
       RETURNING target_user_id,decision`,[userId,targetId,data.decision]);
    return result.rows[0]||null;
  });
  if(!saved)return json(request,{error:"This member is not available for Quickmatch"},409);
  return json(request,{saved:true,targetUserId:String(saved.target_user_id).toLowerCase(),
    decision:saved.decision});
}
