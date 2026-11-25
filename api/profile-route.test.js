import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("./member-profile.ts",import.meta.url),"utf8");
const migration = readFileSync(new URL("../db/migrations/017_member_only_profile_urls.sql",import.meta.url),"utf8");
const photos = readFileSync(new URL("../db/migrations/018_member_profile_photo_read.sql",import.meta.url),"utf8");
const answerProjection = readFileSync(new URL("../db/migrations/025_member_visible_question_answers.sql",import.meta.url),"utf8");
const page = readFileSync(new URL("../public/profiles/index.html",import.meta.url),"utf8");
const view = readFileSync(new URL("../ogc-l-react/src/PublicMemberProfile.jsx",import.meta.url),"utf8");
const app = readFileSync(new URL("../ogc-l-react/src/App.jsx",import.meta.url),"utf8");
const provider = readFileSync(new URL("../ogc-l-react/src/MemberSessionProvider.jsx",import.meta.url),"utf8");
const legacyEditor = readFileSync(new URL("../member-app/main.js",import.meta.url),"utf8");
const profileSettings = readFileSync(new URL("../ogc-l-react/src/member-settings.mjs",import.meta.url),"utf8");
test("pronouns are absent from all active and legacy profile code paths", () => {
  assert.doesNotMatch(api,/\bpronouns\b/i);
  assert.doesNotMatch(profileSettings,/\bpronouns\b/i);
  assert.doesNotMatch(legacyEditor,/\bpronouns\b/i);
});

test("profile slugs are stable and uniquely allocated by the database", () => {
  assert.match(migration,/user_id uuid PRIMARY KEY REFERENCES app_private\.member_profiles/);
  assert.match(migration,/slug text NOT NULL UNIQUE/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/AFTER INSERT ON app_private\.member_profiles/);
  assert.match(migration,/ORDER BY created_at,user_id/);
  assert.match(migration,/REVOKE ALL ON app_private\.member_profile_routes FROM PUBLIC/);
});
test("private member profile API only responds to active JWT members", () => {
  assert.match(api,/const memberProfileMatch = url\.pathname\.match/);
  assert.match(api,/memberProfileMatch \? request\.method === "GET"/);
  assert.match(api,/if \(!userId\) return json\(request, \{ error: "Unauthorized" \}, 401\)/);
  assert.match(api,/profilePath \|\| memberProfileMatch/);
  assert.match(api,/current_member_is_active\(\)/);
  assert.match(api,/JOIN app_private\.member_profiles p ON p\.user_id = route\.user_id/);
});
test("public profile response explicitly excludes email, private answers and storage keys", () => {
  const start = api.indexOf("if (memberProfileMatch) {");
  const end = api.indexOf("if (deletePath || verifyPath) {",start);
  assert.ok(start > 0 && end > start);
  const selected = api.slice(start,end);
  assert.doesNotMatch(selected,/p\.email|p\.birth_date|object_key|auth_password|acceptable_options|\bimportance\b/);
  assert.match(selected,/visible_member_public_answers/);
  assert.match(answerProjection,/a\.is_private=false/);
  assert.match(answerProjection,/SECURITY DEFINER/);
  assert.match(answerProjection,/current_member_is_active/);
  assert.match(selected,/SELECT question_id,option_id,note,is_private/);
  assert.match(selected,/String\(row\.user_id\)\.toLowerCase\(\)\s*===\s*userId/);
  assert.match(migration,/member_profiles_authenticated_read/);
  assert.match(migration,/is_private = false AND app_private\.current_member_is_active\(\)/);
  assert.match(photos,/FOR SELECT TO ogcupid_member_api/);
});
test("canonical React profile protects owner edits and delegates guest routing to member gate", () => {
  assert.match(page,/location\.replace\("\/profiles\/" \+/);
  assert.match(app,/<MemberGate><PublicMemberProfile Photo=\{MemberPhoto\}/);
  assert.match(view,/getPublicProfile\(slug\)/);
  assert.match(view,/!profile\?\.isOwner/);
  assert.match(view,/saveOwnEssay\(key,draft\)/);
  assert.match(provider,/saveOwnEssay,\s*getPublicProfile/);
  assert.doesNotMatch(view,/EngineerKen|Kennedy|Oakland/);
});
