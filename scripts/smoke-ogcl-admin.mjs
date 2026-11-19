// Credential-free smoke test for deployed member Function admin routing.
// Never log or obtain member tokens, cookies, email addresses or credentials.
const bases=[
  "https://br-tiny-wave-bbnpjp0m-members.compute.c-15.us-east-1.aws.neon.tech/",
  "https://br-plain-unit-bbcbxpqq-members.compute.c-15.us-east-1.aws.neon.tech/"
];
const origin="https://ogcupid-l-staging.onrender.com";
for(const base of bases){
  const url=new URL("admin",base);
  const response=await fetch(url,{headers:{Origin:origin,Accept:"application/json"},signal:AbortSignal.timeout(12000)});
  if(response.status!==401)throw new Error("Admin route not protected on "+url.host+": "+response.status);
  if(response.headers.get("access-control-allow-origin")!==origin)throw new Error("Staging CORS origin mismatch");
  if(response.headers.get("cache-control")!=="no-store")throw new Error("Admin route must be non-cacheable");
  const preflight=await fetch(url,{
    method:"OPTIONS",headers:{Origin:origin,"Access-Control-Request-Method":"POST"},
    signal:AbortSignal.timeout(12000)
  });
  if(preflight.status!==204)throw new Error("Admin preflight failed: "+preflight.status);
  const unknown=await fetch(url,{headers:{Origin:"https://untrusted.invalid"},signal:AbortSignal.timeout(12000)});
  if(unknown.status!==403)throw new Error("Untrusted origin not denied");
  console.log("Protected administrator route and CORS verified on "+url.host);
}