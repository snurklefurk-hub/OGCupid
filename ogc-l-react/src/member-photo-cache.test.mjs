import test from "node:test";
import assert from "node:assert/strict";
import {
  PHOTO_CACHE_LIMIT_BYTES,photoCacheKey,coalescePhoto,makePhotoThumbnail,
  readProtectedPhoto,storeProtectedPhoto,invalidateMemberPhotos
} from "./member-photo-cache.mjs";
import {readFileSync} from "node:fs";
const YOU="00000000-0000-4000-8000-000000000001";
const OTHER="00000000-0000-4000-8000-000000000002";
const PHOTO="00000000-0000-4000-8000-000000000003";

test("persistent JPEG cache partitions entries by member, target and photo version",()=>{
  assert.notEqual(photoCacheKey(YOU,OTHER,"thumb",PHOTO),
    photoCacheKey(OTHER,OTHER,"thumb",PHOTO));
  assert.notEqual(photoCacheKey(YOU,OTHER,"thumb",PHOTO),
    photoCacheKey(YOU,OTHER,"full",PHOTO));
  assert.equal(PHOTO_CACHE_LIMIT_BYTES,128*1024*1024);
  assert.throws(()=>photoCacheKey("unknown",OTHER,"thumb",PHOTO));
  assert.throws(()=>photoCacheKey(YOU,OTHER,"token",PHOTO));
  assert.throws(()=>photoCacheKey(YOU,OTHER,"thumb","../secret"));
});
test("overlapping avatar requests share work and later requests retry after rejection",async()=>{
  let calls=0;
  const work=async()=>{calls++;await Promise.resolve();return "image";};
  const [a,b]=await Promise.all([
    coalescePhoto("same-avatar",work),coalescePhoto("same-avatar",work)
  ]);
  assert.equal(a,"image");assert.equal(b,"image");assert.equal(calls,1);
  await assert.rejects(coalescePhoto("bad-avatar",async()=>{throw Error("failed");}));
  assert.equal(await coalescePhoto("bad-avatar",work),"image");
  assert.equal(calls,2);
});
test("cache remains a safe optional optimization without browser IndexedDB or canvas",async()=>{
  const blob=new Blob(["jpeg"],{type:"image/jpeg"});
  const key=photoCacheKey(YOU,OTHER,"full",PHOTO);
  assert.equal(await readProtectedPhoto(key),null);
  assert.equal(await makePhotoThumbnail(blob),blob);
  await storeProtectedPhoto(key,YOU,OTHER,blob);
  await invalidateMemberPhotos(YOU,OTHER);
});
test("React never exposes cached photos to signed-out sessions and owner edits invalidate",()=>{
  const app=readFileSync(new URL("./App.jsx",import.meta.url),"utf8");
  const gateway=readFileSync(new URL("./member-gateway.mjs",import.meta.url),"utf8");
  assert.match(app,/\["member","onboarding"\]\.includes\(kind\)&&url/);
  assert.match(app,/getMemberAvatar\(member\.userId,member\.avatarPhotoId\)/);
  assert.match(gateway,/await invalidateMemberPhotos\(actor\.id,actor\.id\)/);
  assert.match(gateway,/await readProtectedPhoto\(key\)/);
  assert.doesNotMatch(gateway,/localStorage\.setItem\([^)]*photo/);
});
