// Credential-free production HTTP release check; no sessions or member data.
import {readFileSync} from "node:fs";
const origin=(process.env.OGC_PRODUCTION_ORIGIN||"https://ogcupid.onrender.com").replace(/\/$/,"");
const expected=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const js=/src="\/(assets\/index-[^"]+\.js)"/.exec(expected)?.[1];
const css=/href="\/(assets\/index-[^"]+\.css)"/.exec(expected)?.[1];
if(!js||!css)throw Error("Release has no hashed React assets.");
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fetchPage(path){
  const response=await fetch(origin+path,{headers:{"Cache-Control":"no-cache"},
    signal:AbortSignal.timeout(16000)});
  if(response.status!==200)throw Error(path+" returned HTTP "+response.status);
  return {body:await response.text(),headers:response.headers};
}
let root,last;
for(let attempt=0;attempt<24;attempt++){
  try{
    const result=await fetchPage("/");
    if(!result.body.includes("/"+js)||!result.body.includes("/"+css))throw Error("Previous React bundle still served");
    root=result.body;break;
  }catch(e){last=e;if(attempt<23)await delay(10000);}
}
if(!root)throw Error("Unified React bundle never became live: "+String(last));
const code=await fetchPage("/"+js);
for(const marker of ["OgTrends: Dating, dissected","Privacy Policy",
  "Terms & Conditions","The Dating Persona Test","ogcl-published-content",
  "ogcl-persona-frame","profile-showcase"]){
  if(!code.body.includes(marker))throw Error("React bundle does not contain "+marker);
}
const style=await fetchPage("/"+css);
if(!style.body.includes(".ogcl-editorial-page"))throw Error("Editorial 2011 React styling absent");

const legacy=[
 ["/ogtrends/","/ogtrends","WE BROUGHT BACK THE"],
 ["/ogtrends/zero/","/ogtrends/zero","Spite."],
 ["/ogtrends/perfect-profile/","/ogtrends/perfect-profile","perfect first impression"],
 ["/ogtrends/references/","/ogtrends/references","og-profile-showcase"],
 ["/contact/","/contact","privacy@ogcupid.com"],
 ["/privacy/","/privacy","Privacy"],
 ["/terms/","/terms","Terms"],
 ["/quiz/","/persona","Dating Persona"],
 ["/questions/","/questions","Match questions"]
];
for(const [path,hash,content]of legacy){
  const {body}=await fetchPage(path);
  if(!body.includes('location.replace("/#'+hash+'"')){
    // The literal hash includes a slash after the #, as in /#/privacy.
    if(!body.includes('location.replace("/#/'+hash.slice(1)+'"'))
      throw Error(path+" does not route into React");
  }
  if(!body.includes(content))throw Error(path+" lost its original source content");
}
const persona=await fetchPage("/account/persona.html?embedded=1");
if(!persona.body.includes("ogcl-persona-embedded")||
   !persona.body.includes("const questions = [")||
   !persona.body.includes("const originalWriteups"))
  throw Error("Original Persona engine was not preserved for React embedding");
const xfo=persona.headers.get("x-frame-options")?.toUpperCase();
if(xfo==="DENY")throw Error("Persona frame prohibited by X-Frame-Options");
const csp=persona.headers.get("content-security-policy")||"";
if(/frame-ancestors[^;]*'none'/.test(csp))throw Error("Persona frame blocked by CSP");
const admin=await fetch("https://br-plain-unit-bbcbxpqq-members.compute.c-15.us-east-1.aws.neon.tech/admin",{
  headers:{Origin:origin},signal:AbortSignal.timeout(16000)
});
if(admin.status!==401)throw Error("Unauthenticated administrator endpoint not protected");
console.log("Verified published original content, React navigation/assets, Persona 40-question frame, legal/citation preservation, and protected admin endpoint at "+origin);
