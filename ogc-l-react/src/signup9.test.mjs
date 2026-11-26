import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SITEMAP_PATHS} from "./sitemap-pages.mjs";
import {cropRect,resizeCrop,exportSize} from "../../member-app/photo-cropper.js";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
test("signup9 keeps the existing cropper, profile and essay in the signup shell",()=>{
  const screen=read("./SignupFinish.jsx"),shell=read("./SignupShell.jsx"),app=read("./App.jsx");
  assert.match(screen,/new ProfilePhotoCropper\(canvas.current\)/);
  assert.match(screen,/cropper.current.exportJpeg\(\)/);
  assert.match(screen,/instance\?\.dispose\(\)/);
  assert.match(screen,/accountRequest\("\/profile","PUT",profileDraft/);
  assert.match(screen,/accountRequest\("\/photos","POST",jpeg\)/);
  assert.match(screen,/\{!primary\?/);
  assert.match(screen,/signup9-finish",confirmed:true/);
  assert.match(screen,/if\(!status\?\.photo\|\|!status\?\.state\?\.signup9_completed_at\|\|!status\?\.explored\)/);
  assert.match(screen,/if\(await refresh\(\)\)navigate\("\/home",\{replace:true\}\)/);
  assert.match(app,/<Route path="onboarding" element=\{<Navigate to="\/home" replace\/>\}/);
  assert.match(app,/<Route path="signup10" element=\{<Navigate to="\/home" replace\/>\}/);
  assert.match(screen,/minLength=\{15\} maxLength=\{5000\}/);
  assert.ok(screen.includes("Just put a little something down for now. You can fill out all the essays you want later and upload more pics."));
  assert.match(app,/progress\?\.photo\?\{userId:user.id,slug\}:false/);
  assert.match(app,/data.profile.slug===slug/);
  for(const page of [9,10]){
    assert.ok(app.includes('<Route path="signup'+page+'"'));
    assert.ok(SITEMAP_PATHS.includes("/signup"+page));
  }
  assert.doesNotMatch(screen,/localStorage|sessionStorage|indexedDB/);
});
test("crop controls preserve freeform selection and server-compatible output dimensions",()=>{
  const original=cropRect(800,600,{x:100,y:100,width:400,height:300});
  assert.deepEqual(resizeCrop(original,"move",900,900,800,600),{x:400,y:300,width:400,height:300});
  assert.deepEqual(exportSize(original),{width:400,height:300});
});
