import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const load=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const dash=load("./AdminDashboard.jsx");
const editor=load("./AdminMemberEditor.jsx");
const gateway=load("./member-gateway.mjs");
const handler=readFileSync(new URL("../../api/admin-member-editor.js",import.meta.url),"utf8");
test("admin member directory exposes a scoped content editor",()=>{
  assert.match(dash,/AdminMemberEditor/);
  assert.match(dash,/Edit profile, photos & answers/);
  assert.match(dash,/editingMember/);
  assert.match(editor,/adminRequest\(urlFor\(memberId,"content"\)\)/);
  assert.match(editor,/\["profile","photos","questions"\]/);
});
test("admin editing preserves identity, account role and secrets",()=>{
  assert.match(editor,/Signup name, birth date, account role, and credentials remain outside this editor/);
  assert.doesNotMatch(editor,/localStorage|sessionStorage/);
  assert.doesNotMatch(editor,/adminPassword|secretToken/);
  assert.match(editor,/const canSave=!busy/);
  assert.doesNotMatch(editor,/Reason for changes|setReason|reason\.trim/);
  assert.match(handler,/admin_member_photo_preflight/);
  assert.match(handler,/admin_member_photo_key/);
  assert.match(handler,/admin_edit_member_field/);
});
test("photo writes use existing JPEG sanitizer and user-scoped storage keys",()=>{
  assert.match(handler,/sanitizeCroppedJpeg/);
  assert.match(handler,/putPhoto\(key,jpeg\.bytes\)/);
  assert.match(handler,/photoId=crypto\.randomUUID\(\)/);
  assert.match(handler,/await removePhoto\(key\)/);
  assert.match(editor,/preparePhoto\(file\)/);
  assert.doesNotMatch(editor,/form\.append\("reason"/);
  assert.match(editor,/form\.append\("photo"/);
  assert.match(editor,/URL\.revokeObjectURL/);
  assert.match(gateway,/blob\.type!=="image\/jpeg"/);
});
test("answer editing includes accepted answers, importance, privacy and explanation",()=>{
  for(const value of ["questionId","optionId","acceptableOptions","importance","isPrivate","note"])
    assert.ok(editor.includes(value),value);
  assert.match(editor,/loadPublishedBank/);
  assert.match(editor,/Delete saved answer/);
  assert.match(gateway,/admin\/members/);
  assert.match(gateway,/Authorization:"Bearer "\+jwt/);
});
