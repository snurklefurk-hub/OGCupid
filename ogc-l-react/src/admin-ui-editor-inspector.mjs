// Read the actual browser-computed style of a selected preview element.
// These values are for controls/inspection only, never persisted unless
// the administrator actively changes a property.
export function editorColorValue(raw){
  if(typeof raw!=="string")return null;
  if(/^#[0-9a-f]{6}$/i.test(raw))return raw.toLowerCase();
  const match=raw.match(/^rgba?\(\s*([\d.]+)[,\s]+\s*([\d.]+)[,\s]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if(!match||match[4]&&Number.parseFloat(match[4])<1)return null;
  const channel=x=>{
    const n=Number(x);
    return !Number.isFinite(n)||n<0||n>255?null:Math.round(n).toString(16).padStart(2,"0");
  };
  const rgb=[channel(match[1]),channel(match[2]),channel(match[3])];
  return rgb.every(x=>x!==null)?"#"+rgb.join(""):null;
}
export function inspectEditorProperty(style,property){
  if(!style||!property)return {value:"",raw:"Not available"};
  const key=property.key;
  let raw=style[key]||"";
  if(key==="borderRadius")raw=style.borderTopLeftRadius||style.borderRadius||"";
  if(property.kind==="color"){
    const hex=editorColorValue(raw);
    return {value:hex||"",raw:raw||"transparent"};
  }
  if(property.kind==="number"){
    const number=Number.parseFloat(raw);
    return {value:Number.isFinite(number)&&number>=0?
      Math.round(number*10)/10:"",raw:raw||"not set"};
  }
  if(property.kind==="select"){
    let found="";
    if(key==="fontFamily"){
      found=property.options.find(name=>
        raw.toLowerCase().split(",").some(part=>part.trim().replaceAll('"',"").toLowerCase()===name.toLowerCase()))||"";
    }else if(key==="fontWeight"){
      const weight=/bold/i.test(raw)?"700":/normal/i.test(raw)?"400":String(raw);
      found=property.options.includes(weight)?weight:"";
    }else found=property.options.includes(raw)?raw:"";
    return {value:found,raw:raw||"not set"};
  }
  return {value:"",raw:raw||"not set"};
}
export function computedEditorSnapshot(style,properties){
  const snapshot={};
  for(const property of properties)snapshot[property.key]=inspectEditorProperty(style,property);
  return snapshot;
}
