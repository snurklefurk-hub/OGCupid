import {createHash} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {basename,join} from "node:path";
import {fileURLToPath} from "node:url";
import {parseAst} from "rolldown/parseAst";

const src=fileURLToPath(new URL("./src/",import.meta.url));
const catalogId="virtual:ogc-page-copy";
const routes={
  SitemapPage:["sitemap"],AccountPages:["join","recover","verify","account"],AdminDashboard:["admin"],
  AdminMemberEditor:["admin"],CommunityReportsAdmin:["admin"],App:["visitors","signin"],
  CommunityChat:["community"],ContactPage:["contact"],MatchesView:["matches"],
  MatchQuestions:["questions"],MessagesView:["messages"],Onboarding:["onboarding"],
  PersonaQuiz:["persona"],PhotoManager:["photos","onboarding"],ProfileSettings:["settings"],
  LookingForSettings:["settings","onboarding"],QuickmatchView:["quickmatch"],
  EditorialPages:["persona","ogtrends","ogtrends/zero","ogtrends/perfect-profile","ogtrends/references"],
  EditorialContent:["ogtrends","ogtrends/zero","ogtrends/perfect-profile","ogtrends/references","privacy","terms"]
};
const articleRoutes={ogtrends:"ogtrends",zero:"ogtrends/zero","perfect-profile":"ogtrends/perfect-profile",references:"ogtrends/references",privacy:"privacy",terms:"terms"};
const skipFunctions=new Set(["AppShell","LeftRail","RightRail","AdminLink","TopMemberNav","MemberPhoto","MemberCard","MemberResult"]);
const formRoutes={SignInForm:"signin",JoinForm:"join",RecoveryForm:"recover",VerifyForm:"verify",AccountManagement:"account"};
const authoredExpressions={
  SitemapPage:["section.title","page.label","page.note"],App:["title","intro","footnote"],AccountPages:["title","intro","label"],
  PersonaQuiz:["question.prompt","question.note","option","result.name","persona.name","paragraph","archetypes[result][style][0]","archetypes[result][style][1]","archetypes[opposite][style][0]","historicalGuidance[key].avoid","historicalGuidance[key].consider"],
  MatchQuestions:["q.prompt","current.prompt","current.question.prompt","current.question.topic","question.prompt","label","option.label"],
  ProfileSettings:["field.label","option"],LookingForSettings:["option.label","label"],
  EditorialPages:["page.title"],AdminDashboard:["label"],Onboarding:["field.label","option.label","label"]
};
const textValue=node=>node?.type==="Literal"&&typeof node.value==="string"?node.value:null;
const jsxText=value=>value.split(/\r?\n/).map((line,i,lines)=>{
  line=line.replace(/\t/g," ");if(i)line=line.trimStart();if(i<lines.length-1)line=line.trimEnd();return line;
}).filter(Boolean).join(" ");

