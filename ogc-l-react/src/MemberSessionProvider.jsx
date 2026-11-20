import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {createAuthClient} from "@neon/auth";
import {configuredMemberEndpoints, createMemberGateway, MemberAccessError} from "./member-gateway.mjs";

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
    else setSession(blank); // Never retain another identity across sign-in.
    if (!gateway) {
      if(!quiet)setSession({...blank, kind:"unconfigured",
        error:"Member sign-in is not configured for this preview build."});
      quietCheckInFlight.current=false;
      return false;
    }
    try {
      const result = quiet ? await gateway.revalidate() : await gateway.load();
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
      setSession({...blank, ...result});
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
    setSession(blank);
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
    setSession(blank); // Conceal member information before contacting the server.
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

  const getMemberGallery = useCallback(async id => {
    if (!gateway) throw new MemberAccessError("unavailable","Member API is not configured.");
    return gateway.getMemberGallery(id);
  }, []);

  const getMemberAvatar = useCallback(async (id) => {
    if (!gateway) return null;
    return gateway.getMemberAvatar(id);
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
    return gateway.saveOwnLookingFor(draft);
  },[]);

  const loadOwnSettings=useCallback(async()=>{
    if(!gateway)throw new MemberAccessError("unavailable","Member API is not configured.");
    return gateway.loadOwnSettings();
  },[]);
  const saveOwnSetting=useCallback(async(key,value)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Member API is not configured.");
    return gateway.saveOwnSetting(key,value);
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
    return gateway.saveQuickmatchDecision(targetUserId,decision);
  }, []);

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
    await gateway.signUp(name,email,password,window.location.origin+"/#/onboarding");
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
    return gateway.requestEmailVerification(email,window.location.origin+"/#/onboarding");
  },[]);
  const deleteMyAccount=useCallback(async(password,confirm)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Account deletion is unavailable.");
    await gateway.deleteMyAccount(password,confirm);
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
    loadInbox, loadConversation, sendMessage, setMessageBlock, reportMessage, adminRequest,
    communityRequest,
    accountRequest, signUp, requestRecovery, resetPassword, requestEmailVerification, deleteMyAccount
  }), [session, refresh, signIn, signOut, getMemberAvatar, getMemberGallery, loadOwnEssays, saveOwnEssay,
    getPublicProfile, loadMatchAnswers, saveMatchAnswer]);

  return <MemberSessionContext.Provider value={value}>{children}</MemberSessionContext.Provider>;
}

export function useMemberSession() {
  const value = useContext(MemberSessionContext);
  if (!value) throw new Error("MemberSessionProvider is missing");
  return value;
}
