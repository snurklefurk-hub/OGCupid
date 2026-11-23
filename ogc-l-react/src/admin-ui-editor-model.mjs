// Admin-only, declarative UI editor draft format. The fixed shell and page
// content have separate scopes; neither can alter the other through CSS.
import {primaryNavigation} from "./navigation.mjs";

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
  {path:"/sitemap",label:"Sitemap"},
  {path:"/admin",label:"Administration"}
]);
export const EDITOR_MAIN_NAV_AREAS=Object.freeze(primaryNavigation.map(({path,label})=>{
  const key=path.slice(1);
  return {id:"shell.nav."+key,label,selector:'.ogcl-left .ogcl-nav-link[data-ogc-nav="'+key+'"]'};
}));

export const EDITOR_PROMO_AREAS=Object.freeze(["left","right"].flatMap(side=>
  [0,1,2].map(index=>({
    id:"shell.promo."+side+"."+index,label:(side==="left"?"Left":"Right")+" promo card "+(index+1),
    selector:'.ogcl-'+side+' .ogcl-editorial-card[data-ogc-card="shell.promo.'+side+'.'+index+'"]'
  }))
));
const tabBar=".ogcl-sheet .ogcl-view .ogcl-period-stage nav:is(.ogcl-period-tabs,.ogcl-profile-tabs)";
const tabButton=tabBar+" > :is(button,a)";

