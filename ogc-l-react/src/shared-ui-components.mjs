// Shared, declarative control registry. Used by both the public renderer and
// the member API validator. Never accept selectors or arbitrary CSS from drafts.
const controls=[
  ["button","Buttons","button:not(.chip-option,.filter-chip > button,.ogcl-period-tabs > button,.ogcl-profile-tabs > button,.ogcl-pages > button),a.ogcl-button"],
  ["button.primary","Primary buttons","[data-ogc-control='primary'],button[type='submit'],.ogcl-button:not(.ogcl-secondary):not(.ogcl-danger)"],
  ["button.secondary","Secondary buttons","[data-ogc-control='secondary'],.ogcl-secondary"],
  ["button.danger","Destructive buttons","[data-ogc-control='danger'],.ogcl-danger"],
  ["select","Dropdowns / selectors","select,.filter-chip > button:first-child"],
  ["input","Text / number / date inputs","input:not([type]),input:is([type='text'],[type='search'],[type='email'],[type='password'],[type='tel'],[type='url'],[type='number'],[type='date'],[type='datetime-local'],[type='time'])"],
  ["textarea","Text areas","textarea"],
  ["radio","Radio buttons","input[type='radio'],[role='radio']"],
  ["checkbox","Checkboxes","input[type='checkbox']:not([role='switch']),[role='checkbox']"],
  ["range","Sliders / ranges","input[type='range'],[role='slider']"],
  ["switch","Toggle switches","[role='switch']"],
  ["tabs","Tab buttons",":is(.ogcl-period-tabs,.ogcl-profile-tabs) > :is(button,a),[role='tab']"],
  ["filter","Filter pills",".filter-chip > button:first-child"],
  ["filter.advanced","Advanced filter pill",".filter-chip.green > button:first-child"],
  ["option","Dropdown menu choices",".chip-option,[role='option'],[role='menuitemradio'],[role='menuitemcheckbox']"],
  ["pagination","Pagination",".ogcl-pages > :is(button,a)"],
  ["tooltip","Tooltips","[role='tooltip']"],
];
const instances=[
  ["matches.search","MATCHES · Search","[data-ogc-control-id='matches.search']"],
  ["matches.reset","MATCHES · Reset","[data-ogc-control-id='matches.reset']"],
  ["matches.advanced","MATCHES · Advanced","[data-ogc-control-id='matches.advanced']"],
  ["settings.edit","Profile Settings · Edit","[data-ogc-control-id='settings.edit']"],
  ["settings.save","Profile Settings · Save","[data-ogc-control-id='settings.save']"],
  ["settings.cancel","Profile Settings · Cancel","[data-ogc-control-id='settings.cancel']"],
  ["settings.select","Profile Settings · Dropdown","[data-ogc-control-id='settings.select']"],
  ["settings.checkbox","Profile Settings · Checkbox","[data-ogc-control-id='settings.checkbox']"],
  ["settings.input","Profile Settings · Text input","[data-ogc-control-id='settings.input']"],
];
export const COMPONENT_FAMILIES=Object.freeze([...controls,...instances].map(([id,label,selector],i)=>Object.freeze({
  id,label,selector,instance:i>=controls.length
})));
export const COMPONENT_STATES=Object.freeze([
  {id:"normal",label:"Normal",selector:""},
  {id:"hover",label:"Hover",selector:":hover:not(:disabled):not([aria-disabled='true'])"},
  {id:"focus",label:"Keyboard focus",selector:":focus-visible"},
  {id:"pressed",label:"Pressed",selector:":active:not(:disabled):not([aria-disabled='true'])"},
  {id:"selected",label:"Selected / checked / expanded",selector:":is(:checked,[aria-pressed='true'],[aria-selected='true'],[aria-expanded='true'],[aria-checked='true'],[aria-current='page'])"},
  {id:"disabled",label:"Disabled",selector:":is(:disabled,[aria-disabled='true'])"}
]);
export const componentAreaId=(family,state="normal")=>"control."+family+"."+state;
const areas=new Map(COMPONENT_FAMILIES.flatMap(f=>COMPONENT_STATES.map(s=>[
  componentAreaId(f.id,s.id),{family:f,state:s}
])));
export const isComponentArea=id=>areas.has(id);

