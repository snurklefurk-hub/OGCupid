// Admin-only, declarative UI editor draft format. The fixed shell and page
// content have separate scopes; neither can alter the other through CSS.
export const EDITOR_SCHEMA=2;
export const EDITOR_PAGES=Object.freeze([
  {path:"/matches",label:"MATCHES"},
  {path:"/quickmatch",label:"Quickmatch"},
  {path:"/profile",label:"My Profile"},
  {path:"/questions",label:"Questions"},
  {path:"/messages",label:"Messages"},
  {path:"/community",label:"Community"},
  {path:"/persona",label:"Persona"},
  {path:"/ogtrends",label:"OGTrends"},
  {path:"/admin",label:"Administration"}
]);
// Shared on ALL routes, irrespective of what is displayed in the center.
// Include the top account links and legal footer even though they physically
// sit above/below the center sheet in AppShell.
export const EDITOR_SHELL_AREAS=Object.freeze([
  {id:"siteBackground",label:"Site background",selector:"body"},
  {id:"leftRail",label:"Left column",selector:".ogcl-left"},
  {id:"brand",label:"Logo region",selector:".ogcl-left .ogcl-brand"},
  {id:"mainNavigation",label:"Primary navigation",selector:".ogcl-left .ogcl-primary"},
  {id:"mainNavLinks",label:"Primary navigation links",selector:".ogcl-left .ogcl-nav-link"},
  {id:"publicNavigation",label:"Secondary navigation",selector:".ogcl-left .ogcl-public-nav"},
  {id:"leftPromos",label:"Left-column features",selector:".ogcl-left .ogcl-left-note"},
  {id:"leftEditorial",label:"Left-column promotion cards",selector:".ogcl-left .ogcl-editorial-stack"},
  {id:"rightRail",label:"Right column",selector:".ogcl-right"},
  {id:"profileFloater",label:"Your profile photo",selector:".ogcl-right .ogcl-profile-floater"},
  {id:"rightCard",label:"Right-column cards",selector:".ogcl-right .ogcl-side-card"},
  {id:"rightEditorial",label:"Right-column promotion cards",selector:".ogcl-right .ogcl-editorial-stack"},
  {id:"accountBar",label:"Top account bar",selector:".ogcl-center .ogcl-banner"},
  {id:"accountLinks",label:"Profile / Settings / Account / Admin / Sign out",selector:".ogcl-center .ogcl-top-links"},
  {id:"accountActions",label:"Top account link text & buttons",selector:".ogcl-center .ogcl-top-links a, .ogcl-center .ogcl-top-links button"},
  {id:"centerSheet",label:"Center-column frame",selector:".ogcl-center .ogcl-sheet"},
  {id:"legalFooter",label:"Legal footer",selector:".ogcl-center .ogcl-footer"},
  {id:"footerLinks",label:"Footer link group",selector:".ogcl-center .ogcl-footer nav"},
  {id:"footerLinkLabels",label:"Footer link text",selector:".ogcl-center .ogcl-footer a"}
]);
// ONLY descendants of the actual routed .ogcl-sheet are page-editable.
// A page-level selector must never reach .ogcl-left/.ogcl-right, top nav or
// legal footer, even if additional classes are reused elsewhere in the app.
export const EDITOR_PAGE_AREAS=Object.freeze([
  {id:"pageTitle",label:"Page title",selector:".ogcl-sheet .ogcl-view-head h1"},
  {id:"pageHeader",label:"Page header",selector:".ogcl-sheet .ogcl-view-head"},
  {id:"mainContent",label:"Page content",selector:".ogcl-sheet .ogcl-view"},
  {id:"contentPanel",label:"Content panels",selector:".ogcl-sheet .ogcl-content-panel"},
  {id:"matchesFilters",label:"MATCHES filters",selector:".ogcl-sheet .classic-search"},
  {id:"matchCard",label:"MATCHES profile cards",selector:".ogcl-sheet .ogcl-match-result"}
]);
export const EDITOR_AREAS=Object.freeze([...EDITOR_SHELL_AREAS,...EDITOR_PAGE_AREAS]);

