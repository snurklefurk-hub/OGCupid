import {readFileSync,writeFileSync,existsSync} from "node:fs";
import {resolve} from "node:path";

if(process.env.OGCL_PRODUCTION_ROOT!=="true")
  throw new Error("Refusing to publish outside explicit production build mode.");

const required=[
  "public/account/index.html","public/account/persona.html",
  "public/profiles/index.html","public/questions/question-bank.js",
  "public/quiz/index.html","public/ogtrends/index.html",
  "public/privacy/index.html","public/terms/index.html",
  "public/brand/ogcupid-logo-white.png","public/favicon.png",
  "public/feedback-widget.js","public/feedback-widget.css"
];
for(const file of required)
  if(!existsSync(resolve(file)))throw new Error("Missing existing production route or asset: "+file);

const built="public/index.html";
let html=readFileSync(resolve(built),"utf8");
if(!html.includes('id="root"')||!html.includes("OG Cupid")||
   !html.includes('name="description"')||!html.includes('name="robots"'))
  throw new Error("React root or public metadata is missing");
if(!html.includes('/assets/')||html.includes('/ogc-l/assets/'))
  throw new Error("Production page has incorrect asset base");

const assets=[...html.matchAll(/(?:src|href)="\/(assets\/[^"#?]+)"/g)].map(m=>m[1]);
if(assets.length<2 || !assets.some(s=>s.endsWith(".js"))||!assets.some(s=>s.endsWith(".css")))
  throw new Error("Missing compiled JS/CSS entrypoints");
for(const asset of assets)
  if(!existsSync(resolve("public",asset)))
    throw new Error("Compiled entrypoint is missing: "+asset);

// Staging is deliberately noindex. Production retains public discovery
// metadata like the former homepage while still protecting member data
// through the authenticated APIs.
const stagingRobots='<meta name="robots" content="noindex,nofollow,noarchive">';
if(!html.includes(stagingRobots))throw new Error("Unexpected staging meta tag");
html=html.replace(stagingRobots,'<meta name="robots" content="index,follow">');

if(/VITE_OGC_(AUTH|MEMBER_API)_URL|DATABASE_URL|NEON_AUTH_JWKS_URL|sk_live/i.test(html))
  throw new Error("Possible environment setting leaked into published HTML");
writeFileSync(resolve(built),html);
writeFileSync(resolve("index.html"),html);
console.log("Verified React production root, account bridge, static routes, and "+assets.length+" entrypoint assets.");