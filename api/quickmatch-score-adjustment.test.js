import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {adjustedViewerMatchPercent} from "./member-discovery.js";
const source=readFileSync(new URL("./member-discovery.js",import.meta.url),"utf8");

test("viewer-only dislike adjustment subtracts fixed percentage points",()=>{
  assert.equal(adjustedViewerMatchPercent(85,5),80);
  assert.equal(adjustedViewerMatchPercent(85,10),75);
  assert.equal(adjustedViewerMatchPercent(3,5),0);
  assert.equal(adjustedViewerMatchPercent(0,10),0);
  assert.equal(adjustedViewerMatchPercent(100,0),100);
  assert.equal(adjustedViewerMatchPercent(null,10),null);
});

test("invalid or invented raw scores can never turn into a compatibility percent",()=>{
  for(const bad of [undefined,NaN,Infinity,-1,101,"75"]) {
    assert.throws(()=>adjustedViewerMatchPercent(bad,5),RangeError);
  }
  assert.throws(()=>adjustedViewerMatchPercent(60,17),RangeError);
});

test("penalty rows are read only for JWT-scoped viewer, not target members",()=>{
  assert.match(source,/WHERE user_id=\$1::uuid AND match_penalty_points>0/);
  assert.match(source,/const penalty=results\.penalties\.get\(member\.userId\) \|\| 0/);
  assert.match(source,/adjustedViewerMatchPercent\(member\.matchPercent,penalty\)/);
  assert.doesNotMatch(source,/friendPercent\s*:/);
});
