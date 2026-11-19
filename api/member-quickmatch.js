// Member-only Quickmatch pair state. User id is always the JWT-verified actor.
// Database helpers enforce bilateral cooldowns, strikes and Like cancellation.
// No member can directly write another member's decision row.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECISIONS=new Set(["like","dislike"]);
const normalize=id=>String(id).toLowerCase();

export async function handleQuickmatch(request,userId,withMember,json) {
  if(request.method!=="GET" && request.method!=="PUT")
    return json(request,{error:"Method not allowed"},405);
  if(request.method==="GET") {
    const state=await withMember(userId,async client=>{
      const eligible=await client.query(
        "SELECT app_private.is_discoverable_member($1::uuid) AS eligible",[userId]);
      if(eligible.rows[0]?.eligible!==true)return null;
      // Only the caller's decisions may be read directly through owner RLS.
      const own=await client.query(
        `SELECT target_user_id,decision,updated_at
         FROM app_private.member_quickmatch_decisions
         WHERE user_id=$1::uuid AND decision IS NOT NULL
         ORDER BY updated_at DESC,target_user_id LIMIT 5000`,[userId]);
      // The SECURITY DEFINER predicate returns only a boolean. A target's
      // dislike direction/count and private preferences are NOT serialized.
      const queue=await client.query(
        `SELECT p.user_id
         FROM app_private.member_profiles AS p
         WHERE p.user_id<>$1::uuid
           AND app_private.quickmatch_can_show($1::uuid,p.user_id)
         ORDER BY p.created_at DESC,p.user_id LIMIT 250`,[userId]);
      const outgoing=await client.query(
        `SELECT target_user_id,updated_at
         FROM app_private.member_quickmatch_decisions
         WHERE user_id=$1::uuid AND decision='like'
           AND app_private.quickmatch_pair_permitted($1::uuid,target_user_id)
         ORDER BY updated_at DESC LIMIT 5000`,[userId]);
      // Incoming likes are voluntarily exposed only to the recipient.
      const incoming=await client.query(
        "SELECT target_user_id,liked_at FROM app_private.quickmatch_incoming_likes($1::uuid)",[userId]);
      return {own:own.rows,queue:queue.rows,outgoing:outgoing.rows,incoming:incoming.rows};
    });
    if(!state)return json(request,{error:"Complete onboarding before Quickmatch"},403);
    const outgoing=state.outgoing.map(x=>normalize(x.target_user_id));
    const incoming=state.incoming.map(x=>normalize(x.target_user_id));
    const incomingSet=new Set(incoming);
    return json(request,{
      decisions:state.own.map(row=>({
        targetUserId:normalize(row.target_user_id),decision:row.decision
      })),
      eligibleUserIds:state.queue.map(row=>normalize(row.user_id)),
      outgoingLikes:outgoing,
      incomingLikes:incoming,
      mutualUserIds:outgoing.filter(id=>incomingSet.has(id))
    });
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
  const targetId=normalize(data.targetUserId);
  if(targetId===userId)return json(request,{error:"Cannot rate yourself"},400);

  const result=await withMember(userId,client=>client.query(
    "SELECT app_private.quickmatch_decide($1::uuid,$2::uuid,$3::text) AS saved",
    [userId,targetId,data.decision]));
  if(result.rows[0]?.saved!==true)
    return json(request,{error:"This pair is currently unavailable for Quickmatch"},409);
  return json(request,{saved:true,targetUserId:targetId,decision:data.decision});
}
