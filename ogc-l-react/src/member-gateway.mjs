import {safeEssayProfile, composeEssayUpdate} from "./member-essays.mjs";
import {normalizeSearchCriteria,validSearchPage,SEARCH_PAGE_SIZE} from "./search-contract.mjs";
import {
  photoCacheKey,readProtectedPhoto,storeProtectedPhoto,
  invalidateMemberPhotos,coalescePhoto,makePhotoThumbnail
} from "./member-photo-cache.mjs";
import {sanitizeOwnProfileSettings,composeSettingUpdate} from "./member-settings.mjs";
import {lookingForUpdate} from "./member-looking-for.mjs";
import {sanitizePublicProfile} from "./member-public-profile.mjs";
// OGC-L member gateway. Does not own user accounts or store credentials.
// The existing Neon Auth and production member Function remain authorities.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_WAIT_MS = 12000;

export class MemberAccessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MemberAccessError";
    this.code = code;
  }
}

export function configuredMemberEndpoints(authBaseUrl, memberApiBaseUrl) {
  // No built-in production or dev fallback. Requires deliberate build-time configuration.
  if (!authBaseUrl || !memberApiBaseUrl) return null;
  try {
    const auth = new URL(authBaseUrl);
    const member = new URL(memberApiBaseUrl);
    if (auth.protocol !== "https:" || member.protocol !== "https:" ||
        auth.username || auth.password || member.username || member.password ||
        auth.search || member.search || auth.hash || member.hash) return null;
    return {authBaseUrl: auth.href.replace(/\/$/, ""), memberApiBaseUrl: member.origin};
  } catch { return null; }
}

export async function bounded(promise, milliseconds = MAX_WAIT_MS) {
  let timeoutId;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new MemberAccessError("unavailable", "Account check timed out.")), milliseconds);
      })
    ]);
  } finally { clearTimeout(timeoutId); }
}

function requireResponse(response) {
  if (response.status === 401 || response.status === 403) {
    throw new MemberAccessError("unauthorized", "Session expired or account unavailable.");
  }
  if (!response.ok) throw new MemberAccessError("unavailable", "Member service temporarily unavailable.");
}

function checkedMember(user) {
  if (!user || !UUID.test(String(user.id || ""))) {
    throw new MemberAccessError("unauthorized", "No verified member session.");
  }
  return {id: String(user.id).toLowerCase(), name: String(user.name || "Member").slice(0, 60)};
}

export function sanitizeOnboarding(data) {
  if (!data || typeof data !== "object" || typeof data.explored !== "boolean") {
    throw new MemberAccessError("unavailable", "Invalid onboarding status.");
  }
  return Object.freeze({
    identity: data.identity === true, locality: data.locality === true,
    profile: data.profile === true, photo: data.photo === true,
    quiz: data.quiz === true, explored: data.explored,
    answerCount: Number.isInteger(data.answerCount) && data.answerCount >= 0 ? data.answerCount : 0,
    photoCount: Number.isInteger(data.photoCount) && data.photoCount >= 0 ? data.photoCount : 0
  });
}

export function sanitizeProfile(data, memberId) {
  const p = data?.profile;
  if (p == null) return null;
  if (typeof p !== "object" || !UUID.test(String(p.userId || "")) ||
      String(p.userId).toLowerCase() !== memberId) {
    throw new MemberAccessError("unavailable", "Profile ownership check failed.");
  }
  return Object.freeze({
    userId: memberId,
    displayName: String(p.displayName || "Member").slice(0, 60),
    slug: SLUG.test(p.slug || "") ? p.slug : null
  });
}

export function sanitizeDiscovery(data, memberId) {
  if (!Array.isArray(data?.profiles)) throw new MemberAccessError("unavailable", "Invalid discovery response.");
  return data.profiles.filter(p => p && typeof p === "object" &&
    UUID.test(String(p.userId || "")) && String(p.userId).toLowerCase() !== memberId &&
    SLUG.test(p.slug || "") && typeof p.displayName === "string" &&
    (p.matchPercent === null ||
      (typeof p.matchPercent === "number" && Number.isFinite(p.matchPercent) &&
        p.matchPercent >= 0 && p.matchPercent <= 100)))
    .slice(0, 250)
    .map(p => {
      const permitted=["gender","interestedIn","relationshipGoal","bodyType","status",
        "relationshipType","height","drinking","smoking","vaping","drugs",
        "diet","religion","ethnicity","education","kids","pets","income",
        "languages","orientation"];
      const safeDate=value=>typeof value==="string"&&Number.isFinite(Date.parse(value))
        ?new Date(value).toISOString():null;
      const details=Object.fromEntries(permitted.map(key=>[
        key,typeof p[key]==="string"?p[key].slice(0,200):""
      ]));
      return Object.freeze({
        userId: String(p.userId).toLowerCase(), slug: p.slug,
        displayName: p.displayName.slice(0, 60),
        ...(p.avatarPhotoId===null?{avatarPhotoId:null}:
          UUID.test(String(p.avatarPhotoId||""))?
            {avatarPhotoId:p.avatarPhotoId.toLowerCase()}:{}),
        ...(Number.isInteger(p.age)&&p.age>=18&&p.age<=120?{age:p.age}:{}),
        ...(typeof p.cityRegion==="string"?{cityRegion:p.cityRegion.slice(0,120)}:{}),
        ...details,
        aboutMe:typeof p.aboutMe==="string"?p.aboutMe.slice(0,250):"",
        distanceMiles:Number.isInteger(p.distanceMiles)&&p.distanceMiles>=0&&p.distanceMiles<=13000
          ?p.distanceMiles:null,
        createdAt:safeDate(p.createdAt),lastSeenAt:safeDate(p.lastSeenAt),
        matchPercent: p.matchPercent, confidence: String(p.confidence || "insufficient"),
        commonQuestions: Number.isInteger(p.commonQuestions) && p.commonQuestions >= 0
          ? p.commonQuestions : 0
      });
    });
}

export function sanitizeQuickmatchDecisions(data) {
  if(!Array.isArray(data?.decisions) || data.decisions.length>5000)
    throw new MemberAccessError("unavailable","Invalid Quickmatch decision response.");
  const decisions=new Map();
  for(const item of data.decisions){
    if(!UUID.test(String(item?.targetUserId||"")) ||
        !["like","dislike"].includes(item?.decision))
      throw new MemberAccessError("unavailable","Invalid Quickmatch decision record.");
    decisions.set(item.targetUserId.toLowerCase(),item.decision);
  }
  return decisions;
}