export const EDITOR_VIEWPORTS=Object.freeze([
  {id:"editor",label:"Editing canvas · 1150 × 850",width:1150,height:850},
  {id:"1920",label:"Full HD · 1920 × 1080",width:1920,height:1080},
  {id:"2560",label:"QHD · 2560 × 1440",width:2560,height:1440},
  {id:"3840",label:"4K · 3840 × 2160",width:3840,height:2160}
]);
// Explicit text-only allowlist: never use arbitrary DOM selector strings from
// saved drafts, nor live user names, messages, answers, or other private data.
// The shared entries are identified by hardcoded attributes in App/ClassicSidebar.
const shellText=[
  ...["matches","messages","visitors","quickmatch","community"]
    .map(name=>({id:"shell.nav."+name,label:"Main navigation · "+name,scope:"shell",max:90})),
  ...["persona","ogtrends","contact"]
    .map(name=>({id:"shell.public."+name,label:"Left links · "+name,scope:"shell",max:90})),
  ...["profile","settings","account","admin","signout","signin","join"]
    .map(name=>({id:"shell.account."+name,label:"Account bar · "+name,scope:"shell",max:90})),
  ...["ogtrends","persona","contact","privacy","terms"]
    .map(name=>({id:"shell.footer."+name,label:"Footer · "+name,scope:"shell",max:90})),
  {id:"shell.footer.disclaimer",label:"Footer disclaimer",scope:"shell",max:500},
  {id:"shell.suggestions",label:"Suggested members heading",scope:"shell",max:90},
  ...["left","right"].flatMap(side=>[0,1,2].flatMap(n=>[
    {id:"shell.promo."+side+"."+n+".title",label:side+" promotion "+(n+1)+" title",scope:"shell",max:120},
    {id:"shell.promo."+side+"."+n+".body",label:side+" promotion "+(n+1)+" copy",scope:"shell",max:500}
  ])),
  {id:"shell.refinement.title",label:"Profile refinement title",scope:"shell",max:120},
  {id:"shell.refinement.body",label:"Profile refinement copy",scope:"shell",max:500}
].map(target=>({...target,selector:'[data-ogc-edit-text="'+target.id+'"]'}));
export const EDITOR_PAGE_TEXT_ROUTES=new Set([
  "/matches","/quickmatch","/questions","/messages","/community","/persona","/ogtrends","/admin"
]);
export const EDITOR_TEXT_TARGETS=Object.freeze([
  ...shellText,
  {id:"page.heading",label:"Center page heading",scope:"page",
    selector:".ogcl-sheet .ogcl-view-head h1",max:160},
  {id:"page.intro",label:"Center page introduction",scope:"page",
    selector:".ogcl-sheet .ogcl-view-head > p:first-of-type",max:500}
]);
const TEXT_TARGETS=new Map(EDITOR_TEXT_TARGETS.map(x=>[x.id,x]));
export const editorTextTarget=(id,page)=> {
  const target=TEXT_TARGETS.get(id);
  return target && (target.scope==="shell"||EDITOR_PAGE_TEXT_ROUTES.has(page))?target:null;
};