const num=(key,label,group,min,max,percent=false)=>({key,label,group,kind:"number",min,max,percent});
const choice=(key,label,group,options)=>({key,label,group,kind:"choice",options});
const color=(key,label)=>({key,label,group:"Colors",kind:"color"});
export const COMPONENT_PROPERTIES=Object.freeze([
  color("backgroundColor","Background"),color("color","Text"),color("borderColor","Border"),
  color("accentColor","Native control accent"),color("outlineColor","Focus outline"),
  {key:"backgroundImage",label:"Gradient",group:"Colors",kind:"gradient"},
  {key:"boxShadow",label:"Shadow",group:"Borders",kind:"shadow"},
  choice("borderStyle","Border style","Borders",["none","solid","dashed","dotted","double","inset","outset"]),
  num("borderWidth","Border width","Borders",0,16),
  num("borderRadius","Corner radius","Borders",0,512),
  ...["TopLeft","TopRight","BottomLeft","BottomRight"].map(side=>num("border"+side+"Radius",side.replace(/([a-z])([A-Z])/,"$1 $2")+" radius","Borders",0,512)),
  num("outlineWidth","Outline width","Borders",0,12),
  num("outlineOffset","Outline offset","Borders",-8,24),
  choice("outlineStyle","Outline style","Borders",["solid","dashed","dotted","double","auto"]),
  ...["width","height","minWidth","minHeight","maxWidth","maxHeight"].map(key=>num(key,key.replace(/([a-z])([A-Z])/,"$1 $2"),"Dimensions",0,2048,true)),
  ...["Top","Right","Bottom","Left"].flatMap(side=>[num("padding"+side,"Padding "+side.toLowerCase(),"Spacing",0,128),num("margin"+side,"Margin "+side.toLowerCase(),"Spacing",0,128)]),
  num("columnGap","Column gap","Spacing",0,128),
  num("rowGap","Row gap","Spacing",0,128),
  num("fontSize","Font size","Type",8,72),
  num("lineHeight","Line height","Type",8,160),
  num("letterSpacing","Letter spacing","Type",-4,16),
  choice("fontFamily","Typeface","Type",["Verdana","Arial","Georgia","Tahoma","Trebuchet MS","Times New Roman","Courier New","system-ui"]),
  choice("fontWeight","Font weight","Type",["100","200","300","400","500","600","700","800","900"]),
  choice("fontStyle","Font style","Type",["normal","italic","oblique"]),
  choice("textAlign","Text alignment","Type",["left","center","right"]),
  choice("textTransform","Text case","Type",["none","uppercase","lowercase","capitalize"])
]);
const properties=new Map(COMPONENT_PROPERTIES.map(p=>[p.key,p]));
const hex=/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
const gradient=/^linear-gradient\((?:0|[1-9]\d?|[12]\d{2}|3[0-5]\d|360)deg, #[0-9a-f]{6}, #[0-9a-f]{6}\)$/i;
const shadow=/^(?:inset )?-?\d{1,3}(?:\.\d)?px -?\d{1,3}(?:\.\d)?px \d{1,3}(?:\.\d)?px -?\d{1,3}(?:\.\d)?px #[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
export function sanitizeComponentStyle(input){
  const clean={};
  if(!input||typeof input!=="object"||Array.isArray(input))return clean;
  for(const [key,value] of Object.entries(input)){
    const p=properties.get(key);
    if(!p)continue;
    if(p.kind==="color"&&typeof value==="string"&&(hex.test(value)||value==="transparent"))clean[key]=value.toLowerCase();
    else if(p.kind==="gradient"&&typeof value==="string"&&(gradient.test(value)||value==="none"))clean[key]=value.toLowerCase();
    else if(p.kind==="shadow"&&typeof value==="string"&&(shadow.test(value)||value==="none"))clean[key]=value.toLowerCase();
    else if(p.kind==="choice"&&p.options.includes(value))clean[key]=value;
    else if(p.kind==="number"&&Number.isFinite(value)&&value>=p.min&&value<=p.max)clean[key]=Math.round(value*10)/10;
    else if(p.percent&&typeof value==="string"&&/^(?:0|[1-9]\d{0,2})(?:\.\d)?%$/.test(value)&&parseFloat(value)<=100)clean[key]=value;
  }
  return clean;
}
export function setComponentProperty(draft,family,state,key,value){
  const id=componentAreaId(family,state);
  if(!isComponentArea(id)||!properties.has(key))return draft;
  const next=structuredClone(draft);
  const global=next.areas["*"]??={};
  const style=global[id]??={};
  if(value===undefined||value==="")delete style[key];
  else {
    const safe=sanitizeComponentStyle({[key]:value});
    if(!Object.hasOwn(safe,key))throw new Error("Invalid "+properties.get(key).label+" value.");
    style[key]=safe[key];
  }
  if(!Object.keys(style).length)delete global[id];
  if(!Object.keys(global).length)delete next.areas["*"];
  return next;
}
export function resetComponentState(draft,family,state){
  const next=structuredClone(draft);
  const global=next.areas?.["*"];
  if(global) {
    delete global[componentAreaId(family,state)];
    if(!Object.keys(global).length)delete next.areas["*"];
  }
  return next;
}
const cssName=key=>key.replace(/[A-Z]/g,l=>"-"+l.toLowerCase());
// Deterministic cascade: shared families, then named variants, then explicit
// instance overrides, with interaction-state rules after normal rules in each
// tier. All selectors are fixed, scoped to the routed sheet; admin chrome is
// deliberately excluded so an unusual design cannot strand its own editor.
export function componentCss(global,preview=false){
  if(!global||typeof global!=="object")return "";
  let css="";
  for(const instance of [false,true]){
    for(const state of COMPONENT_STATES){
      for(const family of COMPONENT_FAMILIES.filter(f=>f.instance===instance)){
        const id=componentAreaId(family.id,state.id);
        const style=sanitizeComponentStyle(global[id]);
        const entries=Object.entries(style).sort(([a],[b])=>a==="borderRadius"?-1:b==="borderRadius"?1:0);
        if(!entries.length)continue;
        const prefix=preview?".ogcl-component-preview":".ogcl-app .ogcl-sheet";
        const suffix=preview?"":":not(:where(.ogcl-admin *))";
        const selector=":where("+prefix+") :where("+family.selector+")"+suffix+
          (state.selector?":where("+state.selector+(preview?",[data-ogc-preview-state='"+state.id+"']":"")+")":"");
        const declarations=entries.map(([k,v])=>cssName(k)+":"+(typeof v==="number"?v+"px":v)+" !important;").join("");
        css+=selector+"{"+declarations+"}\n";
      }
    }
  }
  return css;
}
