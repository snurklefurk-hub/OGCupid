import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {createAuthClient} from "@neon/auth";
import {configuredMemberEndpoints, createMemberGateway, MemberAccessError} from "./member-gateway.mjs";
import {clearSearchCache} from "./member-search-cache.mjs";

// Only Vite's deliberately configured public endpoint URLs are used.
// Account data, JWTs, passwords and database credentials are not persisted by this app.
const endpoints = configuredMemberEndpoints(
  import.meta.env.VITE_OGC_AUTH_URL,
  import.meta.env.VITE_OGC_MEMBER_API_URL
);
const gateway = endpoints
  ? createMemberGateway({
    authClient: createAuthClient(endpoints.authBaseUrl),
    ...endpoints
  })
  : null;

const blank = Object.freeze({
  kind: "checking",
  user: null,
  onboarding: null,
  profile: null,
  discovery: [],
  discoveryUnavailable: false,
  profileUnavailable: false,
  discoveryLoading: false,
  profileLoading: false,
  error: null
});
const MemberSessionContext = createContext(null);

export function MemberSessionProvider({children}) {
  const [session, setSession] = useState(blank);
  const version = useRef(0);
  const lastChecked = useRef(0);
  const sessionRef = useRef(blank);
  const quietCheckInFlight = useRef(false);
  useEffect(()=>{sessionRef.current=session;},[session]);

  // Initial sign-in and explicit full reloads replace identity-scoped data.
  // Background checks preserve the mounted page, forms and photos while
  // asking the member API to revalidate the same signed-in identity.
  const refresh = useCallback(async (options={}) => {
    const previous=sessionRef.current;
    const quiet=options?.quiet===true &&
      (previous.kind==="member" || previous.kind==="onboarding");
    if(quiet && quietCheckInFlight.current)return false;
    const current=++version.current;
    if(quiet)quietCheckInFlight.current=true;
    else {clearSearchCache();setSession(blank);} // Never retain another identity across sign-in.
    if (!gateway) {
      if(!quiet)setSession({...blank, kind:"unconfigured",
        error:"Member sign-in is not configured for this preview build."});
      quietCheckInFlight.current=false;
      return false;
    }
    try {
      const result = quiet ? await gateway.revalidate() : await gateway.loadIdentity();
      if (current !== version.current) return false;
      lastChecked.current = Date.now();
      if(quiet){
        if(result.user?.id!==previous.user?.id)
          throw new MemberAccessError("unauthorized","Identity changed.");
        if(result.kind!==previous.kind){
          // A completed onboarding transition needs fresh profile/discovery.
          void refresh();
          return false;
        }
        // No state change: page and data remain mounted without a flash.
        return result.kind==="member";
      }
      setSession({...blank, ...result,
        profileLoading:result.kind==="member",
        discoveryLoading:result.kind==="member"});
      return result.kind === "member";
    } catch (error) {
      if (current !== version.current) return false;
      if (error instanceof MemberAccessError && error.code === "unauthorized") {
        // Expired, deleted or switched accounts must immediately lose access.
        setSession({...blank, kind:"guest", error:"Your previous session expired. Please sign in again."});
        void gateway.signOut().catch(() => {});
      } else if(!quiet) {
        setSession({...blank, kind:"error",
          error:"We couldn't verify your account. Please try again."});
      }
      // A temporary network error during quiet validation keeps the existing
      // page; every protected API operation still checks auth on the server.
      lastChecked.current = Date.now();
      return false;
    } finally {
      if(quiet)quietCheckInFlight.current=false;
    }
  }, []);

  const signIn = useCallback(async (email, password) => {
    if (!gateway) throw new MemberAccessError("unavailable", "Sign-in is not configured.");
    // Clear any previous member's data before accepting a new identity.
    const current = ++version.current;
    clearSearchCache();setSession(blank);
    try {
      await gateway.signIn(email, password);
      if (current !== version.current) return false;
      return refresh();
    } catch (error) {
      if (current === version.current) {
        setSession({...blank, kind:"guest"});
      }
      throw error;
    }
  }, [refresh]);

  const signOut = useCallback(async () => {
    const current = ++version.current;
    clearSearchCache();setSession(blank); // Conceal member information before contacting the server.
    lastChecked.current = 0;
    try {
      if (gateway) await gateway.signOut();
      if (current === version.current) setSession({...blank, kind:"guest"});
    } catch {
      // Never claim the Neon server ended a session unless it confirmed it.
      if (current === version.current) {
        setSession({...blank, kind:"error",
          error:"Sign-out could not be confirmed. Please close this tab and try again."});
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const checkOnReturn = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastChecked.current < 60000) return;
      if(sessionRef.current.kind!=="member" && sessionRef.current.kind!=="onboarding")return;
      void refresh({quiet:true});
    };
    document.addEventListener("visibilitychange", checkOnReturn);
    window.addEventListener("focus", checkOnReturn);
    return () => {
      ++version.current; // Ignore results from unmounted StrictMode instances.
      document.removeEventListener("visibilitychange", checkOnReturn);
      window.removeEventListener("focus", checkOnReturn);
    };
  }, [refresh]);

  // Fetch supplementary data after verified membership has rendered. Each
  // request completes independently; a slow Search must not block Profile
  // or the shared shell, and a failed section cannot hide the other.
  useEffect(()=>{
    if(!gateway||session.kind!=="member"||!session.user?.id)return;
    const viewerId=session.user.id;
    const requestVersion=version.current;
    let cancelled=false;
    const loaded=(section,result,error)=>{
      if(cancelled||requestVersion!==version.current)return;
      if(error instanceof MemberAccessError&&error.code==="unauthorized"){
        ++version.current;
        setSession({...blank,kind:"guest",
          error:"Your previous session expired. Please sign in again."});
        void gateway.signOut().catch(()=>{});
        return;
      }
      setSession(previous=>{
        if(requestVersion!==version.current||previous.kind!=="member"||
           previous.user?.id!==viewerId)return previous;
        if(section==="profile"){
          return {...previous,profileLoading:false,
            profile:error?null:result,profileUnavailable:!!error};
        }
        return {...previous,discoveryLoading:false,
          discovery:error?[]:result,discoveryUnavailable:!!error};
      });
    };
    for(const section of ["profile","discovery"]){
      void gateway.loadSupplemental(section).then(result=>loaded(section,result,null))
        .catch(error=>loaded(section,null,error));
    }
    return()=>{cancelled=true;};
  },[session.kind,session.user?.id]);

  // Only a visible, authenticated member tab reports activity. A recent
  // heartbeat is proof of recent browser activity, not a permanent online bit.
  useEffect(()=>{
    if(!gateway || !["member","onboarding"].includes(session.kind))return;
    let mostRecentAttempt=0;
    const pulse=()=>{
      if(document.visibilityState!=="visible" ||
        Date.now()-mostRecentAttempt<75_000)return;
      mostRecentAttempt=Date.now();
      void gateway.recordPresence().catch(()=>{ /* Never invent activity on failure. */ });
    };
    pulse();
    const timer=window.setInterval(pulse,90_000);
    document.addEventListener("visibilitychange",pulse);
    return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",pulse);};
  },[session.kind,session.user?.id]);

  const getMemberGallery = useCallback(async id => {
    if (!gateway) throw new MemberAccessError("unavailable","Member API is not configured.");
    return gateway.getMemberGallery(id);
  }, []);

  const getMemberAvatar = useCallback(async (id, knownPhotoId) => {
    if (!gateway) return null;
    return gateway.getMemberAvatar(id,knownPhotoId);
  }, []);

  const loadOwnEssays = useCallback(async () => {
    if (!gateway) throw new MemberAccessError("unavailable", "Member API is not configured.");
    return gateway.loadOwnEssays();
  }, []);
  const saveOwnEssay = useCallback(async (key, draft) => {
    if (!gateway) throw new MemberAccessError("unavailable", "Member API is not configured.");
    return gateway.saveOwnEssay(key, draft);
  }, []);

  const saveOwnLookingFor=useCallback(async draft=>{
    if(!gateway)throw new MemberAccessError("unavailable","Member API is not configured.");
    const result=await gateway.saveOwnLookingFor(draft);
    clearSearchCache();return result;
  },[]);

  const loadOwnSettings=useCallback(async()=>{
    if(!gateway)throw new MemberAccessError("unavailable","Member API is not configured.");
    return gateway.loadOwnSettings();
  },[]);
  const saveOwnSetting=useCallback(async(key,value)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Member API is not configured.");
    const result=await gateway.saveOwnSetting(key,value);
    clearSearchCache();return result;
  },[]);

  const getPublicProfile = useCallback(async slug => {
    if (!gateway) throw new MemberAccessError("unavailable", "Member API is not configured.");
    return gateway.getPublicProfile(slug);
  }, []);

  const loadQuickmatchDecisions = useCallback(async () => {
    if(!gateway)throw new MemberAccessError("unavailable","Member API is not configured.");
    return gateway.loadQuickmatchDecisions();
  }, []);
  const saveQuickmatchDecision = useCallback(async (targetUserId,decision) => {
    if(!gateway)throw new MemberAccessError("unavailable","Member API is not configured.");
    const result=await gateway.saveQuickmatchDecision(targetUserId,decision);
    clearSearchCache();return result;
  }, []);

  const searchMembers=useCallback(async(criteria,page)=>{
    if(!gateway)throw new MemberAccessError("unavailable","MATCHES search unavailable.");
    try{return await gateway.searchMembers(criteria,page);}
    catch(error){
      // If the server rejects a previously valid JWT, immediately conceal
      // cached Search results while the full membership gate is rechecked.
      if(error instanceof MemberAccessError&&error.code==="unauthorized")
        void refresh();
      throw error;
    }
  },[refresh]);
  const loadConnections=useCallback(async()=>{
    if(!gateway)throw new MemberAccessError("unavailable","Connections unavailable.");
    return gateway.loadConnections();
  },[]);
  const setFavorite=useCallback(async(id,favorite)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Favorites unavailable.");
    return gateway.setFavorite(id,favorite);
  },[]);
  const setSiteBlock=useCallback(async(id,blocked)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Blocks unavailable.");
    const result=await gateway.setSiteBlock(id,blocked);
    clearSearchCache();
    return result;
  },[]);
  const reportProfile=useCallback(async(id,reason)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Reporting unavailable.");
    return gateway.reportProfile(id,reason);
  },[]);
  const loadInbox=useCallback(async()=>{
    if(!gateway)throw new MemberAccessError("unavailable","Messaging is not configured.");
    return gateway.loadInbox();
  },[]);
  const loadConversation=useCallback(async peerId=>{
    if(!gateway)throw new MemberAccessError("unavailable","Messaging is not configured.");
    return gateway.loadConversation(peerId);
  },[]);
  const sendMessage=useCallback(async(peerId,body)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Messaging is not configured.");
    return gateway.sendMessage(peerId,body);
  },[]);
  const setMessageBlock=useCallback(async(peerId,blocked)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Messaging is not configured.");
    return gateway.setMessageBlock(peerId,blocked);
  },[]);
  const reportMessage=useCallback(async(peerId,messageId,reason)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Messaging is not configured.");
    return gateway.reportMessage(peerId,messageId,reason);
  },[]);

  const communityRequest=useCallback(async(path,method="GET",body=null)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Chatroom is not configured.");
    return gateway.communityRequest(path,method,body);
  },[]);

  const loadMatchAnswers = useCallback(async () => {
    if(!gateway)throw new MemberAccessError("unavailable","Member API is not configured.");
    return gateway.loadMatchAnswers();
  }, []);
  const saveMatchAnswer = useCallback(async answer => {
    if(!gateway)throw new MemberAccessError("unavailable","Member API is not configured.");
    return gateway.saveMatchAnswer(answer);
  }, []);

  // Native account and onboarding actions; identity still comes only from Neon.
  const accountRequest=useCallback(async(path,method="GET",body=null)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Account service unavailable.");
    return gateway.accountRequest(path,method,body);
  },[]);
  const signUp=useCallback(async(name,email,password)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Registration is unavailable.");
    await gateway.signUp(name,email,password,window.location.origin+"/onboarding");
    return refresh();
  },[refresh]);
  const requestRecovery=useCallback(async(email)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Recovery is unavailable.");
    return gateway.requestRecovery(email);
  },[]);
  const resetPassword=useCallback(async(email,otp,password)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Recovery is unavailable.");
    return gateway.resetPassword(email,otp,password);
  },[]);
  const requestEmailVerification=useCallback(async(email)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Verification is unavailable.");
    return gateway.requestEmailVerification(email,window.location.origin+"/onboarding");
  },[]);
  const deleteMyAccount=useCallback(async(password,confirm)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Account deletion is unavailable.");
    await gateway.deleteMyAccount(password,confirm);
    clearSearchCache();
    ++version.current;
    setSession({...blank,kind:"guest"});
    return true;
  },[]);

  const adminRequest=useCallback(async(path,method="GET",body=null)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Admin service not configured.");
    return gateway.adminRequest(path,method,body);
  },[]);

  const value = useMemo(() => ({
    ...session, refresh, signIn, signOut, getMemberAvatar, getMemberGallery,
    loadOwnEssays, saveOwnEssay, loadOwnSettings, saveOwnSetting, saveOwnLookingFor, getPublicProfile,
    loadMatchAnswers, saveMatchAnswer, loadQuickmatchDecisions, saveQuickmatchDecision,
    loadConnections,setFavorite,setSiteBlock,reportProfile,searchMembers,
    loadInbox, loadConversation, sendMessage, setMessageBlock, reportMessage, adminRequest,
    communityRequest,
    accountRequest, signUp, requestRecovery, resetPassword, requestEmailVerification, deleteMyAccount
  }), [session, refresh, signIn, signOut, getMemberAvatar, getMemberGallery, loadOwnEssays, saveOwnEssay,
    getPublicProfile, loadMatchAnswers, saveMatchAnswer, searchMembers]);

  return <MemberSessionContext.Provider value={value}>{children}</MemberSessionContext.Provider>;
}

export function useMemberSession() {
  const value = useContext(MemberSessionContext);
  if (!value) throw new Error("MemberSessionProvider is missing");
  return value;
}
