// Development-only local account smoke test. Public URLs below are not secrets.
// The official @neon/auth SDK handles session cookies and user tokens.
import { createAuthClient } from "@neon/auth";

const AUTH_BASE = "https://ep-blue-credit-bbfdwceu.neonauth.c-15.us-east-1.aws.neon.tech/neondb/auth";
const MEMBER_API = "https://br-empty-lab-bbjb0q1u-members.compute.c-15.us-east-1.aws.neon.tech/profile";
const auth = createAuthClient(AUTH_BASE);

const $ = (id) => document.getElementById(id);
const say = (message) => { $("result").textContent = String(message); };
const errorMessage = (e) => e instanceof Error ? e.message : String(e);

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function run(label, task) {
  say(label + "…");
  try { await task(); }
  catch (e) { say(label + " failed: " + errorMessage(e)); }
}

async function refresh() {
  const { data, error } = await auth.getSession();
  if (error) throw new Error(error.message || "Session check failed");
  const member = data?.user;
  $("session").textContent = member
    ? "Signed in: " + member.email + "\nUser ID: " + member.id
    : "Not signed in";
  return member ?? null;
}

// Managed Better Auth's session JWT is obtained from getSession() in current
// Neon documentation. Some SDK versions cache an opaque session when token()
// is called, so fall back to the managed Auth /token endpoint if necessary.
function isJwt(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

async function token() {
  const { data, error } = await auth.getSession();
  if (error) throw new Error("Session check failed: " + (error.message || "unknown error"));
  if (!data?.user) throw new Error("No active session. Please sign in first.");

  const sessionToken = data?.session?.token;
  if (isJwt(sessionToken)) return sessionToken;

  let response;
  try {
    response = await fetch(AUTH_BASE.replace(/\/$/, "") + "/token", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new Error("Cannot reach Neon Auth token endpoint. Check browser cross-site cookie and network settings.");
  }
  if (!response.ok) {
    throw new Error("Neon Auth token request failed (HTTP " + response.status + "). Please sign in again.");
  }

  const body = await response.json().catch(() => null);
  const jwt = body?.token ?? body?.data?.token;
  if (!isJwt(jwt)) {
    throw new Error("Neon Auth did not return a JWT. Check whether your browser blocks third-party session cookies.");
  }
  return jwt; // Only used in the Authorization header. Never printed, persisted, or logged.
}

async function profileRequest(method, body) {
  const jwt = await token();
  const response = await fetch(MEMBER_API, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    credentials: "omit",
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Profile HTTP ${response.status}: ${data.error || "unknown error"}`);
  return data;
}

function showProfile(profile) {
  if (profile) {
    const form = $("profile");
    form.elements.displayName.value = profile.displayName || "";
    form.elements.aboutMe.value = profile.aboutMe || "";
    $("profilePreview").textContent =
      "Stored display name: " + profile.displayName +
      "\nStored bio: " + (profile.aboutMe || "(empty)") +
      "\nCreated at: " + profile.createdAt +
      "\nUpdated at: " + profile.updatedAt;
  } else {
    $("profilePreview").textContent = "No persisted profile yet.";
  }
}

$("register").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  run("Register", async () => {
    const fields = formData(form);
    if (fields.adult !== "on") throw new Error("Must be at least 18");
    const { data, error } = await auth.signUp.email({
      name: fields.name.trim(), email: fields.email.trim(), password: fields.password,
    });
    if (error) throw new Error(error.message || "Sign-up failed");
    $("verify").elements.email.value = fields.email.trim();
    form.reset();
    say("Registration submitted. Check your email for a verification code. Do not share the code.");
    await refresh();
  });
});

$("verify").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  run("Verify email", async () => {
    const fields = formData(form);
    const { error } = await auth.emailOtp.verifyEmail({
      email: fields.email.trim(), otp: fields.otp.trim(),
    });
    if (error) throw new Error(error.message || "Verification failed");
    form.reset();
    say("Email verification succeeded. Sign in if needed.");
    await refresh();
  });
});

$("login").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  run("Sign in", async () => {
    const fields = formData(form);
    const { error } = await auth.signIn.email({ email: fields.email.trim(), password: fields.password });
    if (error) throw new Error(error.message || "Sign-in failed");
    form.elements.password.value = "";
    await refresh();
    say("Sign-in succeeded.");
  });
});

$("refresh").addEventListener("click", () => run("Check session", async () => {
  const user = await refresh(); say(user ? "Session active." : "No active session.");
}));
$("logout").addEventListener("click", () => run("Sign out", async () => {
  const { error } = await auth.signOut();
  if (error) throw new Error(error.message || "Sign-out failed");
  await refresh();
  showProfile(null);
  say("Signed out.");
}));
$("load").addEventListener("click", () => run("Load profile", async () => {
  const data = await profileRequest("GET");
  showProfile(data.profile);
  say(data.profile ? "Profile retrieved from database." : "No profile saved for this account.");
}));
$("profile").addEventListener("submit", (event) => {
  event.preventDefault();
  run("Save profile", async () => {
    const fields = formData(event.currentTarget);
    if (fields.adultConfirmed !== "on") throw new Error("Age confirmation is required");
    const result = await profileRequest("PUT", {
      displayName: fields.displayName,
      aboutMe: fields.aboutMe || "",
      adultConfirmed: true,
    });
    showProfile(result.profile);
    say("Profile saved to database.");
  });
});
refresh().catch((e) => say("Session check failed: " + errorMessage(e)));