export function sanitizeQuickmatchState(data) {
  const decisions=sanitizeQuickmatchDecisions(data);
  const ids=(value,name,limit=5000)=>{
    if(!Array.isArray(value) || value.length>limit ||
        !value.every(id=>typeof id==="string"&&UUID.test(id)))
      throw new MemberAccessError("unavailable","Invalid Quickmatch "+name+" response.");
    return [...new Set(value.map(id=>id.toLowerCase()))];
  };
  const eligibleUserIds=ids(data.eligibleUserIds,"queue",250);
  const outgoingLikes=ids(data.outgoingLikes,"outgoing likes");
  const incomingLikes=ids(data.incomingLikes,"incoming likes");
  const mutualUserIds=ids(data.mutualUserIds,"mutual likes");
  const outgoing=new Set(outgoingLikes),incoming=new Set(incomingLikes);
  if(mutualUserIds.some(id=>!outgoing.has(id)||!incoming.has(id)))
    throw new MemberAccessError("unavailable","Inconsistent Quickmatch mutual state.");
  return Object.freeze({decisions,eligibleUserIds:new Set(eligibleUserIds),
    outgoingLikes:Object.freeze(outgoingLikes),
    incomingLikes:Object.freeze(incomingLikes),
    mutualUserIds:new Set(mutualUserIds)});
}

function checkedPrivateMessage(m,me,peer){
  if(!m || !UUID.test(String(m.id||"")) || !UUID.test(String(m.senderId||"")) ||
     !UUID.test(String(m.recipientId||"")) || typeof m.body!=="string" || m.body.length>2000 ||
     typeof m.createdAt!=="string" || !Number.isFinite(Date.parse(m.createdAt)) ||
     !((m.senderId.toLowerCase()===me && m.recipientId.toLowerCase()===peer) ||
       (m.senderId.toLowerCase()===peer && m.recipientId.toLowerCase()===me)))
    throw new MemberAccessError("unavailable","Invalid private message response.");
  return Object.freeze({id:m.id.toLowerCase(),senderId:m.senderId.toLowerCase(),
    recipientId:m.recipientId.toLowerCase(),body:m.body,createdAt:m.createdAt});
}
export function sanitizeConversations(data,me) {
  if(!UUID.test(me) || !Array.isArray(data?.conversations) || data.conversations.length>50)
    throw new MemberAccessError("unavailable","Invalid inbox response.");
  return Object.freeze(data.conversations.map(item=>{
    if(!UUID.test(String(item?.peerId||"")) || item.peerId.toLowerCase()===me ||
       (item.pairBlocked===true?item.slug!==null:!SLUG.test(String(item.slug||""))) ||
       (item.pairBlocked!==undefined&&typeof item.pairBlocked!=="boolean") || typeof item.displayName!=="string")
      throw new MemberAccessError("unavailable","Invalid conversation peer.");
    const peerId=item.peerId.toLowerCase();
    return Object.freeze({peerId,slug:item.slug,pairBlocked:item.pairBlocked===true,
      displayName:item.displayName.slice(0,60),
      lastMessage:checkedPrivateMessage(item.lastMessage,me,peerId)});
  }));
}
export function sanitizeConversation(data,me,peerId) {
  if(!UUID.test(me) || !UUID.test(peerId) || !data?.peer ||
     data.peer.userId?.toLowerCase()!==peerId ||
     (data.pairBlocked===true?data.peer.slug!==null:!SLUG.test(String(data.peer.slug||""))) ||
     (data.pairBlocked!==undefined&&typeof data.pairBlocked!=="boolean") || typeof data.peer.displayName!=="string" ||
     !Array.isArray(data.messages) || data.messages.length>100 ||
     typeof data.blocked!=="boolean" || typeof data.canSend!=="boolean")
    throw new MemberAccessError("unavailable","Invalid private conversation response.");
  return Object.freeze({peer:Object.freeze({userId:peerId,slug:data.peer.slug,
    displayName:data.peer.displayName.slice(0,60)}),
    blocked:data.blocked,pairBlocked:data.pairBlocked===true,canSend:data.canSend,
    messages:Object.freeze(data.messages.map(m=>checkedPrivateMessage(m,me,peerId)))});
}

export function sanitizeConnections(data) {
  if(!data||!Array.isArray(data.favorites)||!Array.isArray(data.blocks)||!Array.isArray(data.quiver)||!Array.isArray(data.favoriteMembers)||
     !Number.isSafeInteger(data.favoritedByCount)||data.favoritedByCount<0||
     !Number.isSafeInteger(data.blockedByCount)||data.blockedByCount<0||
     data.favorites.length>5000||data.blocks.length>5000||data.quiver.length>5000||data.favoriteMembers.length>5000)
    throw new MemberAccessError("unavailable","Invalid Favorites/Blocks response.");
  if(!data.favorites.every(x=>typeof x==="string"&&UUID.test(x))||
     ![...data.quiver,...data.favoriteMembers].every(x=>x && UUID.test(String(x.userId||"")) &&
       SLUG.test(String(x.slug||"")) && typeof x.displayName==="string")||
     !data.blocks.every(x=>x && UUID.test(String(x.userId||"")) &&
       typeof x.displayName==="string"&&typeof x.permanent==="boolean"))
    throw new MemberAccessError("unavailable","Invalid Favorites/Blocks records.");
  return Object.freeze({
    favorites:new Set(data.favorites.map(x=>x.toLowerCase())),
    favoriteMembers:Object.freeze(data.favoriteMembers.map(x=>Object.freeze({
      userId:x.userId.toLowerCase(),slug:x.slug,displayName:x.displayName.slice(0,60),
      age:Number.isInteger(x.age)&&x.age>=18&&x.age<=120?x.age:null,
      cityRegion:typeof x.cityRegion==="string"?x.cityRegion.slice(0,120):null,
      matchPercent:null,commonQuestions:0
    }))),
    quiver:Object.freeze(data.quiver.map(x=>Object.freeze({
      userId:x.userId.toLowerCase(),slug:x.slug,displayName:x.displayName.slice(0,60),
      age:Number.isInteger(x.age)&&x.age>=18&&x.age<=120?x.age:null,
      cityRegion:typeof x.cityRegion==="string"?x.cityRegion.slice(0,120):null,
      matchPercent:null,commonQuestions:0
    }))),
    favoritedByCount:data.favoritedByCount,blockedByCount:data.blockedByCount,
    blocks:Object.freeze(data.blocks.map(b=>Object.freeze({
      userId:b.userId.toLowerCase(),displayName:b.displayName.slice(0,60),permanent:b.permanent
    })))
  });
}

export function selectRecommendedMembers(profiles, rng = Math.random) {
  const candidates = Array.isArray(profiles) ? profiles : [];
  const high = candidates.filter(p => typeof p.matchPercent === "number" && p.matchPercent > 75);
  // Fisher–Yates to randomize only real high matches; never randomize scores.
  for (let i = high.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [high[i], high[j]] = [high[j], high[i]];
  }
  const selected = high.slice(0, 3);
  const used = new Set(selected.map(p => p.userId));
  const remainder = candidates.filter(p => !used.has(p.userId)).sort((a, b) =>
    a.matchPercent === null ? 1 : b.matchPercent === null ? -1 : b.matchPercent - a.matchPercent
  );
  return [...selected, ...remainder.slice(0, 3 - selected.length)];
}

