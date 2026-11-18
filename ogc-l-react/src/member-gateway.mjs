import {safeEssayProfile, composeEssayUpdate} from "./member-essays.mjs";
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
    .map(p => Object.freeze({
      userId: String(p.userId).toLowerCase(), slug: p.slug,
      displayName: p.displayName.slice(0, 60),
      matchPercent: p.matchPercent, confidence: String(p.confidence || "insufficient"),
      commonQuestions: Number.isInteger(p.commonQuestions) && p.commonQuestions >= 0
        ? p.commonQuestions : 0
    }));
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
       !SLUG.test(String(item.slug||"")) || typeof item.displayName!=="string")
      throw new MemberAccessError("unavailable","Invalid conversation peer.");
    const peerId=item.peerId.toLowerCase();
    return Object.freeze({peerId,slug:item.slug,
      displayName:item.displayName.slice(0,60),
      lastMessage:checkedPrivateMessage(item.lastMessage,me,peerId)});
  }));
}
export function sanitizeConversation(data,me,peerId) {
  if(!UUID.test(me) || !UUID.test(peerId) || !data?.peer ||
     data.peer.userId?.toLowerCase()!==peerId ||
     !SLUG.test(String(data.peer.slug||"")) || typeof data.peer.displayName!=="string" ||
     !Array.isArray(data.messages) || data.messages.length>100 ||
     typeof data.blocked!=="boolean" || typeof data.canSend!=="boolean")
    throw new MemberAccessError("unavailable","Invalid private conversation response.");
  return Object.freeze({peer:Object.freeze({userId:peerId,slug:data.peer.slug,
    displayName:data.peer.displayName.slice(0,60)}),
    blocked:data.blocked,canSend:data.canSend,
    messages:Object.freeze(data.messages.map(m=>checkedPrivateMessage(m,me,peerId)))});
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

  return Object.freeze({
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
    // Loads only a primary JPEG authorized by the existing member Function.
    // No URLs, credentials or image bytes are stored in browser storage.
    async getMemberAvatar(targetId) {
      if (!UUID.test(String(targetId || ""))) return null;
      const identity = await bounded(authClient.getSession());
      checkedMember(identity?.data?.user);
      const jwt = await getJwt(identity?.data?.session);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), MAX_WAIT_MS);
      const get = async (path, binary = false) => {
        try {
          const response = await fetcher(endpoints.memberApiBaseUrl + path, {
            method: "GET", credentials: "omit", cache: "no-store",
            headers: {Authorization: "Bearer " + jwt, Accept: binary ? "image/jpeg" : "application/json"},
            signal: controller.signal
          });
          requireResponse(response);
          return await bounded(binary ? response.blob() : response.json());
        } catch (error) {
          if (error instanceof MemberAccessError) throw error;
          throw new MemberAccessError("unavailable", "Unable to load member photo.");
        }
      };
      try {
        const album = await get("/photos/member/" + targetId.toLowerCase());
        if (!Array.isArray(album?.photos)) return null;
        const selected = album.photos.find(p => p?.isPrimary && UUID.test(p?.id || "")) ||
          album.photos.find(p => UUID.test(p?.id || ""));
        if (!selected) return null;
        const image = await get("/photos/" + selected.id + "/bytes", true);
        if (!(image instanceof Blob) || image.type !== "image/jpeg" || image.size > 2_500_000) {
          return null;
        }
        return image;
      } finally { clearTimeout(timer); }
    },
    async getMemberGallery(targetId) {
      // Exactly the existing member-scoped list and JPEG byte endpoints.
      // No raw storage keys, public URLs, cookies, or browser-persisted data.
      if (!UUID.test(String(targetId || ""))) return [];
      const identity=await bounded(authClient.getSession());
      checkedMember(identity?.data?.user);
      const jwt=await getJwt(identity?.data?.session);
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),MAX_WAIT_MS);
      const fetchProtected=async(path,binary=false)=>{
        try {
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
      try {
        const album=await fetchProtected("/photos/member/"+targetId.toLowerCase());
        if(!Array.isArray(album?.photos)||album.photos.length>5)
          throw new MemberAccessError("unavailable","Invalid member photo list.");
        const ids=new Set();
        const records=album.photos.map(photo=>{
          if(!UUID.test(String(photo?.id||"")) || ids.has(photo.id.toLowerCase()) ||
            typeof photo.isPrimary!=="boolean" ||
            !Number.isInteger(photo.sortOrder) || photo.sortOrder<0 ||
            photo.sortOrder>5)
            throw new MemberAccessError("unavailable","Invalid member photo metadata.");
          ids.add(photo.id.toLowerCase());
          return {id:photo.id.toLowerCase(),isPrimary:photo.isPrimary,sortOrder:photo.sortOrder};
        });
        const images=await Promise.all(records.map(async record=>{
          const image=await fetchProtected("/photos/"+record.id+"/bytes",true);
          if(!(image instanceof Blob)||image.type!=="image/jpeg"||
             image.size<=0||image.size>2_500_000)
            throw new MemberAccessError("unavailable","Invalid member photo data.");
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
      return sanitizeQuickmatchDecisions(await readApi("/quickmatch",jwt));
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
