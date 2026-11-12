import { createAuthClient } from "@neon/auth";
import "./styles.css";

// Preview-only defaults. The production build does NOT connect to the
// development database. A release requires explicitly configured production
// endpoints and a separate registration enable flag at build time.
const local = ["localhost", "127.0.0.1"].includes(location.hostname);
const authBaseUrl = local
  ? "https://ep-blue-credit-bbfdwceu.neonauth.c-15.us-east-1.aws.neon.tech/neondb/auth"
  : (import.meta.env.VITE_OGC_AUTH_URL || "");
const memberApiUrl = local
  ? "https://br-empty-lab-bbjb0q1u-members.compute.c-15.us-east-1.aws.neon.tech/profile"
  : (import.meta.env.VITE_OGC_MEMBER_API_URL || "");
const registrationOpenInUi = local ||
  (import.meta.env.VITE_OGC_REGISTRATION_ENABLED === "true");
const auth = authBaseUrl && memberApiUrl ? createAuthClient(authBaseUrl) : null;

const $ = (id) => document.getElementById(id);
let currentUser = null;
let sessionUserId = null;
let cachedProfile = null;

function message(text, type = "info") {
  const node = $("notice");
  node.className = "notice" + (type === "ok" ? " ok" : type === "error" ? " error" : "");
  node.textContent = text;
}

function show(id, visible) {
  $(id).hidden = !visible;
}

function asError(error, fallback) {
  return error?.message || fallback;
}