// Instrument source strings before JSX compilation. Runtime member values never enter the catalog.
export function compilePageCopy(code,file){
  const module=basename(file,".jsx"),pages=routes[module];
  if(!pages)return null;
  const tree=parseAst(code,{lang:"jsx"},file),edits=[],entries=new Map(),counts=new Map();
  function marker(value,scope,attribute){
    const signature=JSON.stringify([module,scope,value,attribute]);
    const count=(counts.get(signature)||0)+1;counts.set(signature,count);
    const id="site."+(attribute?"hint.":"text.")+createHash("sha256").update(signature+"#"+count).digest("hex").slice(0,20);
    entries.set(id,{id,source:value,label:value.trim().slice(0,90),pages:scope.map(p=>"/"+p),attribute});
    return id;
  }
  function walk(node,scope){
    if(!node||typeof node!=="object")return;
    if(Array.isArray(node)){for(const item of node)walk(item,scope);return;}
    if(node.type==="FunctionDeclaration"){
      const name=node.id?.name;
      if(skipFunctions.has(name))return;
      if(formRoutes[name])scope=[formRoutes[name]];
    }
    if(module==="EditorialContent"&&node.type==="Property"){
      const path=articleRoutes[node.key?.name??node.key?.value];if(path)scope=[path];
    }
    if(node.type==="JSXElement"){
      const open=node.openingElement,name=open.name.name,attrs=open.attributes;
      const existing=attrs.find(a=>a.name?.name==="data-ogc-edit-text");
      if(existing){
        const id=textValue(existing.value);
        if(id?.startsWith("copy.")){
          const source=textValue(attrs.find(a=>a.name?.name==="placeholder")?.value)||
            node.children.map(c=>c.type==="JSXText"?jsxText(c.value):textValue(c.expression)||"").join("");
          if(source.trim())entries.set(id,{id,source,label:source.trim().slice(0,90),pages:scope.map(p=>"/"+p)});
        }
        return;
      }
      if(["script","style","ProfileShowcase"].includes(name))return;
      // Preserve existing page heading/intro IDs, including saved designs.
      const standardHead=attrs.some(a=>a.name?.name==="className"&&String(a.value?.value).includes("ogcl-view-head"));
      const legacyHead=standardHead&&scope.every(p=>["matches","quickmatch","questions","messages","community","persona","admin"].includes(p));
      const hint=attrs.find(a=>a.name?.name==="placeholder"),placeholder=textValue(hint?.value);
      if(placeholder)edits.push([hint.start,hint.start,'data-ogc-edit-text="'+marker(placeholder,scope,"placeholder")+'" ']);
      const children=node.children.filter(c=>c.type!=="JSXText"||jsxText(c.value).trim());
      for(const child of children){
        if(legacyHead&&child.type==="JSXElement"&&(child.openingElement.name.name==="h1"||child===children.find(c=>c.openingElement?.name.name==="p")))continue;
        let value=child.type==="JSXText"?jsxText(child.value):textValue(child.expression);
        if(value?.trim()&&/[\p{L}\p{N}]/u.test(value)){
          const id=marker(value,scope);
          if(children.length===1&&typeof name==="string"&&name[0]===name[0].toLowerCase()){
            let attr=' data-ogc-edit-text="'+id+'"';
            if(name==="option"&&!attrs.some(a=>a.name?.name==="value"))attr+=' value={'+JSON.stringify(value)+'}';
            edits.push([open.end-1,open.end-1,attr]);
          }else{
            edits.push([child.start,child.end,'<span data-ogc-edit-text="'+id+'">{'+JSON.stringify(value)+'}</span>']);
          }
        }else if(child.type==="JSXExpressionContainer"){
          const expression=child.expression;
          const source=code.slice(expression.start,expression.end);
          if(authoredExpressions[module]?.includes(source)&&!standardHead){
            const seed=marker(source,scope);entries.delete(seed);
            const attr='data-ogc-edit-text={studioValueId('+JSON.stringify(seed)+','+source+')}';
            if(children.length===1&&/^[a-z]/.test(name)){
              edits.push([open.end-1,open.end-1,' '+attr]);
            }else edits.push([child.start,child.end,'<span '+attr+'>{'+source+'}</span>']);
            continue;
          }
          // Keep counts and other live expressions in their original positions.
          function branches(expr){
            if(expr?.type==="ConditionalExpression"){branches(expr.consequent);branches(expr.alternate);return;}
            if(expr?.type==="LogicalExpression"){branches(expr.right);return;}
            const literal=textValue(expr);
            if(literal?.trim()&&/[\p{L}]/u.test(literal)&&name!=="option"){
              const id=marker(literal,scope);
              edits.push([expr.start,expr.end,'(<span data-ogc-edit-text="'+id+'">{'+JSON.stringify(literal)+'}</span>)']);
            }
          }
          branches(child.expression);walk(child.expression,scope);
        }else walk(child,scope);
      }
      return;
    }
    for(const value of Object.values(node))if(value&&typeof value==="object")walk(value,scope);
  }
  walk(tree,pages);
  for(const [start,end,replacement] of edits.sort((a,b)=>b[0]-a[0]))code=code.slice(0,start)+replacement+code.slice(end);
  if(edits.some(edit=>edit[2].includes("={studioValueId(")))code='import {studioValueId} from "./site-page-copy.mjs";\n'+code;
  return {code,entries:[...entries.values()]};
}
export function pageCopyPlugin(){
  return {name:"ogc-page-copy",enforce:"pre",
    resolveId(id){if(id===catalogId)return "\0"+id;},
    load(id){
      if(id!=="\0"+catalogId)return;
      const entries=[];
      for(const file of readdirSync(src).filter(f=>f.endsWith(".jsx")&&routes[basename(f,".jsx")])){
        const path=join(src,file);this.addWatchFile(path);
        entries.push(...compilePageCopy(readFileSync(path,"utf8"),path).entries);
      }
      return "export default "+JSON.stringify(entries);
    },
    transform(code,id){
      if(!id.replaceAll("\\","/").includes("/src/")||!id.endsWith(".jsx"))return;
      const result=compilePageCopy(code,id);if(result)return {code:result.code,map:null};
    }
  };
}
