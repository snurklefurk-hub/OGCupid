import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source = readFileSync(new URL("./member-photos.js", import.meta.url), "utf8");
const allowlist = source.match(/const allowed=new Set\(\[([^\]]+)\]\);/)?.[1] || "";
const allowed = [...allowlist.matchAll(/"https:\/\/[^"]+"/g)].map(x=>x[0].slice(1,-1));

test("photo JPEG responses permit the exact OGC-L staging origin, not wildcards",()=>{
  assert.deepEqual(allowed.sort(),[
    "https://ogcupid.com", "https://www.ogcupid.com",
    "https://ogcupid.onrender.com", "https://ogcupid-l-staging.onrender.com"
  ].sort());
  assert.match(source,/if\(origin&&allowed\.has\(origin\)\)/);
  assert.match(source,/headers\.set\("Access-Control-Allow-Origin",origin\)/);
  assert.doesNotMatch(source,/"Access-Control-Allow-Origin","\*"/);
});
test("JPEG bytes still require a verified member, a valid photo and private no-store response",()=>{
  assert.match(source,/handlePhotoRequest\(request,userId,url,withMember,jsonResponse\)/);
  assert.match(source,/const row=await withMember\(userId/);
  assert.match(source,/if\(!row\)return jsonResponse\(request,\{error:"Photo not found"\},404\)/);
  assert.match(source,/"Cache-Control":"private, no-store"/);
  assert.match(source,/"Content-Type":"image\/jpeg"/);
});
