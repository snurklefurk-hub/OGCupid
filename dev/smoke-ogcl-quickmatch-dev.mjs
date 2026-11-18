// Credential-free smoke tests for the isolated Quickmatch PAIR STATE Function.
// Never sends a member JWT or performs an authenticated database mutation.
import assert from "node:assert/strict";
const API="https://br-tiny-wave-bbnpjp0m-members.compute.c-15.us-east-1.aws.neon.tech";
const ORIGIN="http://localhost:5173";
async function probe(path,method,body,origin=ORIGIN){
  const response=await fetch(API+path,{method,headers:{
    Origin:origin,Accept:"application/json",
    ...(body?{"Content-Type":"application/json"}:{})
  },...(body?{body:JSON.stringify(body)}:{}),
  redirect:"error",cache:"no-store",signal:AbortSignal.timeout(30000)});
  return response;
}
const preflight=await fetch(API+"/quickmatch",{
  method:"OPTIONS",
  headers:{Origin:ORIGIN,"Access-Control-Request-Method":"PUT",
    "Access-Control-Request-Headers":"authorization,content-type"},
  signal:AbortSignal.timeout(30000)
});
assert.equal(preflight.status,204,"Dev origin should be accepted only for preflight");
assert.equal(preflight.headers.get("access-control-allow-origin"),ORIGIN);
const guest=await probe("/quickmatch","GET");
assert.equal(guest.status,401,"Quickmatch data must never be readable without JWT");
assert.equal(guest.headers.get("access-control-allow-origin"),ORIGIN);
const guestPut=await probe("/quickmatch","PUT",{
  targetUserId:"00000000-0000-4000-8000-000000000002",decision:"like"
});
assert.equal(guestPut.status,401,"Guest must not be able to persist Likes");
const forbidden=await probe("/quickmatch","GET",undefined,"https://attacker.example");
assert.equal(forbidden.status,403,"Unknown origins must be denied");
assert.equal(forbidden.headers.get("access-control-allow-origin"),null);
console.log("PASS: Quickmatch dev Function denies anonymous read/write and untrusted origins");
