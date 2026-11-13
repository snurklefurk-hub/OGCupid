import test from 'node:test';
import assert from 'node:assert/strict';
import { cropRect, resizeCrop, exportSize, ProfilePhotoCropper } from './photo-cropper.js';

test('new crops retain the whole photo, including portrait and landscape', () => {
  for (const [width,height] of [[1600,900],[900,1600],[1200,1200]]) {
    assert.deepEqual(cropRect(width,height), {x:0,y:0,width,height});
  }
});
test('edges and corners resize independently without preset aspect ratios', () => {
  const start = cropRect(1600,900);
  assert.deepEqual(resizeCrop(start,'w',300,0,1600,900), {x:300,y:0,width:1300,height:900});
  assert.deepEqual(resizeCrop(start,'se',-240,-100,1600,900), {x:0,y:0,width:1360,height:800});
});
test('dragging stays within the image and cannot invert a selection', () => {
  for (const handle of ['move','n','s','e','w','ne','nw','se','sw']) {
    for (const dx of [-5000,0,5000]) for (const dy of [-5000,0,5000]) {
      const r = resizeCrop({x:100,y:200,width:500,height:300},handle,dx,dy,1600,900);
      assert.ok(r.x>=0 && r.y>=0 && r.width>=40 && r.height>=40);
      assert.ok(r.x+r.width<=1600 && r.y+r.height<=900);
    }
  }
});
test('export preserves the chosen ratio while satisfying existing upload limits', () => {
  for (const [width,height] of [[1600,900],[900,1600],[1360,800],[80,120],[2000,250]]) {
    const result = exportSize({width,height});
    assert.ok(result.width>=240 && result.height>=240);
    assert.ok(result.width<=2000 && result.height<=2000 && result.width*result.height<=3_000_000);
    assert.ok(Math.abs(result.width/result.height-width/height)<0.01);
  }
  assert.throws(()=>exportSize({width:4000,height:40}),/too narrow/);
  assert.throws(()=>cropRect(0,200));
});
test('keyboard crop, reset, and JPEG export use the actual freeform selection', async () => {
  const handlers = {}, draws = [];
  const context = {drawImage(...args){draws.push(args);},fillRect(){},strokeRect(){},clearRect(){}};
  const canvas = {width:600,height:400,style:{},getContext:()=>context,addEventListener:(name,fn)=>{handlers[name]=fn;}};
  const cropper = new ProfilePhotoCropper(canvas);
  cropper.bitmap = {width:1500,height:1000,close(){}};
  cropper.reset();
  handlers.keydown({key:'ArrowLeft',shiftKey:true,preventDefault(){}});
  assert.equal(cropper.selection.width,1485);
  assert.equal(cropper.selection.height,1000);
  const previousDocument = globalThis.document;
  globalThis.document = {createElement:()=>({getContext:()=>context,toBlob(callback){callback(new Blob(['jpeg'],{type:'image/jpeg'}));}})};
  try {
    await cropper.exportJpeg();
    assert.deepEqual(draws.at(-1).slice(1),[0,0,1485,1000,0,0,1200,808]);
    cropper.reset();
    assert.deepEqual(cropper.selection,{x:0,y:0,width:1500,height:1000});
  } finally { globalThis.document = previousDocument; }
});
