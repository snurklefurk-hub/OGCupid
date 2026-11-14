import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./persona.html',import.meta.url),'utf8');
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.style={};this.hidden=false;this.events={};this.classList={add:()=>{}};this.attributes={};this._text='';}
 set textContent(v){this._text=String(v);this.children=[];}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
 appendChild(c){this.children.push(c);c.parent=this;return c;}
 replaceChildren(...cs){this.children=[];this._text='';cs.forEach(c=>this.appendChild(c));}
 setAttribute(k,v){this.attributes[k]=v;}
 getAttribute(k){return this.attributes[k];}
 removeAttribute(k){delete this.attributes[k];}
 addEventListener(k,fn){this.events[k]=fn;}
 scrollIntoView(){}
 get firstElementChild(){return this.children[0];}
 after(el){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this)+1,0,el);el.parent=this.parent;}}
}
function harness(search=''){
 const ids=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const document={
 getElementById(id){assert.ok(ids.has(id),'Missing DOM element: '+id);return ids.get(id);},
 createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t),createTextNode:t=>{const n=new Element('#text');n.textContent=t;return n;},
 querySelector:()=>({value:'m'})
 };
 const events=[];
 const context={document,Image:Element,
  window:{location:{search,href:'https://ogcupid.onrender.com/account/persona.html'+search},dispatchEvent(event){events.push(event);}},
  CustomEvent:class {constructor(type,init){this.type=type;this.detail=init.detail;}},
  URL,URLSearchParams,navigator:{clipboard:{writeText:async()=>{}}}};
 vm.createContext(context);
 const exportCode='globalThis.api={questions,scoreAnswers,answers,renderPage,readyPage,openCatalog,archetypes,originalWriteups,partialHistoricWriteups,revivalSummaries,resultUrl,setPage:n=>page=n,getPage:()=>page,render:(c,g)=>{code=c;style=g;renderResult();}};';
 vm.runInContext(script.replace(/\}\)\(\);\s*$/,exportCode+'})();'),context);
 return {...context.api,ids,events};
}
test('40 mixed questions have valid independent answer scores and provenance',()=>{
 const h=harness();assert.equal(h.questions.length,40);
 assert.equal(new Set(h.questions.map(q=>q.id)).size,40);
 assert.equal(h.questions.filter(q=>q.format==='statement').length,20);
 assert.equal(h.questions.filter(q=>q.axis===null).length,3);
 for(const q of h.questions){assert.ok(q.options.length>=3&&q.options.length<=5);for(const o of q.options){assert.ok(o.label.length>0);assert.ok(Number.isInteger(o.score)&&Math.abs(o.score)<=2);if(q.axis===null)assert.equal(o.score,0);}}
});
test('every one of 16 codes is reachable and both original character sets render',()=>{
 const h=harness();
 for(const code of Object.keys(h.archetypes)){
 const pairs=['DR','GB','LS','DM'];
 const selected=h.questions.map(q=>{
 if(q.axis===null)return 0;
 const sign=code[q.axis]===pairs[q.axis][0]?1:-1;
 return q.options.reduce((best,o,j)=>o.score*sign>q.options[best].score*sign?j:best,0);
 });
 assert.equal(h.scoreAnswers(selected).code,code);
 for(const gender of ['m','f']){
 h.render(code,gender);assert.equal(h.ids.get('persona-name').textContent,h.archetypes[code][gender][0]);
 const key=code+gender;
 if(h.originalWriteups[key]){
 assert.equal(h.ids.get('persona-original-copy').hidden,false);
 assert.equal(h.ids.get('persona-story').hidden,true);
 assert.ok(h.ids.get('persona-original-copy').textContent.length>100);
 }else{
 assert.ok(h.revivalSummaries[key]?.length);
 assert.equal(h.ids.get('persona-story').hidden,false);
 assert.ok(h.ids.get('persona-story').textContent.length>100);
 assert.equal(h.ids.get('persona-archive-status').hidden,false);
 }
 }
 }
 h.openCatalog('intro');assert.equal(h.ids.get('persona-catalog-grid').children.length,32);
});
test('historical interludes cannot change any axis',()=>{
 const h=harness(),choices=h.questions.map(()=>0),before=h.scoreAnswers(choices);
 h.questions.forEach((q,i)=>{if(q.axis===null)choices[i]=q.options.length-1;});
 assert.deepEqual(h.scoreAnswers(choices),before);
});
test('kind casual confidence maps to Gentle, not Brutal; timid romance need not imply Random',()=>{
 const h=harness();
 for(const expected of ['RGSM','DGLD','DGLM','DGSD']){
 const selected=h.questions.map(q=>q.axis===null?0:q.options.findIndex(o=>o.score===(['DR','GB','LS','DM'][q.axis][0]===expected[q.axis]?2:-2)));
 assert.equal(h.scoreAnswers(selected).code,expected);
 }
 // Explicit casual agreements and clear intentions remain Gentle.
 const q=h.questions.find(q=>q.id==='historic-commitment');assert.ok(q.options[1].score>0);
});
test('neutral/invalid choices do not create invented evidence; tie is deterministic',()=>{
 const h=harness(),empty=Array(40).fill(null);assert.equal(h.scoreAnswers(empty).code,'DGLD');
 assert.deepEqual([...h.scoreAnswers(empty).sum],[0,0,0,0]);
 const a=Array(40).fill(null), axis=h.questions.map((q,i)=>({q,i})).filter(x=>x.q.axis===0);
 a[axis[0].i]=axis[0].q.options.findIndex(o=>o.score===2);
 a[axis[1].i]=axis[1].q.options.findIndex(o=>o.score===-2);
 assert.equal(h.scoreAnswers(a).code[0],'D');
});
test('four pages render variable answer counts, restore answers, and require completion',()=>{
 const h=harness();h.renderPage();assert.equal(h.readyPage(),false);
 assert.equal(h.ids.get('persona-questions').children.length,10);
 const q0=h.ids.get('persona-questions').children[0], radio=q0.children.at(-1).children[0].children[0];
 radio.matches=()=>true;
 h.ids.get('persona-questions').events.change({target:radio});
 assert.equal(h.answers[0],0);
 h.setPage(1);h.renderPage();h.setPage(0);h.renderPage();
 assert.equal(h.ids.get('persona-questions').children[0].children.at(-1).children[0].children[0].checked,true);
 h.ids.get('persona-form').events.submit({preventDefault(){}});
 assert.equal(h.getPage(),0);
 h.answers.fill(0);
 for(let p=0;p<4;p++){h.setPage(p);h.renderPage();assert.equal(h.readyPage(),true);assert.equal(h.ids.get('persona-questions').children.length,10);}
 h.ids.get('persona-form').events.submit({preventDefault(){}});
 assert.equal(h.ids.get('persona-result').hidden,false);
 assert.equal(h.ids.get('persona-progress-label').textContent,'40 of 40 answered');
 assert.equal(h.events.length,1);
 assert.equal(h.events[0].type,'ogc:persona-finished');
 assert.equal(h.events[0].detail.answers.length,40);
 assert.deepEqual([...h.events[0].detail.answers],[...h.answers]);
 assert.equal(h.events[0].detail.code,h.scoreAnswers(h.answers).code);
 h.ids.get('persona-retake').events.click();assert.ok(h.answers.every(a=>a===null));
});
test('share links and historical aliases render without archive embeds',()=>{
 const h=harness('?persona=RGLMf');assert.equal(h.ids.get('persona-name').textContent,'The Peach');
 assert.match(h.resultUrl(),/persona=RGLMf/);
 const alias=harness('?persona=DGLD&style=B');assert.equal(alias.ids.get('persona-name').textContent,'The Sonnet');
 assert.doesNotMatch(html,/<iframe|id="persona-show-source"|id="persona-source-viewer"|id="persona-archive-link"/);
});

test('shared/catalog results never mark onboarding complete without a fully answered quiz',()=>{
 const shared=harness('?persona=RGLMf');
 assert.equal(shared.events.length,0);
 const h=harness();
 h.answers.fill(0);
 h.answers[19]=null;
 h.setPage(3);h.renderPage();
 h.ids.get('persona-form').events.submit({preventDefault(){}});
 assert.equal(h.events.length,0);
 h.answers[19]=0;
 h.ids.get('persona-form').events.submit({preventDefault(){}});
 assert.equal(h.events.length,1);
 assert.equal(h.events[0].detail.answers.length,40);
 assert.ok(html.includes('src="./persona-onboarding.js"'),"Persistence module must load on the actual quiz page");
});
