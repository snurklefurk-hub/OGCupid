import test from "node:test";
import assert from "node:assert/strict";
import { cropRect } from "./photo-cropper.js";

test("square crop centers landscape images and preserves aspect", () => {
  const r = cropRect(1600, 900, "square");
  assert.deepEqual(r, { x: 350, y: 0, width: 900, height: 900, ratio: 1 });
});
test("portrait and landscape crops never exceed source bounds", () => {
  for(const ratio of ["portrait","landscape","square"]) {
    for(const zoom of [1,1.2,2,3,9]) {
      for(const x of [-1,0,1]) {
        for(const y of [-1,0,1]){
          const r = cropRect(1600,1200,ratio,zoom,x,y);
          assert.ok(r.x >= 0 && r.y >= 0);
          assert.ok(r.x+r.width<=1600+1e-6);
          assert.ok(r.y+r.height<=1200+1e-6);
          assert.ok(Math.abs(r.width/r.height-r.ratio)<1e-7);
        }
      }
    }
  }
});
test("zoom shrinks the crop window; panning shifts without overflow", () => {
  const a=cropRect(1200,1600,"square",1.5);
  const b=cropRect(1200,1600,"square",2,-1,1);
  assert.ok(b.width<a.width && b.height<a.height);
  assert.ok(b.x < a.x && b.y > a.y);
});
test("invalid sizes and shapes cannot produce crop", () => {
  assert.throws(()=>cropRect(0,200));
  assert.throws(()=>cropRect(100,200,"hexagon"));
  assert.throws(()=>cropRect(Infinity,200));
});
