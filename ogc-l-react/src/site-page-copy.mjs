import {editorTextTarget} from "./admin-ui-editor-model.mjs";

export function studioValueId(seed,value){
  if(typeof value!=="string"||!value.trim())return undefined;
  let hash=2166136261;
  for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);
  return seed.slice(0,-8)+(hash>>>0).toString(16).padStart(8,"0");
}

const originals=new WeakMap();
export function applySitePageCopy(root,draft,page){
  for(const element of root.querySelectorAll('.ogcl-sheet [data-ogc-edit-text^="site."]')){
    const id=element.getAttribute("data-ogc-edit-text");
    const target=editorTextTarget(id,page);
    if(!target||(!target.attribute&&element.children.length))continue;
    const read=()=>target.attribute?element.getAttribute(target.attribute):element.textContent;
    const current=read();
    let record=originals.get(element);
    if(!record||record.id!==id||current!==record.applied){
      record={id,source:current,applied:current};originals.set(element,record);
    }
    if(root.nodeType===9)element.setAttribute("data-ogc-editor-original-text",record.source);
    const value=draft.texts?.[page]?.[id]??record.source;
    if(current!==value){
      if(target.attribute)element.setAttribute(target.attribute,value);
      else element.textContent=value;
    }
    record.applied=value;
  }
}
