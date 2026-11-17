import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("./member-profile.ts",import.meta.url),"utf8");
const handler = readFileSync(new URL("./member-discovery.js",import.meta.url),"utf8");
const migration = readFileSync(new URL("../db/migrations/020_member_discovery_eligibility.sql",import.meta.url),"utf8");
const frontend = readFileSync(new URL("../public/desktop-2011-shell.js",import.meta.url),"utf8");

test("discovery is a GET-only authenticated member API route",()=>{
  assert.match(api,/url\.pathname === "\/discovery"/);
  assert.match(api,/discoveryPath \? request\.method === "GET"/);
  assert.match(api,/profilePath \|\| memberProfileMatch \|\| discoveryPath/);
  assert.match(api,/if \(!userId\) return json\(request, \{ error: "Unauthorized" \}, 401\)/);
  assert.match(api,/current_member_is_active\(\)/);
  assert.match(api,/handleDiscovery\(request,userId,withMember,json\)/);
});

test("finished onboarding gate only returns a boolean to active authenticated members",()=>{
  assert.match(migration,/SECURITY DEFINER/);
  assert.match(migration,/app_private\.current_member_is_active\(\)/);
  assert.match(migration,/o\.explored_at IS NOT NULL/);
  assert.match(migration,/REVOKE ALL ON FUNCTION app_private\.is_discoverable_member\(uuid\)/);
  assert.match(migration,/FROM PUBLIC, ogcupid_delete_api/);
  assert.match(migration,/TO ogcupid_member_api/);
  assert.doesNotMatch(migration,/GRANT SELECT ON app_private\.member_onboarding/);
});

test("discovery reads RLS filtered public choices only and does not return raw answers",()=>{
  assert.match(handler,/withMember\(userId, async client/);
  assert.match(handler,/app_private\.is_discoverable_member\(p\.user_id\)/);
  assert.match(handler,/p\.user_id <> \$1::uuid/);
  assert.match(handler,/AND is_private = false/);
  assert.match(handler,/MAX_CANDIDATES = 250/);
  assert.match(handler,/rankDiscoverableProfiles/);
  assert.doesNotMatch(handler,/JSON\.stringify\(answers\)/);
  assert.doesNotMatch(handler,/email|birth_date|object_key|password/i);
});

test("desktop member discovery handles unscored fallbacks without inventing percentages",()=>{
  assert.match(frontend,/state\.directory = Array\.isArray\(result\.profiles\)/);
  assert.match(frontend,/item\.matchPercent === null/);
  assert.match(frontend,/Not enough shared answers/);
  assert.match(frontend,/state\.recommendations = selectProfiles\(state\.directory\)/);
  assert.match(frontend,/state\.directory\.map\(async p/);
});