export const EDITOR_TOKENS=Object.freeze([
  {id:"--okc-blue",label:"Site background",default:"#2963a4"},
  {id:"--okc-navy",label:"Navigation blue",default:"#183b62"},
  {id:"--okc-pink",label:"Heading pink",default:"#f83265"},
  {id:"--okc-heading",label:"Section headings",default:"#264e79"},
  {id:"--okc-paper",label:"Page background",default:"#f6f6f6"},
  {id:"--okc-ink",label:"Body text",default:"#555555"},
  {id:"--okc-line",label:"Borders",default:"#dddddd"},
  {id:"--okc-green",label:"Green accents",default:"#63a62f"}
]);
export const EDITOR_BLOCK_TYPES=Object.freeze([
  {type:"heading",label:"Heading"},
  {type:"paragraph",label:"Paragraph"},
  {type:"notice",label:"Notice panel"},
  {type:"divider",label:"Separator"},
  {type:"button",label:"Button"}
]);
export const EDITOR_PROPERTIES=Object.freeze([
  {key:"backgroundColor",label:"Background",kind:"color"},
  {key:"color",label:"Text color",kind:"color"},
  {key:"borderColor",label:"Border color",kind:"color"},
  {key:"fontSize",label:"Font size (px)",kind:"number",max:42},
  {key:"fontFamily",label:"Typeface",kind:"select",options:["Verdana","Arial","Georgia","Tahoma"]},
  {key:"fontWeight",label:"Font weight",kind:"select",options:["400","500","600","700"]},
  {key:"textAlign",label:"Text alignment",kind:"select",options:["left","center","right"]},
  {key:"lineHeight",label:"Line height (px)",kind:"number",max:80},
  ...["Top","Right","Bottom","Left"].map(side=>({
    key:"padding"+side,label:"Padding "+side.toLowerCase()+" (px)",kind:"number",max:80
  })),
  ...["Top","Right","Bottom","Left"].map(side=>({
    key:"margin"+side,label:"Margin "+side.toLowerCase()+" (px)",kind:"number",max:80
  })),
  {key:"borderRadius",label:"Corner radius · top-left (px)",kind:"number",max:30},
  {key:"borderWidth",label:"Border width (px)",kind:"number",max:12},
  {key:"borderStyle",label:"Border style",kind:"select",options:["none","solid","dashed","dotted"]}
]);
const COLORS=new Set(EDITOR_PROPERTIES.filter(p=>p.kind==="color").map(p=>p.key));
const NUMBERS=new Map([...EDITOR_PROPERTIES.filter(p=>p.kind==="number").map(p=>[p.key,p.max]),
  ["padding",80],["margin",80]]); // Legacy one-value spacing survives older drafts.
