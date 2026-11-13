import test from "node:test";
import assert from "node:assert/strict";
import { orderedProfilePhotos } from "./profile-photo-gallery.js";

const photo = (n, isPrimary=false) => ({
  id: "photo-" + n,
  url: "blob:ogc-photo-" + n,
  isPrimary,
  sortOrder: n,
});

test("main profile picture appears first; four additional thumbnails follow", () => {
  const photos=[photo(1),photo(2),photo(3),photo(4,true),photo(5)];
  const ids=orderedProfilePhotos(photos).map(p=>p.id);
  assert.deepEqual(ids,["photo-4","photo-1","photo-2","photo-3","photo-5"]);
  assert.equal(ids.length,5);
});

test("zero and one photo correctly return only available pictures", () => {
  assert.deepEqual(orderedProfilePhotos([]),[]);
  assert.deepEqual(orderedProfilePhotos(null),[]);
  assert.deepEqual(orderedProfilePhotos([photo(1)]),[photo(1)]);
});

test("gallery never exceeds five photos and ignores absent or non-blob image URLs", () => {
  const photos=[photo(1),null,photo(2,true),photo(3),photo(4),photo(5),photo(6)];
  photos.push({id:"external",url:"https://example.com/member-photo.jpg",isPrimary:false});
  assert.deepEqual(
    orderedProfilePhotos(photos).map(p=>p.id),
    ["photo-2","photo-1","photo-3","photo-4","photo-5"],
  );
});

test("primary picture cannot be duplicated among thumbnails", () => {
  const photos=[photo(1,true),photo(2),photo(3)];
  const result=orderedProfilePhotos(photos);
  assert.equal(result.filter(p=>p.isPrimary).length,1);
  assert.equal(new Set(result.map(p=>p.id)).size,result.length);
});
