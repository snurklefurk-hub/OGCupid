import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeCroppedJpeg } from "./photo-sanitize.js";
import { isPhotoPath, photoMethodAllowed } from "./member-photos.js";
const segment=(marker,body)=>Uint8Array.of(0xFF,marker, (body.length+2)>>8, (body.length+2)&255,...body);
function jpeg({metadata=true,width=1200,height=1200}={}){
  const parts=[Uint8Array.of(0xFF,0xD8)];
  if(metadata)parts.push(segment(0xE1,Uint8Array.of(69,120,105,102,0,0,71,80,83)));
  const frame=Uint8Array.of(8,height>>8,height&255,width>>8,width&255,3,1,0x11,0,2,0x11,0,3,0x11,0);
  parts.push(segment(0xC0,frame));
  parts.push(segment(0xDA,Uint8Array.of(3,1,0,2,0x11,3,0x11,0,0x3F,0)));
  parts.push(Uint8Array.of(1,2,0xFF,0,3,0xFF,0xD9));
  const output=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));
  let off=0;for(const part of parts){output.set(part,off);off+=part.length}
  return output;
}
test("strip EXIF including GPS and preserve JPEG baseline",()=>{
  const input=jpeg();
  const result=sanitizeCroppedJpeg(input);
  assert.equal(result.width,1200);
  assert.equal(result.height,1200);
  assert.ok(result.bytes.length<input.length);
  assert.equal(Buffer.from(result.bytes).includes(Buffer.from("Exif")),false);
  assert.equal(result.bytes.at(-2),0xFF);
  assert.equal(result.bytes.at(-1),0xD9);
});
test("reject trailing payloads, invalid dimensions and non-JPEG",()=>{
  assert.throws(()=>sanitizeCroppedJpeg(Uint8Array.of(1,2,3)));
  assert.throws(()=>sanitizeCroppedJpeg(jpeg({width:100,height:100})));
  assert.throws(()=>sanitizeCroppedJpeg(jpeg({width:2001,height:1200})));
  const extra=new Uint8Array([...jpeg(),0,4,3]);
  assert.throws(()=>sanitizeCroppedJpeg(extra));
});
test("allowlist photo routes and their methods",()=>{
  const uuid="12345678-1234-1234-1234-123456789abc";
  assert.equal(isPhotoPath("/photos"),true);
  assert.equal(isPhotoPath("/photos/order"),true);
  assert.equal(isPhotoPath("/photos/member/"+uuid),true);
  assert.equal(isPhotoPath("/photos/"+uuid+"/bytes"),true);
  assert.equal(isPhotoPath("/photos/not-a-uuid"),false);
  assert.equal(photoMethodAllowed("/photos/order","PUT"),true);
  assert.equal(photoMethodAllowed("/photos/order","DELETE"),false);
  assert.equal(photoMethodAllowed("/photos","POST"),true);
  assert.equal(photoMethodAllowed("/photos/"+uuid+"/bytes","GET"),true);
  assert.equal(photoMethodAllowed("/photos/"+uuid+"/primary","POST"),true);
  assert.equal(photoMethodAllowed("/photos/"+uuid,"DELETE"),true);
});
