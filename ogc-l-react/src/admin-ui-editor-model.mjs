// OG Cupid admin UI editor: declarative, allowlisted draft format.
// This module deliberately cannot execute CSS, JS, external embeds or user HTML.
export const EDITOR_SCHEMA=1;
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
// Stable selectors reference only explicitly supported existing UI regions.
export const EDITOR_AREAS=Object.freeze([
  {id:"pageTitle",label:"Page title",selector:".ogcl-view-head h1"},
  {id:"pageHeader",label:"Page header",selector:".ogcl-view-head"},
  {id:"mainContent",label:"Main content",selector:".ogcl-view"},
  {id:"contentPanel",label:"Content panels",selector:".ogcl-content-panel"},
  {id:"matchesFilters",label:"MATCHES filters",selector:".classic-search"},
  {id:"matchCard",label:"MATCHES profile cards",selector:".ogcl-match-result"},
  {id:"mainNavigation",label:"Main navigation",selector:".ogcl-primary"},
  {id:"brand",label:"Logo region",selector:".ogcl-brand"},
  {id:"leftRail",label:"Left column",selector:".ogcl-left"},
  {id:"rightCard",label:"Right-column cards",selector:".ogcl-side-card"},
  {id:"rightRail",label:"Right column",selector:".ogcl-right"},
  {id:"centerSheet",label:"Center sheet",selector:".ogcl-sheet"},
  {id:"siteBackground",label:"Site background",selector:"body"}
]);
export const EDITOR_TOKENS=Object.freeze([
  {id:"--okc-blue",label:"Site background"},
  {id:"--okc-navy",label:"Navigation blue"},
  {id:"--okc-pink",label:"Heading pink"},
  {id:"--okc-heading",label:"Section headings"},
  {id:"--okc-paper",label:"Page background"},
  {id:"--okc-ink",label:"Body text"},
  {id:"--okc-line",label:"Borders"},
  {id:"--okc-green",label:"Green accents"}
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
  {key:"padding",label:"Padding (px)",kind:"number",max:80},
  {key:"margin",label:"Margin (px)",kind:"number",max:80},
  {key:"borderRadius",label:"Corner radius (px)",kind:"number",max:30}
]);
const COLORS=new Set(EDITOR_PROPERTIES.filter(p=>p.kind==="color").map(p=>p.key));
const NUMBERS=new Map(EDITOR_PROPERTIES.filter(p=>p.kind==="number").map(p=>[p.key,p.max]));
const allowedPages=new Set(EDITOR_PAGES.map(x=>x.path));
const allowedAreas=new Map(EDITOR_AREAS.map(x=>[x.id,x.selector]));
const allowedTokens=new Set(EDITOR_TOKENS.map(x=>x.id));
const blockTypes=new Set(EDITOR_BLOCK_TYPES.map(x=>x.type));
const HEX=/^#[0-9a-fA-F]{6}$/;
const ID=/^block-[a-z0-9-]{1,32}$/;
const isObject=x=>!!x&&typeof x==="object"&&!Array.isArray(x);
export function blankEditorDraft(){return {version:EDITOR_SCHEMA,tokens:{},areas:{},pages:{}};}
function cleanStyle(input){
  const result={};
  if(!isObject(input))return result;
  for(const [key,value] of Object.entries(input)){
    if(COLORS.has(key)&&typeof value==="string"&&HEX.test(value))
      result[key]=value.toLowerCase();
    else if(NUMBERS.has(key)&&Number.isInteger(value)&&value>=0&&value<=NUMBERS.get(key))
      result[key]=value;
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
  if(!isObject(raw)||raw.version!==EDITOR_SCHEMA)return result;
  if(isObject(raw.tokens))for(const [key,value] of Object.entries(raw.tokens))
    if(allowedTokens.has(key)&&typeof value==="string"&&HEX.test(value))
      result.tokens[key]=value.toLowerCase();
  if(isObject(raw.areas))for(const [scope,perArea] of Object.entries(raw.areas)){
    if(scope!=="*"&&!allowedPages.has(scope)||!isObject(perArea))continue;
    const entry={};
    for(const [area,style] of Object.entries(perArea))
      if(allowedAreas.has(area))entry[area]=cleanStyle(style);
    result.areas[scope]=entry;
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
function declarations(style){
  return Object.entries(cleanStyle(style)).map(([k,v])=>{
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
  for(const scope of ["*",page])for(const [id,style] of Object.entries(draft.areas[scope]||{})){
    const selector=allowedAreas.get(id);
    const rules=declarations(style);
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