export function createMemberGateway({authClient, authBaseUrl, memberApiBaseUrl, fetcher = fetch}) {
  const endpoints = configuredMemberEndpoints(authBaseUrl, memberApiBaseUrl);
  if (!endpoints || !authClient) return null;
  async function readApi(path, jwt) {
    if (!/^\/[a-z][a-z0-9-]*$/.test(path) && !/^\/profiles\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path) && !(path.startsWith("/messages/") && UUID.test(path.slice("/messages/".length)))) throw new MemberAccessError("unavailable", "Unsupported member API route.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MAX_WAIT_MS);
    try {
      const response = await fetcher(endpoints.memberApiBaseUrl + path, {
        method: "GET", credentials: "omit", cache: "no-store",
        headers: {Authorization: "Bearer " + jwt, Accept: "application/json"},
        signal: controller.signal
      });
      requireResponse(response);
      return await bounded(response.json());
    } catch (error) {
      if (error instanceof MemberAccessError) throw error;
      throw new MemberAccessError("unavailable", "Unable to reach the member service.");
    } finally { clearTimeout(timer); }
  }
  async function getJwt(session) {
    if (JWT.test(session?.token || "")) return session.token;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MAX_WAIT_MS);
    try {
      const response = await fetcher(endpoints.authBaseUrl + "/token", {
        method: "GET", credentials: "include", cache: "no-store",
        headers: {Accept: "application/json"}, signal: controller.signal
      });
      requireResponse(response);
      const data = await bounded(response.json());
      const token = data?.token || data?.data?.token;
      if (!JWT.test(token || "")) throw new MemberAccessError("unauthorized", "No valid member token.");
      return token;
    } catch (error) {
      if (error instanceof MemberAccessError) throw error;
      throw new MemberAccessError("unavailable", "Unable to reach the sign-in service.");
    } finally { clearTimeout(timer); }
  }

  async function writeMessageApi(peerId,suffix,method,body) {
    if(!UUID.test(String(peerId||"")) || !["","/block","/report"].includes(suffix) ||
       !["POST","PUT","DELETE"].includes(method))
      throw new MemberAccessError("invalid","Invalid messaging request.");
    peerId=peerId.toLowerCase();
    const identity=await bounded(authClient.getSession());
    const member=checkedMember(identity?.data?.user);
    if(member.id===peerId)throw new MemberAccessError("invalid","Cannot message yourself.");
    const jwt=await getJwt(identity?.data?.session);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),MAX_WAIT_MS);
    try {
      const response=await fetcher(endpoints.memberApiBaseUrl+"/messages/"+peerId+suffix,{
        method,credentials:"omit",cache:"no-store",
        headers:{Authorization:"Bearer "+jwt,Accept:"application/json",
          ...(body?{"Content-Type":"application/json"}:{})},
        ...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal
      });
      if(response.status===409)throw new MemberAccessError("blocked","This member cannot receive messages.");
      if(response.status===429)throw new MemberAccessError("rate_limited","Message limit reached. Please try later.");
      requireResponse(response);
      return await bounded(response.json());
    }catch(error){
      if(error instanceof MemberAccessError)throw error;
      throw new MemberAccessError("unavailable","Unable to contact messaging service.");
    }finally{clearTimeout(timer);}
  }

  async function connectionWrite(kind,targetUserId,method,body=null){
    if(!["favorites","blocks","profile-reports"].includes(kind)||
      !UUID.test(String(targetUserId||"")) ||
      !["PUT","DELETE","POST"].includes(method))
      throw new MemberAccessError("invalid","Invalid member action.");
    const identity=await bounded(authClient.getSession());
    const member=checkedMember(identity?.data?.user);
    if(member.id===targetUserId.toLowerCase())
      throw new MemberAccessError("invalid","Cannot select yourself.");
    const jwt=await getJwt(identity?.data?.session);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),MAX_WAIT_MS);
    try {
      const response=await fetcher(endpoints.memberApiBaseUrl+"/"+kind+"/"+targetUserId.toLowerCase(),{
        method,credentials:"omit",cache:"no-store",
        headers:{Authorization:"Bearer "+jwt,Accept:"application/json",
          ...(body?{"Content-Type":"application/json"}:{})},
        ...(body?{body:JSON.stringify(body)}:{}),
        signal:controller.signal
      });
      if(response.status===409||response.status===404)
        throw new MemberAccessError("blocked","Member action unavailable or block permanent.");
      requireResponse(response);
      return await bounded(response.json());
    }catch(error){
      if(error instanceof MemberAccessError)throw error;
      throw new MemberAccessError("unavailable","Member action could not be saved.");
    }finally{clearTimeout(timer);}
  }

  // Scoped server request for native React account/onboarding workflows.
  // Existing production member Function remains the only data authority.
  async function accountRequest(path,method="GET",body=null) {
    const allowed={
      "/home":new Set(["GET","POST"]),
      "/onboarding":new Set(["GET","PUT"]),
      "/profile":new Set(["GET","PUT"]),
      "/photos":new Set(["GET","POST"]),
      "/account/delete":new Set(["POST"]),
      "/email-preferences":new Set(["GET","PUT"])
    };
    const photoPrimary=/^\/photos\/[0-9a-f-]{36}\/primary$/i.test(path)&&method==="POST";
    const photoDelete=/^\/photos\/[0-9a-f-]{36}$/i.test(path)&&method==="DELETE";
    if(!allowed[path]?.has(method) && !photoPrimary && !photoDelete)
      throw new MemberAccessError("invalid","Unsupported account request.");
    const session=await bounded(authClient.getSession());
    if(session?.error)throw new MemberAccessError("unauthorized","Session is unavailable.");
    const actor=checkedMember(session?.data?.user);
    const jwt=await getJwt(session?.data?.session);
    const isPhoto=path==="/photos"&&method==="POST";
    if(isPhoto && (!(body instanceof Blob)||body.type!=="image/jpeg"||
         body.size<=80||body.size>2_500_000))
      throw new MemberAccessError("invalid","Upload a cropped JPEG (2.5 MB maximum).");
    if(!isPhoto && method!=="GET" && !photoPrimary && !photoDelete &&
       (!body||typeof body!=="object"||Array.isArray(body)||JSON.stringify(body).length>12000))
      throw new MemberAccessError("invalid","Invalid account update.");
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),MAX_WAIT_MS);
    try {
      const response=await fetcher(endpoints.memberApiBaseUrl+path,{
        method,credentials:"omit",cache:"no-store",
        headers:{
          Authorization:"Bearer "+jwt,Accept:"application/json",
          ...(method!=="GET"&&!photoPrimary&&!photoDelete?{"Content-Type":isPhoto?"image/jpeg":"application/json"}:{})
        },
        ...(method!=="GET"&&!photoPrimary&&!photoDelete?{body:isPhoto?body:JSON.stringify(body)}:{}),
        signal:controller.signal
      });
      if(response.status===400||response.status===409||response.status===413)
        throw new MemberAccessError("invalid","Please check your entry and try again.");
      if(response.status===429)throw new MemberAccessError("rate_limited","Too many attempts. Try again later.");
      requireResponse(response);
      const result=await bounded(response.json());
      if(!result || typeof result!=="object")throw new MemberAccessError("unavailable","Invalid account response.");
      if(isPhoto||photoPrimary||photoDelete)
        await invalidateMemberPhotos(actor.id,actor.id);
      return result;
    }catch(error){
      if(error instanceof MemberAccessError)throw error;
      throw new MemberAccessError("unavailable","Could not reach the account service.");
    }finally{clearTimeout(timer);}
  }

  // One shared room for authenticated members, including unfinished onboarding.
  // Each request fetches a live Neon Auth bearer token, never a stored user ID.
  async function communityRequest(path,method="GET",payload=null) {
    const route=/^\/community(?:\?after=(?:0|[1-9][0-9]{0,15})|\/[1-9][0-9]{0,15}\/report|\/reports(?:\/[1-9][0-9]{0,15}\/action)?)?$/;
    if(!route.test(path)||!["GET","POST"].includes(method)||
       method==="GET" && (path.includes("/report")||path.includes("/action"))||
       method==="POST" && (path.includes("?after=")||path==="/community/reports")||
       (method==="POST" && (!payload||typeof payload!=="object"||Array.isArray(payload)||JSON.stringify(payload).length>1000)))
      throw new MemberAccessError("invalid","Invalid community request.");
    const identity=await bounded(authClient.getSession());
    if(identity?.error)throw new MemberAccessError("unauthorized","Session unavailable.");
    checkedMember(identity?.data?.user);
    const jwt=await getJwt(identity?.data?.session);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),MAX_WAIT_MS);
    try {
      const response=await fetcher(endpoints.memberApiBaseUrl+path,{
        method,credentials:"omit",cache:"no-store",
        headers:{Authorization:"Bearer "+jwt,Accept:"application/json",
          ...(method==="POST"?{"Content-Type":"application/json"}:{})},
        ...(method==="POST"?{body:JSON.stringify(payload)}:{}),signal:controller.signal
      });
      if(response.status===403)throw new MemberAccessError("forbidden","Community access unavailable.");
      if(response.status===429)throw new MemberAccessError("rate_limited","Slow down before posting again.");
      if(response.status===400||response.status===409||response.status===413)
        throw new MemberAccessError("invalid","Message or report was not accepted.");
      requireResponse(response);
      const data=await bounded(response.json());
      if(!data||typeof data!=="object")throw new MemberAccessError("unavailable","Invalid chat response.");
      return data;
    }catch(e){
      if(e instanceof MemberAccessError)throw e;
      throw new MemberAccessError("unavailable","Chatroom is unavailable. Try again.");
    }finally{clearTimeout(timer);}
  }

  return Object.freeze({
    communityRequest,
    accountRequest,
    async signUp(name,email,password,callbackURL){
      if(typeof name!=="string"||name.trim().length<2||name.trim().length>60||
         typeof email!=="string"||email.trim().length>254||
         typeof password!=="string"||password.length<12||
         typeof callbackURL!=="string"||!callbackURL.startsWith("https://"))
        throw new MemberAccessError("invalid","Check your display name, email and password.");
      const result=await bounded(authClient.signUp.email({
        name:name.trim(),email:email.trim(),password,callbackURL
      }));
      if(result?.error)throw new MemberAccessError("invalid","Account could not be created with those details.");
      return true;
    },
    async requestEmailVerification(email,callbackURL){
      if(typeof email!=="string"||!email.includes("@"))
        throw new MemberAccessError("invalid","Enter a valid email.");
      const result=await bounded(authClient.sendVerificationEmail({email:email.trim(),callbackURL}));
      if(result?.error)throw new MemberAccessError("unavailable","Couldn't send verification email.");
      return true;
    },
    async requestRecovery(email){
      if(typeof email!=="string"||!email.includes("@"))
        throw new MemberAccessError("invalid","Enter a valid email.");
      const method=authClient.forgetPassword?.emailOtp||
        authClient.emailOtp?.requestPasswordReset;
      if(typeof method!=="function")
        throw new MemberAccessError("unavailable","Recovery is unavailable.");
      const result=authClient.forgetPassword?.emailOtp
        ? await bounded(authClient.forgetPassword.emailOtp({email:email.trim()}))
        : await bounded(authClient.emailOtp.requestPasswordReset({email:email.trim()}));
      if(result?.error)throw new MemberAccessError("unavailable","Couldn't send a recovery code.");
      return true;
    },
    async resetPassword(email,otp,password){
      if(typeof email!=="string"||typeof otp!=="string"||otp.trim().length<4||
         typeof password!=="string"||password.length<12)
        throw new MemberAccessError("invalid","Enter your email, recovery code and new password.");
      if(typeof authClient.emailOtp?.resetPassword!=="function")
        throw new MemberAccessError("unavailable","Password recovery is unavailable.");
      const result=await bounded(authClient.emailOtp.resetPassword({
        email:email.trim(),otp:otp.trim(),password
      }));
      if(result?.error)throw new MemberAccessError("invalid","Recovery code or password was not accepted.");
      return true;
    },
    async deleteMyAccount(password,confirm){
      if(confirm!=="DELETE"||typeof password!=="string"||password.length<12)
        throw new MemberAccessError("invalid","Enter your current password and type DELETE.");
      const session=await bounded(authClient.getSession());
      checkedMember(session?.data?.user);
      const email=session?.data?.user?.email;
      if(typeof email!=="string"||!email.includes("@"))
        throw new MemberAccessError("unauthorized","Your verified account email is unavailable.");
      const result=await accountRequest("/account/delete","POST",{email,password,confirm});
      if(result.deleted!==true)throw new MemberAccessError("unavailable","Deletion was not confirmed.");
      // The Auth user row and sessions were already removed by the server.
      try{await bounded(authClient.signOut());}catch{}
      return true;
    },
    async adminRequest(path,method="GET",payload=null){
      const pathname=path.split("?")[0];
      const memberId="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
      const editing=new RegExp("^/admin/members/"+memberId+"/(?:content|field|age-range|answers(?:/vault-[0-9]{1,25})?|photos(?:/"+memberId+"(?:/(?:bytes|primary|replace))?)?)$","i");
      const uiDesign=/^\/admin\/ui-design(?:\/(?:publish|rollback))?$/;
      const promos=/^\/admin\/promos(?:\/[1-9][0-9]{0,14})?$/;
      if(!(/^\/admin(?:\/(?:members|reports)(?:\/[0-9a-f-]{36}(?:\/(?:action|reinstate))?)?)?$/.test(pathname)||
          editing.test(pathname)||uiDesign.test(pathname)||promos.test(pathname)||pathname==="/admin/home-posts") ||
         (path.includes("?") && (!path.startsWith("/admin/members?q=") || method!=="GET")) ||
         !["GET","POST","PUT","DELETE"].includes(method))
        throw new MemberAccessError("invalid","Unsupported admin request.");
      const session=await bounded(authClient.getSession());
      if(session?.error)throw new MemberAccessError("unauthorized","Session unavailable.");
      checkedMember(session?.data?.user);
      const jwt=await getJwt(session?.data?.session);
      const imageResponse=/\/photos\/[0-9a-f-]{36}\/bytes$/i.test(pathname);
      const form=typeof FormData!=="undefined" && payload instanceof FormData;
      const raw=payload===null?null:form?payload:JSON.stringify(payload);
      if(!form && raw && raw.length>(uiDesign.test(pathname)?120000:12000))
        throw new MemberAccessError("invalid","Admin update exceeds permitted size.");
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),MAX_WAIT_MS);
      try{
        const response=await fetcher(endpoints.memberApiBaseUrl+path,{
          method,credentials:"omit",cache:"no-store",
          headers:{Authorization:"Bearer "+jwt,Accept:imageResponse?"image/jpeg":"application/json",
            ...(raw&&!form?{"Content-Type":"application/json"}:{})},
          ...(raw?{body:raw}:{}),signal:controller.signal
        });
        if(response.status===403)throw new MemberAccessError("forbidden","Administrator access required.");
        if(response.status===409||response.status===400||response.status===413||response.status===415)
          throw new MemberAccessError("invalid","Invalid or stale admin edit. Reload and try again.");
        requireResponse(response);
        if(imageResponse){
          const blob=await bounded(response.blob());
          if(blob.type!=="image/jpeg"||blob.size>2_500_000)
            throw new MemberAccessError("unavailable","Invalid photo response.");
          return blob;
        }
        const data=await bounded(response.json());
        if(!data||!("data" in data))throw new MemberAccessError("unavailable","Invalid admin response.");
        return data.data;
      }catch(err){
        if(err instanceof MemberAccessError)throw err;
        throw new MemberAccessError("unavailable","Admin request failed.");
      }finally{clearTimeout(timer);}
    },
    // A focus/visibility check must not fetch profile, matches or photos.
    // The authenticated /onboarding call still verifies JWT liveness server-side.
    async revalidate() {
      let sessionResult;
      try { sessionResult=await bounded(authClient.getSession()); }
      catch { throw new MemberAccessError("unavailable","Could not verify your session."); }
      if(sessionResult?.error || !sessionResult?.data?.user)
        throw new MemberAccessError("unauthorized","Session expired.");
      const user=checkedMember(sessionResult.data.user);
      const jwt=await getJwt(sessionResult.data.session);
      const onboarding=sanitizeOnboarding(await readApi("/onboarding",jwt));
      return {kind:onboarding.explored?"member":"onboarding",user,onboarding};
    },
    async load() {
      let sessionResult;
      try { sessionResult = await bounded(authClient.getSession()); }
      catch (error) {
        if (error instanceof MemberAccessError) throw error;
        throw new MemberAccessError("unavailable", "Could not verify your session.");
      }
      if (sessionResult?.error) throw new MemberAccessError("unavailable", "Could not verify your session.");
      if (!sessionResult?.data?.user) return {kind: "guest"};
      const user = checkedMember(sessionResult.data.user);
      const jwt = await getJwt(sessionResult.data.session);
      // Mandatory active-member/onboarding check ALWAYS runs before optional
      // profile/discovery reads; never infer completion from Auth or local storage.
      const onboarding = sanitizeOnboarding(await readApi("/onboarding", jwt));
      if (!onboarding.explored) return {kind: "onboarding", user, onboarding};

      // Profile/discovery are supplementary; one outage must not send a
      // completed member back to onboarding or expose stale account data.
      const [profileResult, discoverResult] = await Promise.allSettled([
        readApi("/profile", jwt), readApi("/discovery", jwt)
      ]);
      for (const result of [profileResult, discoverResult]) {
        if (result.status === "rejected" && result.reason?.code === "unauthorized") {
          throw result.reason;
        }
      }
      let profile = null, discovery = [];
      if (profileResult.status === "fulfilled") profile = sanitizeProfile(profileResult.value, user.id);
      if (discoverResult.status === "fulfilled") discovery = sanitizeDiscovery(discoverResult.value, user.id);
      return {
        kind: "member", user, onboarding, profile, discovery,
        profileUnavailable: profileResult.status !== "fulfilled",
        discoveryUnavailable: discoverResult.status !== "fulfilled"
      };
    },
    // Identity and mandatory onboarding gate only. Supplemental profile/search
    // payloads are explicitly deferred so they cannot block the member shell.
    // This method does not store bearer tokens or allow client-side membership claims.
    async loadIdentity() {
      let identity;
      try{identity=await bounded(authClient.getSession());}
      catch(error){
        if(error instanceof MemberAccessError)throw error;
        throw new MemberAccessError("unavailable","Could not verify your session.");
      }
      if(identity?.error)throw new MemberAccessError("unavailable","Could not verify your session.");
      if(!identity?.data?.user)return {kind:"guest"};
      const user=checkedMember(identity.data.user);
      const jwt=await getJwt(identity.data.session);
      const onboarding=sanitizeOnboarding(await readApi("/onboarding",jwt));
      return {kind:onboarding.explored?"member":"onboarding",user,onboarding};
    },
    // Authorized data reads remain individually fallible and are not a
    // prerequisite for rendering a verified member's navigation or account UI.
    async loadSupplemental(section) {
      if(section!=="profile"&&section!=="discovery")
        throw new MemberAccessError("invalid","Unsupported member data section.");
      const identity=await bounded(authClient.getSession());
      if(identity?.error)throw new MemberAccessError("unauthorized","Session unavailable.");
      const user=checkedMember(identity?.data?.user);
      const jwt=await getJwt(identity?.data?.session);
      const data=await readApi("/"+section,jwt);
      return section==="profile"?sanitizeProfile(data,user.id):sanitizeDiscovery(data,user.id);
    },
    // Authenticated search pages are sized/filtered/scored on the server.
    // Do not cache bearer tokens or trust caller-supplied identities.
    async searchMembers(rawCriteria,page=1) {
      let criteria;
      try{criteria=normalizeSearchCriteria(rawCriteria);}
      catch{throw new MemberAccessError("invalid","Invalid MATCHES search criteria.");}
      if(!validSearchPage(page))
        throw new MemberAccessError("invalid","Invalid MATCHES page.");
      const identity=await bounded(authClient.getSession());
      if(identity?.error)throw new MemberAccessError("unauthorized","Session unavailable.");
      const viewer=checkedMember(identity?.data?.user);
      const jwt=await getJwt(identity?.data?.session);
      const params=new URLSearchParams({
        criteria:JSON.stringify(criteria),page:String(page)
      });
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),MAX_WAIT_MS);
      try{
        const response=await fetcher(endpoints.memberApiBaseUrl+
          "/discovery-search?"+params.toString(),{
          method:"GET",credentials:"omit",cache:"no-store",
          headers:{Authorization:"Bearer "+jwt,Accept:"application/json"},
          signal:controller.signal
        });
        requireResponse(response);
        const data=await bounded(response.json());
        if(!Number.isInteger(data?.page)||data.page<1||
           !Number.isInteger(data?.total)||data.total<0||
           !Number.isInteger(data?.totalPages)||data.totalPages<1||
           data.totalPages!==Math.max(1,Math.ceil(data.total/SEARCH_PAGE_SIZE))||
           data.page!==Math.min(page,data.totalPages)||
           data.pageSize!==SEARCH_PAGE_SIZE||
           !Array.isArray(data.profiles)||data.profiles.length>SEARCH_PAGE_SIZE)
          throw new MemberAccessError("unavailable","Invalid MATCHES response.");
        const profiles=sanitizeDiscovery(data,viewer.id);
        if(profiles.length!==data.profiles.length)
          throw new MemberAccessError("unavailable","Invalid MATCHES profiles.");
        return Object.freeze({profiles:Object.freeze(profiles),page:data.page,
          total:data.total,totalPages:data.totalPages,
          truncated:data.truncated===true});
      }catch(error){
        if(error instanceof MemberAccessError)throw error;
        throw new MemberAccessError("unavailable","Could not load MATCHES search.");
      }finally{clearTimeout(timer);}
    },
    // Loads only a primary JPEG authorized by the existing member Function.
    // No URLs, credentials or image bytes are stored in browser storage.
    async getMemberAvatar(targetId,knownPhotoId) {
      if(!UUID.test(String(targetId||""))||knownPhotoId===null||
         (knownPhotoId!==undefined&&!UUID.test(String(knownPhotoId||""))))return null;
      const identity=await bounded(authClient.getSession());
      if(identity?.error)throw new MemberAccessError("unauthorized","Session unavailable.");
      const viewer=checkedMember(identity?.data?.user);
      const target=targetId.toLowerCase();
      const known=knownPhotoId?.toLowerCase();
      const key=photoCacheKey(viewer.id,target,known?"thumb":"avatar",known||"");
      return coalescePhoto(key,async()=>{
        const cached=await readProtectedPhoto(key);
        if(cached)return cached;
        const fullKey=known?photoCacheKey(viewer.id,target,"full",known):null;
        let image=fullKey?await readProtectedPhoto(fullKey):null;
        let photoId=known||null;
        if(!image){
          const jwt=await getJwt(identity?.data?.session);
          const path=known?"/photos/"+known+"/bytes":"/photos/member/"+target+"/avatar";
          const controller=new AbortController();
          const timer=setTimeout(()=>controller.abort(),MAX_WAIT_MS);
          try{
            const response=await fetcher(endpoints.memberApiBaseUrl+path,{
              method:"GET",credentials:"omit",cache:"no-store",
              headers:{Authorization:"Bearer "+jwt,Accept:"image/jpeg"},signal:controller.signal
            });
            if(response.status===404&&!known)return null;
            requireResponse(response);
            if(!known){
              const reported=response.headers?.get?.("X-Photo-Id");
              photoId=UUID.test(String(reported||""))?reported.toLowerCase():null;
            }
            image=await bounded(response.blob());
            if(!(image instanceof Blob)||image.type!=="image/jpeg"||
               image.size<=0||image.size>2_500_000)return null;
            if(photoId)await storeProtectedPhoto(
              photoCacheKey(viewer.id,target,"full",photoId),viewer.id,target,image);
          }catch(error){
            if(error instanceof MemberAccessError)throw error;
            throw new MemberAccessError("unavailable","Unable to load member photo.");
          }finally{clearTimeout(timer);}
        }
        const thumb=await makePhotoThumbnail(image);
        await storeProtectedPhoto(key,viewer.id,target,thumb);
        if(photoId&&known!==photoId)await storeProtectedPhoto(
          photoCacheKey(viewer.id,target,"thumb",photoId),viewer.id,target,thumb);
        return thumb;
      });
    },
    async getMemberGallery(targetId) {
      // Revalidate album visibility/IDs with the protected API on each gallery
      // visit. JPEG bytes themselves are reused from the account's IndexedDB.
      if(!UUID.test(String(targetId||"")))return [];
      const identity=await bounded(authClient.getSession());
      if(identity?.error)throw new MemberAccessError("unauthorized","Session unavailable.");
      const viewer=checkedMember(identity?.data?.user);
      const target=targetId.toLowerCase();
      const jwt=await getJwt(identity?.data?.session);
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),MAX_WAIT_MS);
      const fetchProtected=async(path,binary=false)=>{
        try{
          const response=await fetcher(endpoints.memberApiBaseUrl+path,{
            method:"GET",credentials:"omit",cache:"no-store",
            headers:{Authorization:"Bearer "+jwt,Accept:binary?"image/jpeg":"application/json"},
            signal:controller.signal
          });
          requireResponse(response);
          return await bounded(binary?response.blob():response.json());
        }catch(error){
          if(error instanceof MemberAccessError)throw error;
          throw new MemberAccessError("unavailable","Unable to load member photos.");
        }
      };
      try{
        const album=await fetchProtected("/photos/member/"+target);
        if(!Array.isArray(album?.photos)||album.photos.length>5)
          throw new MemberAccessError("unavailable","Invalid member photo list.");
        const ids=new Set();
        const records=album.photos.map(photo=>{
          if(!UUID.test(String(photo?.id||""))||ids.has(photo.id.toLowerCase())||
             typeof photo.isPrimary!=="boolean"||
             !Number.isInteger(photo.sortOrder)||photo.sortOrder<0||photo.sortOrder>5)
            throw new MemberAccessError("unavailable","Invalid member photo metadata.");
          ids.add(photo.id.toLowerCase());
          return {id:photo.id.toLowerCase(),isPrimary:photo.isPrimary,sortOrder:photo.sortOrder};
        });
        const images=await Promise.all(records.map(async record=>{
          const key=photoCacheKey(viewer.id,target,"full",record.id);
          const image=await coalescePhoto(key,async()=>{
            const cached=await readProtectedPhoto(key);
            if(cached)return cached;
            const fresh=await fetchProtected("/photos/"+record.id+"/bytes",true);
            if(!(fresh instanceof Blob)||fresh.type!=="image/jpeg"||
               fresh.size<=0||fresh.size>2_500_000)
              throw new MemberAccessError("unavailable","Invalid member photo data.");
            await storeProtectedPhoto(key,viewer.id,target,fresh);
            return fresh;
          });
          return Object.freeze({...record,image});
        }));
        return Object.freeze(images);
      }finally{clearTimeout(timer);}
    },
    async loadQuickmatchDecisions() {
      const sessionResult=await bounded(authClient.getSession());
      if(sessionResult?.error)throw new MemberAccessError("unauthorized","Session unavailable.");
      checkedMember(sessionResult?.data?.user);
      const jwt=await getJwt(sessionResult?.data?.session);
      return sanitizeQuickmatchState(await readApi("/quickmatch",jwt));
    },
    async saveQuickmatchDecision(targetUserId,decision) {
      if(!UUID.test(String(targetUserId||"")) || !["like","dislike"].includes(decision))
        throw new MemberAccessError("invalid","Invalid Quickmatch decision.");
      const sessionResult=await bounded(authClient.getSession());
      if(sessionResult?.error)throw new MemberAccessError("unauthorized","Session unavailable.");
      const user=checkedMember(sessionResult?.data?.user);
      if(user.id===targetUserId.toLowerCase())throw new MemberAccessError("invalid","Cannot rate yourself.");
      const jwt=await getJwt(sessionResult?.data?.session);
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),MAX_WAIT_MS);
      try{
        const response=await fetcher(endpoints.memberApiBaseUrl+"/quickmatch",{
          method:"PUT",credentials:"omit",cache:"no-store",
          headers:{Authorization:"Bearer "+jwt,"Content-Type":"application/json",
            Accept:"application/json"},
          body:JSON.stringify({targetUserId:targetUserId.toLowerCase(),decision}),
          signal:controller.signal
        });
        requireResponse(response);
        const confirmation=await bounded(response.json());
        if(confirmation?.saved!==true || confirmation?.decision!==decision ||
           confirmation?.targetUserId!==targetUserId.toLowerCase())
          throw new MemberAccessError("unavailable","Quickmatch save was not confirmed.");
        return confirmation;
      }catch(error){
        if(error instanceof MemberAccessError)throw error;
        throw new MemberAccessError("unavailable","Could not save Quickmatch decision.");
      }finally{clearTimeout(timer);}
    },
    async recordPresence(){
      const identity=await bounded(authClient.getSession());
      checkedMember(identity?.data?.user);
      const jwt=await getJwt(identity?.data?.session);
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),MAX_WAIT_MS);
      try {
        const response=await fetcher(endpoints.memberApiBaseUrl+"/presence",{
          method:"PUT",credentials:"omit",cache:"no-store",
          headers:{Authorization:"Bearer "+jwt,Accept:"application/json"},
          signal:controller.signal
        });
        requireResponse(response);
        const payload=await bounded(response.json());
        if(typeof payload?.lastSeenAt!=="string" ||
          !Number.isFinite(Date.parse(payload.lastSeenAt)))
          throw new MemberAccessError("unavailable","Invalid activity receipt.");
        return payload.lastSeenAt;
      }catch(error){
        if(error instanceof MemberAccessError)throw error;
        throw new MemberAccessError("unavailable","Could not record activity.");
      }finally{clearTimeout(timer);}
    },
    async loadConnections(){
      const identity=await bounded(authClient.getSession());
      checkedMember(identity?.data?.user);
      const jwt=await getJwt(identity?.data?.session);
      return sanitizeConnections(await readApi("/connections",jwt));
    },
    async setFavorite(targetId,favorite){
      const result=await connectionWrite("favorites",targetId,favorite?"PUT":"DELETE");
      if(result?.favorite!==favorite)throw new MemberAccessError("unavailable","Favorite not confirmed.");
      return favorite;
    },
    async setSiteBlock(targetId,blocked){
      const result=await connectionWrite("blocks",targetId,blocked?"PUT":"DELETE");
      if(result?.blocked!==blocked || typeof result.permanent!=="boolean")
        throw new MemberAccessError("unavailable","Block change not confirmed.");
      return result;
    },
    async reportProfile(targetId,reason){
      if(!["spam","harassment","other"].includes(reason))
        throw new MemberAccessError("invalid","Invalid report reason.");
      const result=await connectionWrite("profile-reports",targetId,"POST",{reason});
      if(result?.reported!==true)throw new MemberAccessError("unavailable","Profile report not confirmed.");
      return true;
    },
    async loadInbox() {
      const identity=await bounded(authClient.getSession());
      const member=checkedMember(identity?.data?.user);
      const jwt=await getJwt(identity?.data?.session);
      return sanitizeConversations(await readApi("/messages",jwt),member.id);
    },
    async loadConversation(peerId) {
      if(!UUID.test(String(peerId||"")))throw new MemberAccessError("invalid","Invalid conversation.");
      const identity=await bounded(authClient.getSession());
      const member=checkedMember(identity?.data?.user);
      peerId=peerId.toLowerCase();
      if(peerId===member.id)throw new MemberAccessError("invalid","Cannot message yourself.");
      const jwt=await getJwt(identity?.data?.session);
      return sanitizeConversation(await readApi("/messages/"+peerId,jwt),member.id,peerId);
    },
    async sendMessage(peerId,body) {
      if(typeof body!=="string" || !body.trim() || body.trim().length>2000)
        throw new MemberAccessError("invalid","Messages must be 1 to 2000 characters.");
      const identity=await bounded(authClient.getSession());
      const member=checkedMember(identity?.data?.user);
      if(!UUID.test(String(peerId||"")) || peerId.toLowerCase()===member.id)
        throw new MemberAccessError("invalid","Invalid recipient.");
      const response=await writeMessageApi(peerId,"","POST",{body:body.trim()});
      if(response?.sent!==true || !response?.message)
        throw new MemberAccessError("unavailable","Message was not confirmed.");
      return checkedPrivateMessage(response.message,member.id,peerId.toLowerCase());
    },
    async setMessageBlock(peerId,blocked) {
      const response=await writeMessageApi(peerId,"/block",blocked?"PUT":"DELETE");
      if(response?.blocked!==blocked)
        throw new MemberAccessError("unavailable","Block change was not confirmed.");
      return blocked;
    },
    async reportMessage(peerId,messageId,reason) {
      if(!UUID.test(String(messageId||"")) || !["spam","harassment","other"].includes(reason))
        throw new MemberAccessError("invalid","Invalid report.");
      const response=await writeMessageApi(peerId,"/report","POST",{messageId:messageId.toLowerCase(),reason});
      if(response?.reported!==true)
        throw new MemberAccessError("unavailable","Report was not confirmed.");
      return true;
    },
    async loadMatchAnswers() {
      const identity=await bounded(authClient.getSession());
      checkedMember(identity?.data?.user);
      const jwt=await getJwt(identity?.data?.session);
      return await readApi("/answers",jwt);
    },
    async saveMatchAnswer(answer) {
      const identity=await bounded(authClient.getSession());
      checkedMember(identity?.data?.user);
      const jwt=await getJwt(identity?.data?.session);
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),MAX_WAIT_MS);
      try {
        const response=await fetcher(endpoints.memberApiBaseUrl+"/answers",{
          method:"PUT",credentials:"omit",cache:"no-store",
          headers:{Authorization:"Bearer "+jwt,"Content-Type":"application/json",
            Accept:"application/json"},
          body:JSON.stringify(answer),signal:controller.signal
        });
        requireResponse(response);
        const result=await bounded(response.json());
        if(result?.saved!==true)throw new MemberAccessError("unavailable","Answer not confirmed.");
        return result;
      } catch(error) {
        if(error instanceof MemberAccessError)throw error;
        throw new MemberAccessError("unavailable","Unable to save question answer.");
      } finally {clearTimeout(timer);}
    },
    async getPublicProfile(slug) {
      if (!SLUG.test(String(slug || ""))) {
        throw new MemberAccessError("invalid","Invalid member profile address.");
      }
      const identity=await bounded(authClient.getSession());
      const user=checkedMember(identity?.data?.user);
      const jwt=await getJwt(identity?.data?.session);
      return sanitizePublicProfile(await readApi("/profiles/"+slug,jwt),slug);
    },
    async loadOwnSettings() {
      const identity=await bounded(authClient.getSession());
      if(identity?.error)throw new MemberAccessError("unauthorized","Session unavailable.");
      const me=checkedMember(identity?.data?.user);
      const jwt=await getJwt(identity?.data?.session);
      return sanitizeOwnProfileSettings(await readApi("/profile",jwt),me.id);
    },
    async saveOwnSetting(key,draft) {
      const identity=await bounded(authClient.getSession());
      if(identity?.error)throw new MemberAccessError("unauthorized","Session unavailable.");
      const me=checkedMember(identity?.data?.user);
      const jwt=await getJwt(identity?.data?.session);
      // Reload the newest row before editing a single field; the existing
      // PUT endpoint preserves every unrelated column when omitted.
      const current=sanitizeOwnProfileSettings(await readApi("/profile",jwt),me.id);
      const update=composeSettingUpdate(current,key,draft);
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),MAX_WAIT_MS);
      try{
        const response=await fetcher(endpoints.memberApiBaseUrl+"/profile",{
          method:"PUT",credentials:"omit",cache:"no-store",
          headers:{Authorization:"Bearer "+jwt,"Content-Type":"application/json",
            Accept:"application/json"},body:JSON.stringify(update),signal:controller.signal
        });
        requireResponse(response);
        return sanitizeOwnProfileSettings(await bounded(response.json()),me.id);
      }catch(error){
        if(error instanceof MemberAccessError)throw error;
        throw new MemberAccessError("unavailable","Profile setting could not be saved.");
      }finally{clearTimeout(timer);}
    },
    async saveOwnLookingFor(draft) {
      const identity=await bounded(authClient.getSession());
      if(identity?.error)throw new MemberAccessError("unauthorized","Session unavailable.");
      const me=checkedMember(identity?.data?.user);
      const jwt=await getJwt(identity?.data?.session);
      const current=sanitizeOwnProfileSettings(await readApi("/profile",jwt),me.id);
      const update=lookingForUpdate({...current,...current.lookingFor},draft);
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),MAX_WAIT_MS);
      try{
        const response=await fetcher(endpoints.memberApiBaseUrl+"/profile",{
          method:"PUT",credentials:"omit",cache:"no-store",
          headers:{Authorization:"Bearer "+jwt,"Content-Type":"application/json",
            Accept:"application/json"},body:JSON.stringify(update),signal:controller.signal
        });
        requireResponse(response);
        return sanitizeOwnProfileSettings(await bounded(response.json()),me.id);
      }catch(error){
        if(error instanceof MemberAccessError)throw error;
        throw new MemberAccessError("unavailable","Looking-for preferences could not be saved.");
      }finally{clearTimeout(timer);}
    },
    async loadOwnEssays() {
      const sessionResult = await bounded(authClient.getSession());
      if (sessionResult?.error) throw new MemberAccessError("unauthorized", "Session unavailable.");
      const user = checkedMember(sessionResult?.data?.user);
      const jwt = await getJwt(sessionResult.data.session);
      return safeEssayProfile(await readApi("/profile",jwt),user.id);
    },
    async saveOwnEssay(key, draft) {
      const sessionResult = await bounded(authClient.getSession());
      if (sessionResult?.error) throw new MemberAccessError("unauthorized", "Session unavailable.");
      const user = checkedMember(sessionResult?.data?.user);
      const jwt = await getJwt(sessionResult.data.session);
      // Always read the newest saved bio/age to preserve unrelated profile
      // fields even when a different tab modified them since this view loaded.
      const current = safeEssayProfile(await readApi("/profile",jwt),user.id);
      const update = composeEssayUpdate(current,key,draft);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(),MAX_WAIT_MS);
      try {
        const response = await fetcher(endpoints.memberApiBaseUrl + "/profile",{
          method:"PUT", credentials:"omit", cache:"no-store",
          headers:{Authorization:"Bearer "+jwt, "Content-Type":"application/json",
            Accept:"application/json"},
          body:JSON.stringify(update),signal:controller.signal
        });
        requireResponse(response);
        return safeEssayProfile(await bounded(response.json()),user.id);
      } catch(error) {
        if(error instanceof MemberAccessError) throw error;
        throw new MemberAccessError("unavailable","Could not save this essay.");
      } finally { clearTimeout(timer); }
    },
    async signIn(email, password) {
      if (typeof email !== "string" || typeof password !== "string" ||
          email.length > 254 || email.trim().length < 3 || !password) {
        throw new MemberAccessError("invalid", "Enter your email and password.");
      }
      let result;
      try {
        result = await bounded(authClient.signIn.email({email:email.trim(), password}));
      } catch (error) {
        if (error instanceof MemberAccessError) throw error;
        throw new MemberAccessError("unavailable", "Sign-in request could not be completed.");
      }
      if (result?.error) throw new MemberAccessError("invalid", "Email or password was not accepted.");
    },
    async signOut() {
      try {
        const result = await bounded(authClient.signOut());
        if (result?.error) throw new Error("Neon Auth rejected sign-out");
      } catch {
        throw new MemberAccessError("unavailable",
          "Sign-out could not be confirmed. Please try again.");
      }
    }
  });
}
