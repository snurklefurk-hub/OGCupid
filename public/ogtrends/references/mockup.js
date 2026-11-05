(() => {
"use strict";
const box=document.querySelector("#ref-sandbox");
if(!box)return;
const items=[...box.querySelectorAll("[data-refid]")];
const featured=box.querySelector("#ref-featured");
const counter=box.querySelector("#ref-feature-count");
const feedback=box.querySelector("#ref-status");
const active=()=>items.filter(el=>el.dataset.featured==="yes");
function repaint(){
  const cards=active().map(el=>{
    const c=document.createElement("div");c.className="ref-featured-card";
    const label=document.createElement("small");label.textContent=el.dataset.relation+" · "+el.dataset.author;
    const q=document.createElement("p");q.textContent=el.querySelector(".ref-quote").textContent;
    c.append(label,q);return c;
  });
  if(!cards.length){const p=document.createElement("p");p.textContent="No featured references selected. All approved references remain available below.";cards.push(p);}
  featured.replaceChildren(...cards);
  counter.textContent=active().length+"/3";
  for(const item of items){
    const b=item.querySelector("[data-toggle-feature]");
    const isOn=item.dataset.featured==="yes";
    b.textContent=isOn?"Unfeature":"Feature";
    b.setAttribute("aria-pressed",String(isOn));
    b.setAttribute("aria-label",(isOn?"Unfeature ":"Feature ")+item.dataset.author+"'s reference");
  }
}
box.addEventListener("click",e=>{
  const tab=e.target.closest("[data-ref-tab]");
  if(tab){
    const selected=tab.dataset.refTab;
    for(const t of box.querySelectorAll("[data-ref-tab]"))t.setAttribute("aria-selected",String(t===tab));
    for(const p of box.querySelectorAll("[data-ref-panel]"))p.hidden=(p.dataset.refPanel!==selected);
    return;
  }
  const b=e.target.closest("[data-toggle-feature]");
  if(!b)return;
  const item=b.closest("[data-refid]");
  if(item.dataset.featured==="yes"){
    item.dataset.featured="no";
    feedback.textContent="Removed from featured. Still available in full received history.";
  }else if(active().length>=3){
    feedback.textContent="Three featured maximum. Unfeature one first. All references remain in history.";
    return;
  }else{
    item.dataset.featured="yes";
    feedback.textContent="Featured. All five references remain in public history.";
  }
  repaint();
});
repaint();
})();