function fields(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function operation(button, label, job) {
  if (button.disabled) return;
  button.disabled = true;
  message(label + "…");
  try {
    await job();
  } catch (error) {
    message(asError(error, "Something went wrong. Please try again."), "error");
  } finally {
    button.disabled = false;
  }
}

function chooseAuthTab(name) {
  const signup = name === "signup";
  const verify = name === "verify";
  show("signin-form", !signup && !verify);
  show("signup-form", signup);
  show("verify-form", verify);
  $("show-signin").setAttribute("aria-pressed", String(!signup && !verify));
  $("show-signup").setAttribute("aria-pressed", String(signup));
  show("signup-closed", signup && !registrationOpenInUi);
  $("signup-submit").disabled = !registrationOpenInUi;
}

function clearMemberView() {
  cachedProfile = null;
  $("profile-form").reset();
  $("saved-info").textContent = "";
  show("saved-info", false);
  $("member-welcome").textContent = "";
  $("member-email").textContent = "";
}

function renderAuthenticated(member) {
  const authenticated = !!member;
  show("guest-view", !authenticated);
  show("member-view", authenticated);
  show("profile-locked", !authenticated);
  show("profile-form", authenticated);
  if (!member) return;
  $("member-welcome").textContent = member.name || "OG Cupid member";
  $("member-email").textContent = member.email || "";
  if (!cachedProfile && !$("profile-name").value.trim()) {
    $("profile-name").value =
      typeof member.name === "string" ? member.name.trim().slice(0, 60) : "";
  }
}

async function refreshMember(options = {}) {
  if (!auth) return null;
  const { data, error } = await auth.getSession();
  if (error) throw new Error(asError(error, "Could not check your session."));
  const member = data?.user || null;
  const newId = member?.id || null;

  if (newId !== sessionUserId) {
    clearMemberView(); // Never display A's profile when account B signs in.
    sessionUserId = newId;
  }
  currentUser = member;
  renderAuthenticated(member);

  if (member && options.loadProfile) await loadProfile({ silent: true });
  return member;
}

function isJwt(token) {
  return typeof token === "string" &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

async function getAccessToken() {
  const { data, error } = await auth.getSession();
  if (error) throw new Error(asError(error, "Could not check session"));
  if (!data?.user) {
    await refreshMember();
    throw new Error("Your session has expired. Please sign in again.");
  }
  const sessionToken = data?.session?.token;
  if (isJwt(sessionToken)) return sessionToken;

  // Neon-managed Better Auth can return an opaque cookie session. Exchange
  // that for its short-lived JWT, without printing or persisting the token.
  let result;
  try {
    result = await fetch(authBaseUrl.replace(/\/$/, "") + "/token", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new Error("Unable to reach Neon Auth. Check your network and browser cookie settings.");
  }
  if (!result.ok) throw new Error("Unable to obtain an authentication token (HTTP " + result.status + ").");
  const json = await result.json().catch(() => null);
  const token = json?.token ?? json?.data?.token;
  if (!isJwt(token)) throw new Error("Neon Auth did not issue a valid member token.");
  return token;
}

async function requestProfile(method, body) {
  const token = await getAccessToken();
  const result = await fetch(memberApiUrl, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    credentials: "omit",
  });
  const response = await result.json().catch(() => ({}));
  if (!result.ok) {
    if (result.status === 401) await refreshMember();
    throw new Error("Profile request failed (HTTP " + result.status + "): " +
      (response.error || "unknown error"));
  }
  return response;
}

function showStoredProfile(profile) {
  const form = $("profile-form");
  cachedProfile = profile;
  const fallback = typeof currentUser?.name === "string"
    ? currentUser.name.trim().slice(0, 60) : "";
  form.elements.displayName.value = profile?.displayName ?? fallback;
  form.elements.aboutMe.value = profile?.aboutMe ?? "";
  $("bio-count").textContent = String(form.elements.aboutMe.value.length);
  const savedInfo = $("saved-info");
  if (profile) {
    savedInfo.textContent = "Saved privately to OG Cupid. Last updated " +
      new Date(profile.updatedAt).toLocaleString() + ".";
    show("saved-info", true);
  } else {
    savedInfo.textContent = "";
    show("saved-info", false);
  }
}

async function loadProfile({ silent = false } = {}) {
  const data = await requestProfile("GET");
  showStoredProfile(data.profile ?? null);
  if (!silent) message(data.profile
    ? "Your profile was retrieved from the database."
    : "No saved profile yet. Your signup display name is filled in to get you started.", "ok");
  return data.profile || null;
}

function wireForms() {
  $("show-signin").addEventListener("click", () => chooseAuthTab("signin"));
  $("show-signup").addEventListener("click", () => chooseAuthTab("signup"));
  $("back-to-signin").addEventListener("click", () => chooseAuthTab("signin"));

  $("signin-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    operation(form.querySelector('button[type="submit"]'), "Signing you in", async () => {
      const input = fields(form);
      const { error } = await auth.signIn.email({
        email: String(input.email).trim(), password: String(input.password),
      });
      form.elements.password.value = "";
      if (error) throw new Error(asError(error, "Sign-in failed"));
      const member = await refreshMember({ loadProfile: true });
      if (!member) throw new Error("Sign-in succeeded but the session is not available yet.");
      message("Welcome back. Your profile is ready.", "ok");
    });
  });

  $("signup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!registrationOpenInUi) {
      message("Registration is not open. Existing members can still sign in.", "error");
      return;
    }
    if (!form.reportValidity()) return;
    operation(form.querySelector('button[type="submit"]'), "Creating your account", async () => {
      const input = fields(form);
      if (input.adult !== "on") throw new Error("You must confirm that you are at least 18.");
      const email = String(input.email).trim();
      const { error } = await auth.signUp.email({
        name: String(input.name).trim(),
        email,
        password: String(input.password),
      });
      form.elements.password.value = "";
      if (error) throw new Error(asError(error, "Account creation failed"));
      $("verify-form").elements.email.value = email;
      chooseAuthTab("verify");
      message("Check your inbox for a verification code from OG Cupid.", "ok");
    });
  });

  $("verify-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    operation(form.querySelector('button[type="submit"]'), "Verifying your email", async () => {
      const input = fields(form);
      const { error } = await auth.emailOtp.verifyEmail({
        email: String(input.email).trim(),
        otp: String(input.otp).trim(),
      });
      form.elements.otp.value = "";
      if (error) throw new Error(asError(error, "Email verification failed"));
      const member = await refreshMember({ loadProfile: true });
      if (!member) chooseAuthTab("signin");
      message(member
        ? "Email verified! Welcome to OG Cupid."
        : "Email verified. Please sign in to build your profile.", "ok");
    });
  });

  $("signout").addEventListener("click", (event) =>
    operation(event.currentTarget, "Signing out", async () => {
      const { error } = await auth.signOut();
      if (error) throw new Error(asError(error, "Could not sign out"));
      await refreshMember();
      chooseAuthTab("signin");
      message("Signed out. Your profile is safely stored in the database.", "ok");
    }));

  $("reload-profile").addEventListener("click", (event) =>
    operation(event.currentTarget, "Loading your profile", () => loadProfile()));

  $("profile-about").addEventListener("input", (event) => {
    $("bio-count").textContent = String(event.currentTarget.value.length);
  });

  $("profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    operation(form.querySelector('button[type="submit"]'), "Saving your profile", async () => {
      const input = fields(form);
      if (input.adultConfirmed !== "on") {
        throw new Error("You must confirm that you are at least 18.");
      }
      const result = await requestProfile("PUT", {
        displayName: String(input.displayName).trim(),
        aboutMe: String(input.aboutMe || "").trim(),
        adultConfirmed: true,
      });
      showStoredProfile(result.profile);
      message("Your profile has been saved privately to PostgreSQL.", "ok");
    });
  });
}

async function start() {
  if (local) {
    $("environment-label").textContent = "DEVELOPMENT ONLY";
    document.title = "DEV · OG Cupid Member Accounts";
  }
  if (!auth) {
    show("unavailable-view", true);
    message("Member registration isn't public yet. We're working on secure profiles and safety controls.");
    return;
  }
  show("app-view", true);
  chooseAuthTab("signin");
  wireForms();
  try {
    const member = await refreshMember({ loadProfile: true });
    message(member
      ? "Signed in. Your private member profile is ready."
      : "Sign in to your OG Cupid test account. New public registration remains closed.", "ok");
  } catch {
    message("Couldn't check your session. Try signing in again.", "error");
  }
}

start();
