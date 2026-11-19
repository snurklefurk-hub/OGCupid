import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const api = readFileSync(new URL("./member-profile.ts", import.meta.url), "utf8");
const corsList = api.match(/const allowedOrigins = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? "";
const origins = [...corsList.matchAll(/"https:\/\/[a-z0-9.-]+"/g)].map(m => m[0].slice(1,-1));

test("member Function permits exactly the three production OGC origins plus isolated staging", () => {
  assert.deepEqual(origins.sort(),[
    "https://ogcupid.com",
    "https://www.ogcupid.com",
    "https://ogcupid.onrender.com",
    "https://ogcupid-l-staging.onrender.com"
  ].sort());
});

test("staging permission retains restrictive origin echo and existing JWT plus member-liveness checks", () => {
  assert.match(api, /origin && allowedOrigins\.has\(origin\)/);
  assert.match(api, /h\.set\("Access-Control-Allow-Origin", origin\)/);
  assert.doesNotMatch(api, /"Access-Control-Allow-Origin",\s*"\*"/);
  assert.match(api, /const userId = await authenticatedUserId\(request\)/);
  assert.match(api, /if \(!userId\) return json\(request, \{ error: "Unauthorized" \}, 401\)/);
  assert.match(api, /app_private\.current_member_is_active\(\)/);
  assert.match(api, /SELECT set_config\('app\.current_user_id'/);
});
