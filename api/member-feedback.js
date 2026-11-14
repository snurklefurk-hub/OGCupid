// Beta feedback: authenticated, write-only for members; only Neon DB owner
// can review submissions. Never echo another member's comments back to clients.
export async function handleFeedback(request, memberId, withMember, respond) {
  if(request.method !== "POST") return respond(request,{error:"Method not allowed"},405);
  if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))
    return respond(request,{error:"Expected JSON"},415);
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength > 4096)
    return respond(request,{error:"Feedback is too long"},413);
  let body;
  try { body=JSON.parse(raw); }
  catch { return respond(request,{error:"Invalid JSON"},400); }
  if(!body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).sort().join(",") !== "message,pagePath" ||
    typeof body.message !== "string" || typeof body.pagePath !== "string" ||
    !body.message.trim() || body.message.length > 1200 ||
    body.pagePath.length > 240 || (!/^\/[A-Za-z0-9_./~-]*$/.test(body.pagePath) || body.pagePath.startsWith("//")))
    return respond(request,{error:"Please enter feedback (up to 1200 characters)"},400);
  try {
    const result=await withMember(memberId,client=>client.query(
      "SELECT app_private.submit_site_feedback($1::text, $2::text) AS id",
      [body.message,body.pagePath],
    ));
    return respond(request,{saved:true,id:Number(result.rows[0].id)},201);
  } catch(e) {
    if(e?.code === "P0001") return respond(request,{error:"A couple of notes are plenty for now. Please try again later."},429);
    if(e?.code === "22023") return respond(request,{error:"Invalid feedback"},400);
    if(e?.code === "42501") return respond(request,{error:"Please sign in again."},401);
    throw e;
  }
}
