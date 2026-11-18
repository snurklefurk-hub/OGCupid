// Credential-free live smoke against the isolated Neon development Function.
// This checks auth/CORS guardrails only; it NEVER sends messages or accesses accounts.
const base=process.env.OGC_MEMBER_API_URL;
if(!base || !/^https:\/\/[a-z0-9.-]+\/$/.test(base))
  throw Error("Expected exact HTTPS development Function origin with trailing slash.");
const peer="00000000-0000-4000-8000-000000000002";
const allowed="https://ogcupid-l-staging.onrender.com";
async function probe(path,method,origin,status){
  const response=await fetch(base+path,{
    method,redirect:"error",
    headers:{"Origin":origin,"Accept":"application/json",
      ...(method==="POST"?{"Content-Type":"application/json"}:{})},
    ...(method==="POST"?{body:JSON.stringify({body:"Never sent: no bearer token"})}:{})
  });
  if(response.status!==status)
    throw Error(`Unexpected ${method} ${path} response: ${response.status} instead of ${status}`);
  if(status===401 && response.headers.get("access-control-allow-origin")!==allowed)
    throw Error("Signed-out staging origin lacks the exact CORS allow header.");
  if(status===403 && response.headers.has("access-control-allow-origin"))
    throw Error("Unknown origin was given member API CORS permission.");
  return response;
}
await probe("messages","GET",allowed,401);
await probe("messages/"+peer,"GET",allowed,401);
await probe("messages/"+peer,"POST",allowed,401);
await probe("messages/"+peer+"/block","PUT",allowed,401);
await probe("messages/"+peer+"/report","POST",allowed,401);
await probe("messages","GET","https://untrusted.invalid",403);
const preflight=await probe("messages","OPTIONS",allowed,204);
if(preflight.headers.get("access-control-allow-origin")!==allowed)
  throw Error("Authorized browser preflight was not allowed.");
process.stdout.write("Neon messages auth + CORS smoke passed; no member data read or written.\n");