const SELECTS=new Map(EDITOR_PROPERTIES.filter(p=>p.kind==="select").map(p=>[p.key,p.options]));
const FONTS=new Set(["Verdana","Arial","Georgia","Tahoma"]);
const allowedPages=new Set(EDITOR_PAGES.map(x=>x.path));
const shellAreas=new Map(EDITOR_SHELL_AREAS.map(x=>[x.id,x.selector]));
const pageAreas=new Map(EDITOR_PAGE_AREAS.map(x=>[x.id,x.selector]));
const allowedTokens=new Set(EDITOR_TOKENS.map(x=>x.id));
const blockTypes=new Set(EDITOR_BLOCK_TYPES.map(x=>x.type));
const HEX=/^#[0-9a-fA-F]{6}$/;
const ID=/^block-[a-z0-9-]{1,32}$/;
const isObject=x=>!!x&&typeof x==="object"&&!Array.isArray(x);
export const editorAreaScope=id=>shellAreas.has(id)?"shell":pageAreas.has(id)?"page":null;
export function blankEditorDraft(){return {version:EDITOR_SCHEMA,tokens:{},areas:{},pages:{},texts:{}};}
function cleanStyle(input,area=""){
  const result={};
  if(!isObject(input))return result;
  for(const [key,value] of Object.entries(input)){
    // Margin on structural rails could break the edge-locked three columns.
    if(key.startsWith("margin")&&["leftRail","rightRail","siteBackground","centerSheet"].includes(area))continue;
    if(COLORS.has(key)&&typeof value==="string"&&HEX.test(value))
      result[key]=value.toLowerCase();
    else if(NUMBERS.has(key)&&Number.isFinite(value)&&value>=0&&value<=NUMBERS.get(key))
      result[key]=Math.round(value*10)/10;
    else if(SELECTS.has(key)&&SELECTS.get(key).includes(value))result[key]=value;
  }
  return result;
}
function cleanBlock(raw){
  if(!isObject(raw)||!ID.test(raw.id)||!blockTypes.has(raw.type))return null;
  const text=typeof raw.text==="string"?raw.text.slice(0,500):"";
  return {id:raw.id,type:raw.type,text,hidden:raw.hidden===true,
    style:cleanStyle(raw.style)};
}
export function sanitizeEditorDraft(raw){
  const result=blankEditorDraft();
  if(!isObject(raw)||![1,EDITOR_SCHEMA].includes(raw.version))return result;
  if(isObject(raw.tokens))for(const [key,value] of Object.entries(raw.tokens))
    if(allowedTokens.has(key)&&typeof value==="string"&&HEX.test(value))
      result.tokens[key]=value.toLowerCase();

  const global=isObject(raw.areas?.["*"])?raw.areas["*"]:{};
  const shell={};
  for(const [area,style] of Object.entries(global))
    if(shellAreas.has(area))shell[area]=cleanStyle(style,area);
  if(Object.keys(shell).length)result.areas["*"]=shell;

  // Schema 1 allowed global page styles and page-specific shell overrides.
  // Carry global page styles into individual pages, retaining per-page
  // overrides. Page-specific shell overrides are intentionally NOT expanded
  // globally: that would unexpectedly change other routes. The editor keeps
  // an unmodified backup of the original browser draft on migration.
  for(const page of EDITOR_PAGES.map(x=>x.path)){
    const perArea=isObject(raw.areas?.[page])?raw.areas[page]:{};
    const scoped={};
    for(const [area,style] of Object.entries({
      ...(raw.version===1?Object.fromEntries(Object.entries(global).filter(([id])=>pageAreas.has(id))):{}),
      ...perArea
    }))if(pageAreas.has(area))scoped[area]=cleanStyle(style,area);
    if(Object.keys(scoped).length)result.areas[page]=scoped;
  }
  if(isObject(raw.texts))for(const [scope,targets] of Object.entries(raw.texts)){
    if(scope!=="*"&&!allowedPages.has(scope)||!isObject(targets))continue;
    const cleaned={};
    for(const [id,value] of Object.entries(targets)){
      const target=editorTextTarget(id,scope==="*" ? "/matches" : scope);
      if(!target || (scope==="*"&&target.scope!=="shell") ||
         (scope!=="*"&&target.scope!=="page"))continue;
      if(typeof value!=="string"||value.length>target.max)continue;
      // textContent only; newline, invisible control characters and tags
      // cannot become markup or executable HTML in the preview.
      if(/[\u0000-\u001f\u007f]/.test(value))continue;
      cleaned[id]=value;
    }
    if(Object.keys(cleaned).length)result.texts[scope]=cleaned;
  }
  if(isObject(raw.pages))for(const [page,blocks] of Object.entries(raw.pages)){
    if(!allowedPages.has(page)||!Array.isArray(blocks))continue;
    const ids=new Set();
    result.pages[page]=blocks.slice(0,24).map(cleanBlock).filter(block=>{
      if(!block||ids.has(block.id))return false;
      ids.add(block.id);return true;
    });
  }
  return result;
}
function declarations(style,area){
  return Object.entries(cleanStyle(style,area)).map(([k,v])=>{
    const cssKey=k.replace(/[A-Z]/g,m=>"-"+m.toLowerCase());
    return cssKey+":"+(NUMBERS.has(k)?v+"px":v)+";";
  }).join("");
}
export function editorPreviewCss(raw,page){
  const draft=sanitizeEditorDraft(raw);
  if(!allowedPages.has(page))return "";
  let result="";
  const vars=Object.entries(draft.tokens).map(([k,v])=>k+":"+v+";").join("");
  if(vars)result+=":root{"+vars+"}\n";
  for(const [scope,allowed] of [["*",shellAreas],[page,pageAreas]])
    for(const [id,style] of Object.entries(draft.areas[scope]||{})){
      const selector=allowed.get(id);
      const rules=declarations(style,id);
      if(selector&&rules)result+=selector+"{"+rules+"}\n";
    }
  return result;
}
export function editorBlockHtmlLabel(block){
  if(block.type==="divider")return "Separator";
  return block.text.trim()||EDITOR_BLOCK_TYPES.find(x=>x.type===block.type)?.label||"Block";
}
export function moveEditorBlock(blocks,from,to){
  if(!Array.isArray(blocks)||!Number.isInteger(from)||!Number.isInteger(to)||
    from<0||to<0||from>=blocks.length||to>=blocks.length)return blocks;
  const reordered=blocks.slice();
  const [item]=reordered.splice(from,1);reordered.splice(to,0,item);
  return reordered;
}
