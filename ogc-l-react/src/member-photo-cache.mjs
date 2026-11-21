// Persistent, viewer-partitioned copies of already authorized member JPEGs.
// Only call this after a verified member session; never persist JWTs or URLs.
// IndexedDB may be blocked or evicted: network reads remain the fallback.
export const PHOTO_CACHE_LIMIT_BYTES=128*1024*1024;
const DB_NAME="ogc-member-photo-cache-v1";
const STORE="photos";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let opening;
const pending=new Map();

export function photoCacheKey(viewerId,targetId,kind,photoId=""){
  if(!UUID.test(String(viewerId||""))||!UUID.test(String(targetId||""))||
    !["avatar","thumb","full"].includes(kind)||
    (photoId!==""&&!UUID.test(String(photoId||""))))
    throw Error("Invalid member photo cache key");
  return [viewerId.toLowerCase(),targetId.toLowerCase(),kind,photoId.toLowerCase()].join(":");
}
function openCache(){
  if(typeof indexedDB==="undefined")return Promise.resolve(null);
  if(!opening){
    opening=new Promise(resolve=>{
      let req;
      try{req=indexedDB.open(DB_NAME,1);}
      catch{return resolve(null);}
      req.onupgradeneeded=()=>{
        if(!req.result.objectStoreNames.contains(STORE))
          req.result.createObjectStore(STORE,{keyPath:"key"});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>resolve(null);
      req.onblocked=()=>resolve(null);
    });
  }
  return opening;
}
export async function readProtectedPhoto(key){
  const db=await openCache();
  if(!db)return null;
  return new Promise(resolve=>{
    let tx;
    try{tx=db.transaction(STORE,"readonly");}
    catch{return resolve(null);}
    const req=tx.objectStore(STORE).get(key);
    req.onsuccess=()=>{
      const row=req.result;
      if(!(row?.blob instanceof Blob)||row.blob.type!=="image/jpeg")return resolve(null);
      // Touch asynchronously; durability is best-effort, never block display.
      try{
        const touch=db.transaction(STORE,"readwrite");
        touch.objectStore(STORE).put({...row,lastUsed:Date.now()});
      }catch{}
      resolve(row.blob);
    };
    req.onerror=()=>resolve(null);
  });
}
export async function storeProtectedPhoto(key,viewerId,targetId,blob){
  if(!(blob instanceof Blob)||blob.type!=="image/jpeg"||blob.size>2_500_000||
    !UUID.test(String(viewerId||""))||!UUID.test(String(targetId||"")))return;
  const db=await openCache();
  if(!db)return;
  const entry={key,viewerId:viewerId.toLowerCase(),targetId:targetId.toLowerCase(),
    blob,bytes:blob.size,lastUsed:Date.now()};
  await new Promise(resolve=>{
    let tx;
    try{tx=db.transaction(STORE,"readwrite");}
    catch{return resolve();}
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>resolve();
    tx.onabort=()=>resolve();
    const store=tx.objectStore(STORE);
    const request=store.getAll();
    request.onsuccess=()=>{
      const rows=(request.result||[]).filter(x=>x.key!==key)
        .sort((a,b)=>(a.lastUsed||0)-(b.lastUsed||0));
      let total=rows.reduce((sum,x)=>sum+(x.bytes||0),0)+entry.bytes;
      for(const row of rows){
        if(total<=PHOTO_CACHE_LIMIT_BYTES)break;
        store.delete(row.key);
        total-=row.bytes||0;
      }
      store.put(entry);
    };
  });
}
export async function invalidateMemberPhotos(viewerId,targetId){
  const db=await openCache();
  if(!db||!UUID.test(String(viewerId||""))||!UUID.test(String(targetId||"")))return;
  await new Promise(resolve=>{
    let tx;
    try{tx=db.transaction(STORE,"readwrite");}
    catch{return resolve();}
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>resolve();
    tx.onabort=()=>resolve();
    const store=tx.objectStore(STORE);
    const request=store.getAll();
    request.onsuccess=()=>{
      for(const row of request.result||[]){
        if(row.viewerId===viewerId.toLowerCase()&&row.targetId===targetId.toLowerCase())
          store.delete(row.key);
      }
    };
  });
}
// Simultaneous sidebar and Search tiles must share one network request.
export async function coalescePhoto(key,work){
  if(pending.has(key))return pending.get(key);
  const task=Promise.resolve().then(work).finally(()=>pending.delete(key));
  pending.set(key,task);
  return task;
}
// The original uncropped aspect ratio is preserved; only dimensions shrink.
// Full-size copies remain independently available for enlarged views.
export async function makePhotoThumbnail(blob,maxDimension=320){
  if(!(blob instanceof Blob)||blob.type!=="image/jpeg"||
    typeof createImageBitmap!=="function"||typeof document==="undefined")return blob;
  let bitmap;
  try{
    bitmap=await createImageBitmap(blob);
    const scale=Math.min(1,maxDimension/Math.max(bitmap.width,bitmap.height));
    if(scale===1)return blob;
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext("2d");
    if(!ctx)return blob;
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const thumb=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.8));
    return thumb?.type==="image/jpeg"&&thumb.size>0?thumb:blob;
  }catch{return blob;}
  finally{bitmap?.close();}
}
