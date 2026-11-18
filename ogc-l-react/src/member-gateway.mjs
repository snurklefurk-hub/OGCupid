import {safeEssayProfile, composeEssayUpdate} from "./member-essays.mjs";
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
    if (!/^\/[a-z][a-z0-9-]*$/.test(path) && !/^\/profiles\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) throw new MemberAccessError("unavailable", "Unsupported member API route.");
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
    async getPublicProfile(slug) {
      if (!SLUG.test(String(slug || ""))) {
        throw new MemberAccessError("invalid","Invalid member profile address.");
      }
      const identity=await bounded(authClient.getSession());
      const user=checkedMember(identity?.data?.user);
      const jwt=await getJwt(identity?.data?.session);
      return sanitizePublicProfile(await readApi("/profiles/"+slug,jwt),slug);
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