// Shared on ALL routes, irrespective of what is displayed in the center.
// Include the top account links and legal footer even though they physically
// sit above/below the center sheet in AppShell.
export const EDITOR_SHELL_AREAS=Object.freeze([
  {id:"siteBackground",label:"Site background",selector:"body"},
  {id:"leftRail",label:"Left column",selector:".ogcl-left"},
  {id:"brand",label:"Logo region",selector:".ogcl-left .ogcl-brand"},
  {id:"mainNavigation",label:"Primary navigation",selector:".ogcl-left .ogcl-primary"},
  {id:"mainNavLinks",label:"Primary navigation links",selector:".ogcl-left .ogcl-nav-link"},
  ...EDITOR_MAIN_NAV_AREAS,
  {id:"publicNavigation",label:"Secondary navigation",selector:".ogcl-left .ogcl-public-nav"},
  {id:"leftPromos",label:"Left-column features",selector:".ogcl-left .ogcl-left-note"},
  {id:"leftEditorial",label:"Left-column promotion cards",selector:".ogcl-left .ogcl-editorial-stack"},
  ...EDITOR_PROMO_AREAS,
  ...[...EDITOR_PROMO_AREAS.map(area=>area.id),"shell.refinement"].flatMap(card=>
    ["title","body"].map(part=>{
      const id=card+"."+part;
      return {id,label:part==="title"?"Card title":"Card copy",
        selector:'.ogcl-editorial-card [data-ogc-edit-text="'+id+'"]'};
    })
  ),
  {id:"refinementCard",label:"Profile refinement card",selector:'.ogcl-right .ogcl-editorial-card[data-ogc-card="shell.refinement"]'},
  {id:"navSpacing",label:"Nav button spacing",selector:".ogcl-left .ogcl-main-nav"},
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
  {id:"tabBar",label:"Tab bar",selector:tabBar},
  {id:"activeTab",label:"Selected tab",selector:tabButton+':is([aria-current="page"],.active)'},
  {id:"tabButtons",label:"Tab buttons",selector:tabButton},
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
  ...EDITOR_MAIN_NAV_AREAS.map(({id,label})=>({id,label,scope:"shell",max:90})),
  ...["persona","ogtrends","contact"]
    .map(name=>({id:"shell.public."+name,label:"Left links · "+name,scope:"shell",max:90})),
  ...["profile","settings","account","admin","signout","signin","join"]
    .map(name=>({id:"shell.account."+name,label:"Account bar · "+name,scope:"shell",max:90})),
  ...["ogtrends","persona","contact","privacy","terms","sitemap"]
    .map(name=>({id:"shell.footer."+name,label:"Footer · "+name,scope:"shell",max:90})),
  {id:"shell.footer.disclaimer",label:"Footer disclaimer",scope:"shell",max:500},
  {id:"shell.suggestions",label:"Suggested members heading",scope:"shell",max:90},
  // Promo text and links are owned by Admin → Promos. The visual editor
  // still styles the card regions but cannot override their saved copy.
].map(target=>({...target,selector:'[data-ogc-edit-text="'+target.id+'"]'}));
export const EDITOR_PAGE_TEXT_ROUTES=new Set([
  "/matches","/quickmatch","/questions","/messages","/community","/persona","/ogtrends","/sitemap","/admin"
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
export const EDITOR_LINK_ROUTES=Object.freeze([...EDITOR_PAGES,
  {path:"/join",label:"Join"},{path:"/contact",label:"Contact"},
  {path:"/privacy",label:"Privacy"},{path:"/terms",label:"Terms"}]);
export const EDITOR_BLOCK_TYPES=Object.freeze([
  {type:"heading",label:"Heading"},
  {type:"paragraph",label:"Paragraph"},
  {type:"notice",label:"Notice panel"},
  {type:"divider",label:"Separator"},
  {type:"button",label:"Button"}
]);
const sides=["Top","Right","Bottom","Left"];
const corners=["TopLeft","TopRight","BottomRight","BottomLeft"];
const cornerLabel=corner=>corner.replace(/(Left|Right)$/,side=>" "+side.toLowerCase());
const number=(key,label,group,min,max,extra={})=>({key,label,group,kind:"number",min,max,...extra});
const choice=(key,label,group,options)=>({key,label,group,kind:"select",options});
export const EDITOR_PROPERTIES=Object.freeze([
  ...[["backgroundColor","Background"],["color","Text color"],["borderColor","Border color"]]
    .map(([key,label])=>({key,label,group:"Colors",kind:"color"})),
  choice("backgroundImage","Background image","Colors",["none"]),
  ...["width","height","minWidth","minHeight","maxWidth","maxHeight"].map(key=>
    number(key,({minHeight:"Minimum height",minWidth:"Minimum width",maxHeight:"Maximum height",maxWidth:"Maximum width"})[key]||
      (key==="width"?"Width":"Height"),"Size",0,8192,{percent:true})),
  choice("boxSizing","Box sizing","Size",["border-box","content-box"]),
  choice("display","Display","Layout",["block","inline","inline-block","flex","inline-flex","grid","inline-grid"]),
  choice("flexDirection","Flex direction","Layout",["row","column","row-reverse","column-reverse"]),
  choice("flexWrap","Flex wrapping","Layout",["nowrap","wrap","wrap-reverse"]),
  choice("justifyContent","Justify content","Layout",["start","center","end","space-between","space-around","space-evenly"]),
  choice("alignItems","Align items","Layout",["start","center","end","stretch","baseline"]),
  number("rowGap","Row gap (px)","Layout",0,512),
  number("columnGap","Column gap (px)","Layout",0,512),
  number("fontSize","Font size (px)","Type",0,256),
  choice("fontFamily","Typeface","Type",["Verdana","Arial","Georgia","Tahoma","Trebuchet MS","Times New Roman","Courier New","system-ui"]),
  choice("fontWeight","Font weight","Type",["100","200","300","400","500","600","700","800","900"]),
  choice("fontStyle","Font style","Type",["normal","italic","oblique"]),
  choice("textAlign","Text alignment","Type",["left","center","right","justify"]),
  choice("textTransform","Text case","Type",["none","uppercase","lowercase","capitalize"]),
  choice("textDecorationLine","Text decoration","Type",["none","underline","line-through","overline"]),
  number("lineHeight","Line height (px)","Type",0,512),
  number("letterSpacing","Letter spacing (px)","Type",-16,64),
  ...sides.map(side=>number("padding"+side,"Padding "+side.toLowerCase()+" (px)","Spacing",0,512)),
  ...sides.map(side=>number("margin"+side,"Margin "+side.toLowerCase()+" (px)","Spacing",-512,512)),
  number("borderRadius","All corners (px)","Borders",0,2048),
  ...corners.map(corner=>number("border"+corner+"Radius",cornerLabel(corner)+" radius (px)","Borders",0,2048)),
  number("borderWidth","Border width (px)","Borders",0,128),
  ...sides.map(side=>number("border"+side+"Width",side+" border width (px)","Borders",0,128)),
  choice("borderStyle","Border style","Borders",["none","solid","dashed","dotted","double","inset","outset"])
]);
const properties=new Map([...EDITOR_PROPERTIES,
  number("padding","Padding","Spacing",0,512),number("margin","Margin","Spacing",-512,512)
].map(property=>[property.key,property]));
const structural=new Set(["siteBackground","leftRail","rightRail","centerSheet"]);

// Preserve the desktop grid while allowing its children to be sized and arranged.
export function editorPropertyAvailable(key,area){
  const property=properties.get(key);
  if(!property)return false;
  if(area==="navSpacing")return key==="rowGap"||key==="columnGap";
  return !structural.has(area)||!(key.startsWith("margin")||property.group==="Size"||property.group==="Layout");
}
export const editorStyleValue=value=>typeof value==="number"?value+"px":value;
const allowedPages=new Set(EDITOR_PAGES.map(x=>x.path));
const shellAreas=new Map(EDITOR_SHELL_AREAS.map(x=>[x.id,x.selector]));
const pageAreas=new Map(EDITOR_PAGE_AREAS.map(x=>[x.id,x.selector]));
const allowedTokens=new Set(EDITOR_TOKENS.map(x=>x.id));
const blockTypes=new Set(EDITOR_BLOCK_TYPES.map(x=>x.type));
const linkRoutes=new Set(EDITOR_LINK_ROUTES.map(x=>x.path));
const HEX=/^#[0-9a-fA-F]{6}$/;
const ID=/^block-[a-z0-9-]{1,32}$/;
const isObject=x=>!!x&&typeof x==="object"&&!Array.isArray(x);
export const editorAreaScope=id=>shellAreas.has(id)?"shell":pageAreas.has(id)?"page":null;
export function blankEditorDraft(){return {version:EDITOR_SCHEMA,tokens:{},areas:{},pages:{},texts:{}};}
function cleanStyle(input,area=""){
  const result={};
  if(!isObject(input))return result;
  for(const [key,value] of Object.entries(input)){
    if(!editorPropertyAvailable(key,area))continue;
    const property=properties.get(key);
    if(property.kind==="color"&&typeof value==="string"&&(HEX.test(value)||value==="transparent"))
      result[key]=value.toLowerCase();
    else if(property.kind==="number"&&Number.isFinite(value)&&value>=property.min&&value<=property.max)
      result[key]=Math.round(value*10)/10;
    else if(property.percent&&typeof value==="string"&&/^(?:0|[1-9]\d{0,2})(?:\.\d)?%$/.test(value)&&parseFloat(value)<=100)
      result[key]=value;
    else if(property.options?.includes(value))result[key]=value;
  }
  return result;
}
function cleanBlock(raw){
  if(!isObject(raw)||!ID.test(raw.id)||!blockTypes.has(raw.type))return null;
  const text=typeof raw.text==="string"?raw.text.slice(0,500):"";
  return {id:raw.id,type:raw.type,text,hidden:raw.hidden===true,
    ...(raw.type==="button"&&linkRoutes.has(raw.href)?{href:raw.href}:{}),
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
// Database JSON objects can return keys in a different order. Individual edges
// and corners take precedence over their corresponding all-sides control.
export function styleShorthand(key){
  if(/^border(?:Top|Bottom)(?:Left|Right)Radius$/.test(key))return "borderRadius";
  if(/^border(?:Top|Right|Bottom|Left)Width$/.test(key))return "borderWidth";
  return key.match(/^(padding|margin)(?:Top|Right|Bottom|Left)$/)?.[1];
}
export function editorStyleEntries(style){
  const entries=Object.entries(style);
  for(const [key] of entries.slice()){
    const index=entries.findIndex(([name])=>name===key);
    const earlier=entries.findIndex(([name])=>styleShorthand(name)===key);
    if(earlier!==-1&&earlier<index)entries.splice(earlier,0,...entries.splice(index,1));
  }
  return entries;
}
// Linked styles take priority over older per-button overrides for the same
// edge. Keep unrelated overrides and don't rewrite stored design history.
export function navButtonOverrides(individual={},shared={}){
  const overrides={...individual};
  for(const [key,value] of editorStyleEntries(shared)){
    delete overrides[key];
    for(const name of Object.keys(overrides)){
      if(styleShorthand(name)===key)delete overrides[name];
    }
    if(Object.hasOwn(overrides,styleShorthand(key)))overrides[key]=value;
  }
  return overrides;
}
function declarations(style,area){
  return editorStyleEntries(cleanStyle(style,area)).map(([k,v])=>{
    const cssKey=k.replace(/[A-Z]/g,m=>"-"+m.toLowerCase());
    return cssKey+":"+editorStyleValue(v)+";";
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
      const effective=id.startsWith("shell.nav.")?navButtonOverrides(style,draft.areas["*"]?.mainNavLinks):style;
      const rules=declarations(effective,id);
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
