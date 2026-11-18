// Private one-to-one messaging behind the existing Neon JWT/liveness gate.
// All database calls execute with SET LOCAL app.current_user_id and forced RLS.
// No public search, push notifications, profile scraping or moderation claims.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS=new Set(["spam","harassment","other"]);
const ROUTE=/^\/messages(?:\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/(block|report))?)?\/?$/i;

function asMessage(row){
  return {id:String(row.id).toLowerCase(),senderId:String(row.sender_id).toLowerCase(),
    recipientId:String(row.recipient_id).toLowerCase(),body:String(row.body),
    createdAt:new Date(row.created_at).toISOString()};
}
async function parseBody(request,maxBytes,keys){
  if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))
    return {status:415,error:"Expected JSON"};
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>maxBytes)return {status:413,error:"Request too large"};
  let body;
  try{body=JSON.parse(raw);}catch{return {status:400,error:"Invalid JSON"};}
  if(!body||typeof body!=="object"||Array.isArray(body)||
      Object.keys(body).sort().join(",")!==keys.slice().sort().join(","))
    return {status:400,error:"Invalid request"};
  return {body};
}

export async function handleMessages(request,userId,url,withMember,json){
  const parsed=url.pathname.match(ROUTE);
  if(!parsed)return json(request,{error:"Not found"},404);
  const peerId=parsed[1]?.toLowerCase()||null;
  const action=parsed[2]||"";
  if(!peerId && request.method!=="GET" || action==="block" && !["PUT","DELETE"].includes(request.method) ||
      action==="report" && request.method!=="POST" ||
      peerId && !action && !["GET","POST"].includes(request.method))
    return json(request,{error:"Method not allowed"},405);
  if(peerId===userId)return json(request,{error:"Cannot message yourself"},400);

  if(!peerId){
    const data=await withMember(userId,async client=>{
      const eligible=await client.query("SELECT app_private.is_discoverable_member($1::uuid) AS ok",[userId]);
      if(eligible.rows[0]?.ok!==true)return null;
      return client.query(
        `WITH latest AS (
           SELECT DISTINCT ON (peer_id)
             peer_id,id,sender_id,recipient_id,body,created_at
           FROM (
             SELECT CASE WHEN sender_id=$1::uuid THEN recipient_id ELSE sender_id END AS peer_id,
               id,sender_id,recipient_id,body,created_at
             FROM app_private.member_messages
             WHERE sender_id=$1::uuid OR recipient_id=$1::uuid
           ) conversations
           ORDER BY peer_id,created_at DESC,id DESC
         )
         SELECT latest.peer_id,latest.id,latest.sender_id,latest.recipient_id,
           latest.body,latest.created_at,p.display_name,r.slug
         FROM latest
         JOIN app_private.member_profiles p ON p.user_id=latest.peer_id
         JOIN app_private.member_profile_routes r ON r.user_id=latest.peer_id
         ORDER BY latest.created_at DESC,latest.id DESC LIMIT 50`,[userId]);
    });
    if(!data)return json(request,{error:"Complete onboarding before messaging"},403);
    return json(request,{conversations:data.rows.map(row=>({
      peerId:String(row.peer_id).toLowerCase(),displayName:String(row.display_name),
      slug:String(row.slug),lastMessage:asMessage(row)
    }))});
  }

  if(action==="report"){
    const parsedBody=await parseBody(request,320,["messageId","reason"]);
    if(parsedBody.error)return json(request,{error:parsedBody.error},parsedBody.status);
    const {messageId,reason}=parsedBody.body;
    if(typeof messageId!=="string"||!UUID.test(messageId)||!REASONS.has(reason))
      return json(request,{error:"Invalid report"},400);
    const reported=await withMember(userId,async client=>{
      const evidence=await client.query(
        `SELECT 1 FROM app_private.member_messages
         WHERE id=$1::uuid AND sender_id=$2::uuid AND recipient_id=$3::uuid`,
        [messageId.toLowerCase(),peerId,userId]);
      if(!evidence.rows.length)return false;
      await client.query(
        `INSERT INTO app_private.member_message_reports(reporter_id,message_id,reason)
         VALUES($1::uuid,$2::uuid,$3::text)
         ON CONFLICT (reporter_id,message_id) DO NOTHING`,
        [userId,messageId.toLowerCase(),reason]);
      return true;
    });
    return reported?json(request,{reported:true}):json(request,{error:"Message unavailable"},404);
  }

  if(action==="block"){
    if(request.method==="DELETE"){
      await withMember(userId,client=>client.query(
        `DELETE FROM app_private.member_message_blocks
         WHERE blocker_id=$1::uuid AND blocked_id=$2::uuid`,[userId,peerId]));
      return json(request,{blocked:false});
    }
    const result=await withMember(userId,async client=>{
      const target=await client.query(
        "SELECT 1 FROM app_private.member_profile_routes WHERE user_id=$1::uuid",[peerId]);
      if(!target.rows.length)return false;
      await client.query(
        `INSERT INTO app_private.member_message_blocks(blocker_id,blocked_id)
         VALUES($1::uuid,$2::uuid) ON CONFLICT DO NOTHING`,[userId,peerId]);
      return true;
    });
    return result?json(request,{blocked:true}):json(request,{error:"Member unavailable"},404);
  }

  if(request.method==="GET"){
    const result=await withMember(userId,async client=>{
      const target=await client.query(
        `SELECT p.display_name,r.slug FROM app_private.member_profiles p
         JOIN app_private.member_profile_routes r ON r.user_id=p.user_id
         WHERE p.user_id=$1::uuid`,[peerId]);
      if(!target.rows.length)return null;
      const [messages,ownBlock,canSend]=await Promise.all([
        client.query(
          `SELECT id,sender_id,recipient_id,body,created_at
           FROM app_private.member_messages
           WHERE (sender_id=$1::uuid AND recipient_id=$2::uuid)
              OR (sender_id=$2::uuid AND recipient_id=$1::uuid)
           ORDER BY created_at DESC,id DESC LIMIT 100`,[userId,peerId]),
        client.query(
          `SELECT 1 FROM app_private.member_message_blocks
           WHERE blocker_id=$1::uuid AND blocked_id=$2::uuid`,[userId,peerId]),
        client.query("SELECT app_private.can_message_member($1::uuid) AS allowed",[peerId])
      ]);
      return {target:target.rows[0],messages:messages.rows,blocked:ownBlock.rows.length>0,
        canSend:canSend.rows[0]?.allowed===true};
    });
    if(!result)return json(request,{error:"Conversation unavailable"},404);
    return json(request,{peer:{userId:peerId,displayName:String(result.target.display_name),
      slug:String(result.target.slug)},messages:result.messages.reverse().map(asMessage),
      blocked:result.blocked,canSend:result.canSend});
  }

  const parsedBody=await parseBody(request,9000,["body"]);
  if(parsedBody.error)return json(request,{error:parsedBody.error},parsedBody.status);
  const body=parsedBody.body.body;
  if(typeof body!=="string"||!body.trim()||body.trim().length>2000)
    return json(request,{error:"Messages must be 1 to 2000 characters"},400);
  const saved=await withMember(userId,async client=>{
    // Serialize sends by sender so concurrent requests cannot evade throttles.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 222))",[userId]);
    const permission=await client.query("SELECT app_private.can_message_member($1::uuid) AS allowed",[peerId]);
    if(permission.rows[0]?.allowed!==true)return {status:409};
    const volume=await client.query(
      `SELECT count(*)::int AS daily,
         COALESCE(bool_or(created_at>now()-interval '8 seconds'),false) AS too_soon
       FROM app_private.member_messages
       WHERE sender_id=$1::uuid AND created_at>now()-interval '24 hours'`,[userId]);
    if(Number(volume.rows[0]?.daily)>=60||volume.rows[0]?.too_soon===true)return {status:429};
    const result=await client.query(
      `INSERT INTO app_private.member_messages(sender_id,recipient_id,body)
       VALUES($1::uuid,$2::uuid,$3::text)
       RETURNING id,sender_id,recipient_id,body,created_at`,
      [userId,peerId,body.trim()]);
    return {message:asMessage(result.rows[0])};
  });
  if(saved.status===409)return json(request,{error:"This member cannot receive a message"},409);
  if(saved.status===429)return json(request,{error:"Message limit reached. Please try later."},429);
  return json(request,{sent:true,message:saved.message});
}
