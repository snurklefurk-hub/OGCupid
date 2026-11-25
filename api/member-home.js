import {scoreQuestionCompatibility} from "./discovery-score.js";
import {adjustedViewerMatchPercent} from "./member-discovery.js";
import {historicalGuidance} from "../ogc-l-react/src/persona-content.mjs";
import {OGTRENDS_PUBLICATIONS} from "../ogc-l-react/src/ogtrends-catalog.mjs";
import {AWARD_DEFINITIONS,EXPLORER_PAGES} from "../ogc-l-react/src/home-contract.mjs";

const MAX_CANDIDATES=2000;
const time=value=>{const date=new Date(value);return value!=null&&Number.isFinite(date.getTime())?date.toISOString():null;};
const codes=value=>String(value||"").match(/\b[DR][GB][LS][DM]\b/g)||[];
export function compatiblePersona(ours,theirs,gender){
  if(!/^[DR][GB][LS][DM]$/.test(ours||"")||!/^[DR][GB][LS][DM]$/.test(theirs||""))return false;
  const variants=["Man","Transman"].includes(gender)?["m"]:["Woman","Transwoman"].includes(gender)?["f"]:["m","f"];
  return variants.some(style=>{
    const guidance=historicalGuidance[ours+style];
    if(!guidance)return false;
    const consider=guidance.consider||"",avoid=guidance.avoid||"";
    return !codes(avoid).includes(theirs)&&(codes(consider).includes(theirs)||
      (/someone just like you/i.test(consider)&&ours===theirs)||/anyone else/i.test(consider));
  });
}
export function feedEligibility(peer,viewer,score){
  const gender=viewer.genders.includes(peer.gender);
  const age=peer.age!=null&&Number(peer.age)>=viewer.ageMin&&Number(peer.age)<=viewer.ageMax;
  const distance=peer.distance_miles==null?null:Number(peer.distance_miles);
  const nearby=distance!==null&&Number.isFinite(distance)&&distance<=200;
  const inRadius=viewer.radius===0||(distance!==null&&Number.isFinite(distance)&&distance<=viewer.radius);
  return {profile:gender&&nearby,dealbreaker:gender&&age,essay:gender&&age&&nearby&&score!==null&&score>50,
    match:gender&&score!==null&&score>80,persona:gender&&compatiblePersona(viewer.persona,peer.persona_code,viewer.gender),
    award:gender&&age&&inRadius};
}
function memberItem(peer,kind,at,extra={}){
  const happenedAt=time(at);
  if(!happenedAt)return null;
  return {kind,happenedAt,userId:String(peer.user_id),slug:String(peer.slug),displayName:String(peer.display_name).slice(0,60),avatarPhotoId:peer.avatar_id?String(peer.avatar_id):null,...extra};
}
export function latestFeed(items){return items.filter(Boolean).sort((a,b)=>b.happenedAt.localeCompare(a.happenedAt)||String(b.id).localeCompare(String(a.id))).slice(0,20);}
export async function handleHome(request,userId,withMember,json){
  try{
    if(request.method==="POST"){
      if(!(request.headers.get("content-type")||"").startsWith("application/json"))return json(request,{error:"Expected JSON"},415);
      const raw=await request.text();
      if(raw.length>300)return json(request,{error:"Request too large"},413);
      let input;try{input=JSON.parse(raw);}catch{return json(request,{error:"Invalid activity"},400);}
      if(!input||Array.isArray(input)||!(input.event==="search"&&Object.keys(input).length===1||input.event==="visit"&&Object.keys(input).length===2&&EXPLORER_PAGES.includes(input.path)))return json(request,{error:"Invalid activity"},400);
      const recorded=await withMember(userId,client=>client.query("SELECT app_private.home_progress($1::text,$2::text) AS data",[input.event,input.path??null]));
      return json(request,{progress:recorded.rows[0].data});
    }
    if(request.method!=="GET")return json(request,{error:"Method not allowed"},405);
    const result=await withMember(userId,async client=>{
      const progress=(await client.query("SELECT app_private.home_progress(NULL,NULL) AS data")).rows[0].data;
      const own=(await client.query(`SELECT p.gender,p.interested_in,p.preferred_age_min,p.preferred_age_max,
        l.search_radius_miles,o.match_age_min,o.match_age_max,o.persona_code,app_private.is_discoverable_member(p.user_id) AS eligible
        FROM app_private.member_profiles p
        LEFT JOIN app_private.member_localities l ON l.user_id=p.user_id
        LEFT JOIN app_private.member_onboarding o ON o.user_id=p.user_id
        WHERE p.user_id=$1::uuid`,[userId])).rows[0];
      // The permanent home remains limited to completed members. No peer
      // browsing or matching during the signup tutorial.
      if(!own?.eligible)return {progress,feed:[],candidateLimit:MAX_CANDIDATES,truncated:false};
      const viewer={gender:own.gender,genders:String(own.interested_in||"").split(",").map(x=>x.trim()).filter(Boolean),
        ageMin:Number(own.preferred_age_min??own.match_age_min??18),ageMax:Number(own.preferred_age_max??own.match_age_max??99),
        radius:Number(own.search_radius_miles??50),persona:own.persona_code};
      const peers=viewer.genders.length?(await client.query(`SELECT p.user_id,p.display_name,p.gender,p.age,r.slug,
        signals.distance_miles,app_private.visible_member_persona(p.user_id) AS persona_code,
        (SELECT id FROM app_private.member_photos ph WHERE ph.user_id=p.user_id ORDER BY is_primary DESC,sort_order,created_at,id LIMIT 1) AS avatar_id
        FROM app_private.member_profiles p JOIN app_private.member_profile_routes r ON r.user_id=p.user_id
        LEFT JOIN LATERAL app_private.discovery_member_signals(p.user_id) signals ON true
        WHERE p.user_id<>$1::uuid AND p.gender=ANY($2::text[]) AND app_private.is_discoverable_member(p.user_id)
          AND NOT app_private.member_pair_blocked($1::uuid,p.user_id)
        ORDER BY p.created_at DESC,p.user_id LIMIT $3`,[userId,viewer.genders,MAX_CANDIDATES+1])).rows:[];
      const truncated=peers.length>MAX_CANDIDATES;
      const candidates=peers.slice(0,MAX_CANDIDATES),peerById=new Map(candidates.map(p=>[String(p.user_id),p]));
      const ids=candidates.map(p=>String(p.user_id));
      const answers=(await client.query(`SELECT user_id,question_id,option_id,acceptable_options,importance,is_private,updated_at
        FROM app_private.member_match_answers
        WHERE user_id=$1::uuid OR (user_id=ANY($2::uuid[]) AND is_private=false)`,[userId,ids])).rows;
      const ownAnswers=answers.filter(a=>String(a.user_id)===userId);
      const byUser=new Map();
      for(const a of answers){const id=String(a.user_id);if(id===userId||a.is_private!==false)continue;if(!byUser.has(id))byUser.set(id,[]);byUser.get(id).push(a);}
      const penalties=new Map((await client.query("SELECT target_user_id,match_penalty_points FROM app_private.member_quickmatch_decisions WHERE user_id=$1::uuid AND match_penalty_points>0",[userId])).rows.map(p=>[String(p.target_user_id),Number(p.match_penalty_points)]));
      const eligible={profile:[],essay:[],persona:[],award:[],match:[],dealbreaker:[]},scores=new Map();
      for(const peer of candidates){
        const id=String(peer.user_id),score=adjustedViewerMatchPercent(scoreQuestionCompatibility(ownAnswers,byUser.get(id)||[]).matchPercent,penalties.get(id)||0);
        scores.set(id,score);
        const allowed=feedEligibility(peer,viewer,score);
        for(const kind of Object.keys(eligible))if(allowed[kind])eligible[kind].push(id);
      }
      // Store observation time of a new crossing, not an invented historical
      // timestamp. Reset below threshold so genuine future crossings recur.
      await client.query("UPDATE app_private.member_home_match_state SET reached_at=NULL WHERE user_id=$1::uuid AND reached_at IS NOT NULL AND target_id=ANY($2::uuid[]) AND NOT(target_id=ANY($3::uuid[]))",[userId,ids,eligible.match]);
      if(eligible.match.length)await client.query(`INSERT INTO app_private.member_home_match_state AS state(user_id,target_id,reached_at)
        SELECT $1::uuid,target,now() FROM unnest($2::uuid[]) AS target
        ON CONFLICT(user_id,target_id) DO UPDATE SET reached_at=excluded.reached_at WHERE state.reached_at IS NULL`,[userId,eligible.match]);
      const events=(await client.query(`SELECT id,subject_id,kind,body,href,happened_at FROM app_private.home_events
        WHERE subject_id IS NULL OR (kind='profile' AND subject_id=ANY($1::uuid[])) OR
          (kind='essay' AND subject_id=ANY($2::uuid[])) OR (kind='persona' AND subject_id=ANY($3::uuid[])) OR
          (kind='award' AND subject_id=ANY($4::uuid[]))
        ORDER BY happened_at DESC,id DESC LIMIT 20`,[eligible.profile,eligible.essay,eligible.persona,eligible.award])).rows;
      const feed=events.map(e=>{
        if(!e.subject_id)return {id:"event-"+e.id,kind:e.kind,happenedAt:time(e.happened_at),body:e.body,href:e.href||null};
        const peer=peerById.get(String(e.subject_id));if(!peer)return null;
        return memberItem(peer,e.kind,e.happened_at,{id:"event-"+e.id,...(e.kind==="award"?{award:AWARD_DEFINITIONS[e.body]?.label||e.body}:{}),...(e.kind==="essay"?{matchPercent:scores.get(String(e.subject_id))}:{}),...(e.kind==="persona"?{persona:peer.persona_code}:{})});
      });
      if(eligible.match.length){
        const matches=(await client.query("SELECT target_id,reached_at FROM app_private.member_home_match_state WHERE user_id=$1::uuid AND target_id=ANY($2::uuid[]) AND reached_at IS NOT NULL ORDER BY reached_at DESC,target_id LIMIT 20",[userId,eligible.match])).rows;
        for(const m of matches){const id=String(m.target_id);feed.push(memberItem(peerById.get(id),"match",m.reached_at,{id:"match-"+id,matchPercent:scores.get(id)}));}
      }
      // Only CURRENTLY PUBLIC target answers can produce this event. The
      // question, actual answer, viewer's answer and acceptable options
      // never appear in the response or event ledger.
      const dealbreakers=new Map(ownAnswers.filter(a=>Number(a.importance)===250&&Array.isArray(a.acceptable_options)).map(a=>[a.question_id,a]));
      for(const id of eligible.dealbreaker){
        let n=0;
        for(const a of byUser.get(id)||[]){
          if(dealbreakers.get(a.question_id)?.acceptable_options.includes(a.option_id)){
            feed.push(memberItem(peerById.get(id),"dealbreaker",a.updated_at,{id:"dealbreaker-"+id+"-"+n++}));
          }
        }
      }
      for(const article of OGTRENDS_PUBLICATIONS){if(Date.parse(article.publishedAt)<=Date.now())feed.push({id:'article-'+article.href,kind:'article',body:article.title,href:article.href,happenedAt:article.publishedAt});}
      return {progress,feed:latestFeed(feed),candidateLimit:MAX_CANDIDATES,truncated};
    });
    return json(request,result);
  }catch(error){
    if(error?.code==="42501")return json(request,{error:"Account unavailable"},403);
    if(error?.code==="22023")return json(request,{error:"Invalid activity"},400);
    console.error("Home unavailable",error instanceof Error?error.name:"unknown");
    return json(request,{error:"Home temporarily unavailable"},503);
  }
}
export async function handleHomeAdmin(request,userId,withMember,json){
  try{
    let body=null;
    if(request.method==="POST"){
      if(!(request.headers.get("content-type")||"").startsWith("application/json"))return json(request,{error:"Expected JSON"},415);
      const raw=await request.text();if(raw.length>12000)return json(request,{error:"Post too long"},413);
      let input;try{input=JSON.parse(raw);}catch{return json(request,{error:"Invalid post"},400);}
      if(!input||Object.keys(input).length!==1||typeof input.body!=="string"||!input.body.trim()||input.body.trim().length>2000)return json(request,{error:"Invalid post"},400);
      body=input.body.trim();
    }else if(request.method!=="GET")return json(request,{error:"Method not allowed"},405);
    const result=await withMember(userId,client=>client.query("SELECT app_private.home_admin_post($1::text) AS data",[body]));
    return json(request,{data:result.rows[0].data});
  }catch(error){
    if(error?.code==="42501")return json(request,{error:"Administrator access required"},403);
    if(error?.code==="22023")return json(request,{error:"Invalid post"},400);
    return json(request,{error:"Admin posts unavailable"},503);
  }
}
