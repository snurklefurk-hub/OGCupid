import {readFileSync,writeFileSync,existsSync,mkdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {SITEMAP_SECTIONS} from "../ogc-l-react/src/sitemap-pages.mjs";

if(process.env.OGCL_PRODUCTION_ROOT!=="true")
  throw new Error("Refusing to publish outside explicit production build mode.");

const required=[
  "public/account/index.html","public/account/persona.html",
  "public/profiles/index.html","public/questions/question-bank.js",
  "public/quiz/index.html","public/ogtrends/index.html",
  "public/privacy/index.html","public/terms/index.html",
  "public/brand/ogcupid-logo-white.png","public/favicon.png"
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

// Render's static-host deployment does not yet have a verified catch-all
// rewrite rule. Publish a real React HTML entry at each fixed canonical URL
// instead of redirecting it to /#/; deep links load successfully with HTTP 200.
// The tiny 404 bridge handles dynamic profile/conversation URLs that cannot be
// enumerated at build time. This produces the SAME React app, not separate UIs.
const paths=new Set();
for(const section of SITEMAP_SECTIONS){
  for(const page of section.items){
    if(!/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(page.path)||
       paths.has(page.path))throw new Error("Invalid or duplicate site route: "+page.path);
    paths.add(page.path);
    const output=resolve("public",page.path.slice(1),"index.html");
    mkdirSync(dirname(output),{recursive:true});
    const title=page.label.replaceAll("&","&amp;").replaceAll("<","&lt;");
    let routeHtml=html.replace(/<title>[^<]*<\/title>/,
      "<title>"+title+" | OG Cupid</title>");
    if(page.access!=="public")
      routeHtml=routeHtml.replace('<meta name="robots" content="index,follow">',
        '<meta name="robots" content="noindex,follow">');
    if(!routeHtml.includes('id="root"')||!routeHtml.includes("/assets/"))
      throw new Error("Invalid route entry for "+page.path);
    writeFileSync(output,routeHtml);
  }
}
console.log("Verified canonical React root and "+paths.size+
  " direct clean URL entries; "+assets.length+" compiled assets.");