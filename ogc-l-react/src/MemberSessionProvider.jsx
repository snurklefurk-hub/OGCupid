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

  const refresh = useCallback(async () => {
    const current = ++version.current;
    setSession(blank); // Purge old member data before every new identity check.
    if (!gateway) {
      setSession({...blank, kind:"unconfigured",
        error:"Member sign-in is not configured for this preview build."});
      return false;
    }
    try {
      const result = await gateway.load();
      if (current !== version.current) return false;
      lastChecked.current = Date.now();
      setSession({...blank, ...result});
      return result.kind === "member";
    } catch (error) {
      if (current !== version.current) return false;
      if (error instanceof MemberAccessError && error.code === "unauthorized") {
        // The Function can reject a stale Auth cookie or deleted member.
        // Auth sign-out is a best-effort cleanup, not the access check.
        setSession({...blank, kind:"guest", error:"Your previous session expired. Please sign in again."});
        void gateway.signOut().catch(() => {});
      } else {
        setSession({...blank, kind:"error",
          error:"We couldn't verify your account. Please try again."});
      }
      lastChecked.current = Date.now();
      return false;
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
      void refresh();
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

  const loadMatchAnswers = useCallback(async () => {
    if(!gateway)throw new MemberAccessError("unavailable","Member API is not configured.");
    return gateway.loadMatchAnswers();
  }, []);
  const saveMatchAnswer = useCallback(async answer => {
    if(!gateway)throw new MemberAccessError("unavailable","Member API is not configured.");
    return gateway.saveMatchAnswer(answer);
  }, []);

  const adminRequest=useCallback(async(path,method="GET",body=null)=>{
    if(!gateway)throw new MemberAccessError("unavailable","Admin service not configured.");
    return gateway.adminRequest(path,method,body);
  },[]);

  const value = useMemo(() => ({
    ...session, refresh, signIn, signOut, getMemberAvatar, getMemberGallery,
    loadOwnEssays, saveOwnEssay, loadOwnSettings, saveOwnSetting, saveOwnLookingFor, getPublicProfile,
    loadMatchAnswers, saveMatchAnswer, loadQuickmatchDecisions, saveQuickmatchDecision,
    loadInbox, loadConversation, sendMessage, setMessageBlock, reportMessage, adminRequest
  }), [session, refresh, signIn, signOut, getMemberAvatar, getMemberGallery, loadOwnEssays, saveOwnEssay,
    getPublicProfile, loadMatchAnswers, saveMatchAnswer]);

  return <MemberSessionContext.Provider value={value}>{children}</MemberSessionContext.Provider>;
}

export function useMemberSession() {
  const value = useContext(MemberSessionContext);
  if (!value) throw new Error("MemberSessionProvider is missing");
  return value;
}
