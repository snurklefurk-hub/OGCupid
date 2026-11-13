// Minimal Neon Object Storage S3 SigV4 adapter for server-side use only.
// Neon Functions inject branch-local AWS_* credentials. Never expose them to
// browsers; they only receive JPEG bytes via authenticated API endpoints.
import { createHash, createHmac } from "node:crypto";

const BUCKET = "uploads";
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function hmac(key,data) {
  return createHmac("sha256",key).update(data).digest();
}
function config() {
  const endpoint=process.env.AWS_ENDPOINT_URL_S3;
  const key=process.env.AWS_ACCESS_KEY_ID;
  const secret=process.env.AWS_SECRET_ACCESS_KEY;
  const region=process.env.AWS_REGION || "us-east-1";
  if(!endpoint || !key || !secret || !/^[-a-z0-9]+$/.test(region)){
    throw new Error("Photo storage not configured");
  }
  const url = new URL(endpoint);
  if(url.protocol !== "https:" || !url.hostname.endsWith(".neon.tech")) {
    throw new Error("Invalid photo storage endpoint");
  }
  return { base:url.origin, host:url.host, key, secret, region };
}
export function assertPhotoKey(key) {
  if(!/^profile-photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(key)) {
    throw new Error("Invalid photo object key");
  }
  return key;
}
function sign(method,key,body=null) {
  const cfg=config();
  assertPhotoKey(key);
  const now=new Date();
  const amzDate=now.toISOString().replace(/[-:]|\.\d{3}/g,"");
  const day=amzDate.slice(0,8);
  const scope=`${day}/${cfg.region}/s3/aws4_request`;
  const path=`/${BUCKET}/${key}`;
  const bodyHash=sha256(body ?? Buffer.alloc(0));
  const signedHeaders="host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders=`host:${cfg.host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n`;
  const canonicalRequest=[method,path,"",canonicalHeaders,signedHeaders,bodyHash].join("\n");
  const stringToSign=["AWS4-HMAC-SHA256",amzDate,scope,sha256(canonicalRequest)].join("\n");
  const signingKey=hmac(hmac(hmac(hmac("AWS4"+cfg.secret,day),cfg.region),"s3"),"aws4_request");
  const signature=createHmac("sha256",signingKey).update(stringToSign).digest("hex");
  const headers=new Headers({
    "x-amz-date":amzDate,
    "x-amz-content-sha256":bodyHash,
    "authorization":`AWS4-HMAC-SHA256 Credential=${cfg.key}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  });
  if(body) headers.set("content-type","image/jpeg");
  return { url:cfg.base+path,headers };
}
async function storageRequest(method,key,body=null){
  const opts=sign(method,key,body);
  const result=await fetch(opts.url,{
    method,headers:opts.headers,body:body??undefined,redirect:"error",cache:"no-store",
    signal:AbortSignal.timeout(15000),
  });
  if(!result.ok && !(method==="DELETE" && result.status===404)){
    throw new Error("Photo storage request failed");
  }
  return result;
}
export async function putPhoto(key,jpeg){
  await storageRequest("PUT",key,jpeg);
}
export async function fetchPhoto(key){
  const result=await storageRequest("GET",key);
  const size=Number(result.headers.get("content-length") || 0);
  if(size>2_500_000) throw new Error("Stored photo exceeds limit");
  const bytes=new Uint8Array(await result.arrayBuffer());
  if(bytes.byteLength>2_500_000) throw new Error("Stored photo exceeds limit");
  return bytes;
}
export async function removePhoto(key){
  await storageRequest("DELETE",key);
}
