import { createAuthClient } from "@neon/auth";
import { nextCompatibilityQuestion } from "./question-flow.js";
import "../public/questions/question-bank.js";
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
// Member creation and self-service deletion are enabled on localhost
// for iterative development. Public deployment still requires separately
// configured production endpoints and explicit release approval.
const registrationOpenInUi =
  local || import.meta.env.VITE_OGC_REGISTRATION_ENABLED === "true";
// Self-service deletion is available on both authenticated development and
// production member sites. The API independently requires JWT + password,
// its dedicated deletion role, and the server-side feature flag.
const accountDeletionInUi = Boolean(authBaseUrl && memberApiUrl);
const auth = authBaseUrl && memberApiUrl ? createAuthClient(authBaseUrl) : null;

const $ = (id) => document.getElementById(id);
let currentUser = null;
let sessionUserId = null;
let cachedProfile = null;
const questions = window.OGCQuestionBank.questions.map(question => ({
  ...question, tier: question.tier,
}));
let savedAnswers = new Map();
let currentQuestion = null;
let skippedQuestions = new Set();
let editingQuestionId = null;

function pendingKey() {
  return currentUser?.id ? "ogcupid_pending_question_v1_" + currentUser.id : null;
}

function readPendingQuestion() {
  try {
    const key = pendingKey();
    return key ? JSON.parse(sessionStorage.getItem(key) || "null") : null;
  } catch { return null; }
}

function writePendingQuestion(questionId, focusTier) {
  try {
    const key = pendingKey();
    if (key) sessionStorage.setItem(key, JSON.stringify({ questionId, focusTier }));
  } catch { /* Storage may be unavailable; answering still works. */ }
}

function clearPendingQuestion() {
  try {
    const key = pendingKey();
    if (key) sessionStorage.removeItem(key);
  } catch { /* Storage may be unavailable. */ }
}

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

// Four signup/email settings choices. No optional mail is opted-in by default.
const necessaryEmailOnly = Object.freeze({
  unreadMessages: false, unseenActivity: false, siteUpdates: false, necessaryOnly: true,
});
const signupEmailOptionsStorageKey = "ogcupid.pending-email-preferences.v1";
// Staging is intentionally short-lived and stores ONLY preferences + the
// account email needed to match an eventual verified sign-in. No password,
// OTP or auth token is ever saved here.
let pendingEmailPreferencesInMemory = null;

function readEmailOptions(form) {
  const options = {
    unreadMessages: form.elements.emailMessages.checked,
    unseenActivity: form.elements.emailActivity.checked,
    siteUpdates: form.elements.emailNews.checked,
    necessaryOnly: form.elements.emailNecessaryOnly.checked,
  };
  return normalizeEmailOptions(options);
}

function normalizeEmailOptions(options) {
  const necessaryOnly = options.necessaryOnly === true ||
    !(options.unreadMessages || options.unseenActivity || options.siteUpdates);
  return {
    unreadMessages: !necessaryOnly && options.unreadMessages === true,
    unseenActivity: !necessaryOnly && options.unseenActivity === true,
    siteUpdates: !necessaryOnly && options.siteUpdates === true,
    necessaryOnly,
  };
}

function populateEmailOptions(form, options) {
  const selected = normalizeEmailOptions(options);
  form.elements.emailMessages.checked = selected.unreadMessages;
  form.elements.emailActivity.checked = selected.unseenActivity;
  form.elements.emailNews.checked = selected.siteUpdates;
  form.elements.emailNecessaryOnly.checked = selected.necessaryOnly;
}

function bindEmailOptionOverrides(form) {
  form.addEventListener("change", event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.emailOption) return;
    const optionals = [
      form.elements.emailMessages, form.elements.emailActivity, form.elements.emailNews,
    ];
    const necessary = form.elements.emailNecessaryOnly;
    if (target === necessary && necessary.checked) {
      optionals.forEach(input => { input.checked = false; });
    } else if (optionals.includes(target) && target.checked) {
      necessary.checked = false;
    }
    if (!optionals.some(input => input.checked)) necessary.checked = true;
  });
}

function stageSignupEmailOptions(email, options) {
  const record = {
    email: email.trim().toLowerCase(),
    storedAt: Date.now(),
    preferences: normalizeEmailOptions(options),
  };
  pendingEmailPreferencesInMemory = record;
  try { sessionStorage.setItem(signupEmailOptionsStorageKey, JSON.stringify(record)); }
  catch { /* Private-browsing storage may be disabled; memory still works. */ }
}

function stagedEmailOptionsFor(member) {
  let staged = pendingEmailPreferencesInMemory;
  if (!staged) {
    try { staged = JSON.parse(sessionStorage.getItem(signupEmailOptionsStorageKey) || "null"); }
    catch { staged = null; }
  }
  if (!staged || typeof staged !== "object") return null;
  if (Date.now() - staged.storedAt > 7 * 86400000 || !Number.isFinite(staged.storedAt)) {
    clearStagedEmailOptions();
    return null;
  }
  if (typeof member?.email !== "string" ||
      staged.email !== member.email.trim().toLowerCase()) return null;
  const choices = staged.preferences;
  return choices && typeof choices === "object" ? normalizeEmailOptions(choices) : null;
}

function clearStagedEmailOptions() {
  pendingEmailPreferencesInMemory = null;
  try { sessionStorage.removeItem(signupEmailOptionsStorageKey); }
  catch { /* No writable session storage. */ }
}

async function loadEmailOptions() {
  if (!currentUser) return;
  const pending = stagedEmailOptionsFor(currentUser);
  // This runs only after an authenticated Neon session has been confirmed.
  // It survives the email-code step without trusting an unauthenticated ID.
  const result = pending
    ? await requestPrivate("/email-preferences", "PUT", pending)
    : await requestPrivate("/email-preferences", "GET");
  populateEmailOptions($("email-settings-form"), result.preferences || necessaryEmailOnly);
  if (pending) clearStagedEmailOptions();
  $("email-preferences-status").textContent = pending
    ? "Your signup email choices have been saved." : "";
}

async function operation(button, label, job) {
  if (button.disabled) return;
  button.disabled = true;
  message(label + ".");
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
  const resetRequest = name === "reset-request";
  const resetConfirm = name === "reset-confirm";
  const signin = name === "signin";
  show("signin-form", signin);
  show("signup-form", signup);
  show("verify-form", verify);
  show("reset-request-form", resetRequest);
  show("reset-confirm-form", resetConfirm);
  $("show-signin").setAttribute("aria-pressed", String(signin));
  $("show-signup").setAttribute("aria-pressed", String(signup));
  show("signup-closed", signup && !registrationOpenInUi);
  $("signup-submit").disabled = !registrationOpenInUi;
}

function clearMemberView() {
  cachedProfile = null;
  savedAnswers = new Map();
  currentQuestion = null;
  skippedQuestions = new Set();
  editingQuestionId = null;
  show("question-view", false);
  show("question-locked", true);
  $("profile-form").reset();
  renderProfilePreview();
  populateEmailOptions($("email-settings-form"), necessaryEmailOnly);
  $("email-preferences-status").textContent = "";
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
  show("profile-preview-panel", authenticated);
  show("question-view", authenticated);
  show("question-locked", !authenticated);
  show("member-persona-panel", authenticated);
  show("email-settings-form", authenticated);
  // Normal owner-controlled account deletion in the development site.
  show("deletion-test", authenticated && accountDeletionInUi);
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

  if (member && options.loadProfile) {
    await loadProfile({ silent: true });
    await loadAnswers();
    try { await loadEmailOptions(); }
    catch { $("email-preferences-status").textContent = "Could not load email preferences. Try saving them again."; }
  }
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

async function requestPrivate(path, method, body) {
  const token = await getAccessToken();
  const endpoint = new URL(memberApiUrl);
  endpoint.pathname = path;
  const result = await fetch(endpoint.toString(), {
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
    if (result.status === 401) {
      // A browser/Neon Auth session may be locally cached even after the
      // member was deleted. Trust the profile API's 401 over any cached UI.
      // Never leave the previous account's profile visible in this case.
      try { await auth.signOut(); } catch { /* Session may already be gone */ }
      currentUser = null;
      sessionUserId = null;
      clearMemberView();
      renderAuthenticated(null);
      throw new Error("Your account session is no longer valid. Please sign in again.");
    }
    throw new Error("Profile request failed (HTTP " + result.status + "): " +
      (response.error || "unknown error"));
  }
  return response;
}
const requestProfile = (method, body) => requestPrivate("/profile", method, body);

async function loadAnswers() {
  const result = await requestPrivate("/answers", "GET");
  savedAnswers = new Map((result.answers || []).map(answer => [answer.questionId, answer]));
  skippedQuestions.clear();
  renderQuestion();
}

function renderQuestion() {
  const review = $("answered-review");
  review.replaceChildren(new Option("Continue with unanswered questions", ""));
  for (const question of questions.filter(item => savedAnswers.has(item.id))) {
    review.add(new Option(question.prompt.slice(0, 110), question.id));
  }
  review.value = editingQuestionId || "";
  const remaining = questions.filter(question => !skippedQuestions.has(question.id));
  const selection = editingQuestionId ? null : nextCompatibilityQuestion(remaining, savedAnswers.keys());
  const stored = editingQuestionId ? null : readPendingQuestion();
  const pending = stored && typeof stored.focusTier === "string" &&
    ["first10", "next50", "next100", "next250"].includes(stored.focusTier) &&
    remaining.find(item =>
    item.id === stored.questionId && !savedAnswers.has(item.id));
  currentQuestion = editingQuestionId
    ? questions.find(item => item.id === editingQuestionId) || null
    : pending || selection?.question || null;
  const focusTier = pending ? stored.focusTier : selection?.focusTier;
  if (!editingQuestionId && currentQuestion && !pending) {
    writePendingQuestion(currentQuestion.id, focusTier);
  }
  show("question-form", !!currentQuestion);
  show("question-complete", !currentQuestion && savedAnswers.size >= questions.length);
  const count = savedAnswers.size;
  $("question-progress").textContent = currentQuestion
    ? `${count} / ${questions.length} answered | ${editingQuestionId ? "Reviewing saved answer" : focusTier.replace("next", "Next ").replace("first", "First ")}`
    : `${count} / ${questions.length} answered`;
  if (!currentQuestion) {
    if (count < questions.length) $("question-progress").textContent += " | Come back to skipped questions after refreshing.";
    return;
  }
  $("question-prompt").textContent = currentQuestion.prompt;
  const own = $("question-choices");
  const acceptable = $("acceptable-choices");
  own.replaceChildren($("question-prompt"));
  acceptable.replaceChildren(acceptable.querySelector("legend"));
  currentQuestion.options.forEach((label, index) => {
    const id = currentQuestion.optionIds[index];
    const ownLabel = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio"; radio.name = "answer"; radio.value = id; radio.required = true;
    ownLabel.append(radio, document.createTextNode(label));
    own.append(ownLabel);
    const partnerLabel = document.createElement("label");
    const check = document.createElement("input");
    check.type = "checkbox"; check.name = "acceptable"; check.value = id;
    partnerLabel.append(check, document.createTextNode(label));
    acceptable.append(partnerLabel);
  });
  show("question-skip", !editingQuestionId && focusTier !== "first10");
  const previous = savedAnswers.get(currentQuestion.id);
  if (previous) {
    own.querySelectorAll('input[name="answer"]').forEach(input => { input.checked = input.value === previous.optionId; });
    acceptable.querySelectorAll('input[name="acceptable"]').forEach(input => {
      input.checked = previous.acceptableOptions.includes(input.value);
    });
  }
  $("question-importance").value = String(previous?.importance ?? 1);
  $("question-note").value = previous?.note ?? "";
  $("question-private").checked = previous?.isPrivate ?? false;
}

// OG Cupid's classic long-form profile is entirely owner-editable. The
// preview uses textContent and DOM nodes, never member-submitted HTML.
const longProfileFields = Object.freeze(["cityRegion","lookingFor","work","education","height","kids","pets","smoking","drinking","diet","languages","lifeDirection","goodAt","favorites","sixThings","fridayNight","messageMeIf"]);
const previewEssays = Object.freeze([["aboutMe","about","about-section"],["lifeDirection","life-direction","life-direction-section"],["goodAt","good-at","good-at-section"],["favorites","favorites","favorites-section"],["sixThings","six-things","six-things-section"],["fridayNight","friday-night","friday-night-section"],["messageMeIf","message-me-if","message-me-if-section"]]);
const previewDetails = Object.freeze([["Work","work"],["Education","education"],["Height","height"],["Kids","kids"],["Pets","pets"],["Smokes","smoking"],["Drinks","drinking"],["Diet","diet"],["Speaks","languages"]]);

function readProfileDraft(form = $("profile-form")) {
  const ageValue = form.elements.age.value.trim();
  const draft = {
    displayName: form.elements.displayName.value.trim(),
    aboutMe: form.elements.aboutMe.value.trim(),
    age: ageValue ? Number(ageValue) : null,
    adultConfirmed: form.elements.adultConfirmed.checked,
    gender: form.querySelector('input[name="gender"]:checked')?.value ?? "",
    // Existing private text columns are sufficient for the classic fixed choices.
    // Store stable comma-separated option values; no new schema or public access.
    orientation: [...form.querySelectorAll('input[name="interestedIn"]:checked')]
      .map(input => input.value).join(","),
    relationshipGoal: [...form.querySelectorAll('input[name="openTo"]:checked')]
      .map(input => input.value).join(","),
  };
  for (const field of longProfileFields) draft[field] = form.elements[field].value.trim();
  return draft;
}

function renderProfilePreview() {
  const draft = readProfileDraft();
  $("bio-count").textContent = String($("profile-form").elements.aboutMe.value.length);
  $("preview-display-name").textContent = draft.displayName || "Your name goes here";

  const introBits = [];
  if (Number.isInteger(draft.age) && draft.age >= 18 && draft.age <= 120) introBits.push(String(draft.age));
  if (draft.cityRegion) introBits.push(draft.cityRegion);
  $("preview-one-line").textContent = introBits.join(" · ") || "Add your age or general area.";

  const tags = $("preview-tags");
  tags.replaceChildren();
  const goalTags = draft.relationshipGoal ? draft.relationshipGoal.split(",") : [];
  for (const text of [draft.gender, ...goalTags].filter(Boolean)) {
    const tag = document.createElement("span");
    tag.textContent = text === "man" ? "Man" : text === "woman" ? "Woman" : text;
    tags.appendChild(tag);
  }

  const looking = $("preview-looking-for");
  looking.textContent = draft.lookingFor || "The kind of connection you're hoping to find.";

  const details = $("preview-details");
  details.replaceChildren();
  if (draft.orientation) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = "Interested in";
    description.textContent = draft.orientation.split(",").map(value =>
      value === "men" ? "Men" : "Women").join(", ");
    details.append(term, description);
  }
  for (const [label, field] of previewDetails) {
    if (!draft[field]) continue;
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = draft[field];
    details.append(term, description);
  }
  if (!details.childElementCount) {
    const note = document.createElement("dd");
    note.textContent = "Add a few details so people have something to ask you about.";
    details.appendChild(note);
  }

  for (const [field, targetId, sectionId] of previewEssays) {
    const value = draft[field];
    const body = $("preview-" + targetId);
    body.textContent = value || (field === "aboutMe"
      ? "Your self-summary will appear here as you write."
      : "");
    if (field !== "aboutMe") show("preview-" + sectionId, Boolean(value));
  }

  const filled = previewEssays.filter(([field]) => draft[field].length >= 40).length;
  $("profile-progress").textContent = `${filled} of 7 writing sections started (40+ characters). ` +
    (filled < 3 ? "A few real paragraphs go a long way." : "Nice. People have something to read.");
}

function showStoredProfile(profile) {
  const form = $("profile-form");
  cachedProfile = profile;
  const fallback = typeof currentUser?.name === "string"
    ? currentUser.name.trim().slice(0, 60) : "";
  form.elements.displayName.value = profile?.displayName ?? fallback;
  form.elements.aboutMe.value = profile?.aboutMe ?? "";
  form.elements.age.value = profile?.age == null ? "" : String(profile.age);
  for (const field of longProfileFields) form.elements[field].value = profile?.[field] ?? "";
  form.querySelectorAll('input[name="gender"]').forEach(input => {
    input.checked = input.value === String(profile?.gender ?? "").toLowerCase();
  });
  const interests = new Set(String(profile?.orientation ?? "").split(",").map(value => value.trim()));
  form.querySelectorAll('input[name="interestedIn"]').forEach(input => {
    input.checked = interests.has(input.value);
  });
  const openTo = new Set(String(profile?.relationshipGoal ?? "").split(",").map(value => value.trim()));
  form.querySelectorAll('input[name="openTo"]').forEach(input => {
    input.checked = openTo.has(input.value);
  });
  form.elements.adultConfirmed.checked = Boolean(profile);
  renderProfilePreview();
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
  bindEmailOptionOverrides($("signup-form"));
  bindEmailOptionOverrides($("email-settings-form"));
  populateEmailOptions($("signup-form"), necessaryEmailOnly);
  populateEmailOptions($("email-settings-form"), necessaryEmailOnly);
  $("show-signin").addEventListener("click", () => chooseAuthTab("signin"));
  $("show-signup").addEventListener("click", () => chooseAuthTab("signup"));
  $("back-to-signin").addEventListener("click", () => chooseAuthTab("signin"));
  document.querySelectorAll("[data-back-signin]").forEach(button =>
    button.addEventListener("click", () => chooseAuthTab("signin")));
  $("forgot-password").addEventListener("click", () => {
    $("reset-request-form").elements.email.value = $("signin-form").elements.email.value;
    chooseAuthTab("reset-request");
  });
  $("open-verify").addEventListener("click", () => {
    $("verify-form").elements.email.value = $("signin-form").elements.email.value;
    chooseAuthTab("verify");
    message("Enter your email and request a verification code.");
  });
  $("send-verify-code").addEventListener("click", (event) => {
    const form = $("verify-form");
    if (!form.elements.email.reportValidity()) return;
    operation(event.currentTarget, "Sending verification code", async () => {
      const email = form.elements.email.value.trim();
      const { error } = await auth.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      if (error) throw new Error(asError(error, "Could not send verification code"));
      message("Check your inbox for an OG Cupid email verification code.", "ok");
    });
  });
  $("send-another-code").addEventListener("click", () => {
    $("reset-request-form").elements.email.value = $("reset-confirm-form").elements.email.value;
    chooseAuthTab("reset-request");
  });

  $("reset-request-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    operation(form.querySelector('button[type="submit"]'), "Requesting a recovery code", async () => {
      const email = String(fields(form).email).trim();
      // Neon Managed Better Auth's documented Email OTP recovery method.
      // Some Better Auth client versions renamed this route.
      let result;
      if (typeof auth.forgetPassword?.emailOtp === "function") {
        result = await auth.forgetPassword.emailOtp({ email });
      } else if (typeof auth.emailOtp?.requestPasswordReset === "function") {
        result = await auth.emailOtp.requestPasswordReset({ email });
      } else {
        throw new Error("Password recovery isn't supported by this installed Auth client. No account was changed.");
      }
      const { error } = result;
      if (error) throw new Error(asError(error, "Could not request a recovery code."));
      $("reset-confirm-form").elements.email.value = email;
      chooseAuthTab("reset-confirm");
      message("If this email belongs to an account, a recovery code has been sent.", "ok");
    });
  });

  $("reset-confirm-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    operation(form.querySelector('button[type="submit"]'), "Updating your password", async () => {
      const input = fields(form);
      if (input.password !== input.repeat) throw new Error("The new passwords do not match.");
      if (typeof auth.emailOtp?.resetPassword !== "function") {
        throw new Error("This Auth client does not support OTP password reset.");
      }
      const { error } = await auth.emailOtp.resetPassword({
        email: String(input.email).trim(),
        otp: String(input.otp).trim(),
        password: String(input.password),
      });
      form.elements.otp.value = "";
      form.elements.password.value = "";
      form.elements.repeat.value = "";
      if (error) throw new Error(asError(error, "Password reset failed."));
      // Managed Auth is set to revoke other sessions on password reset.
      // Clear local profile details as well, even if an old session was cached.
      sessionUserId = null;
      currentUser = null;
      clearMemberView();
      renderAuthenticated(null);
      $("signin-form").elements.email.value = String(input.email).trim();
      chooseAuthTab("signin");
      message("Password updated. Please sign in using your new password.", "ok");
    });
  });

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
      stageSignupEmailOptions(email, readEmailOptions(form));
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

  $("email-settings-form").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!currentUser) {
      message("Sign in to update your email preferences.", "error");
      return;
    }
    operation(form.querySelector('button[type="submit"]'), "Saving email preferences", async () => {
      const result = await requestPrivate("/email-preferences", "PUT", readEmailOptions(form));
      populateEmailOptions(form, result.preferences || necessaryEmailOnly);
      $("email-preferences-status").textContent = "Email preferences saved to your account.";
      message("Your email choices are saved.", "ok");
    });
  });

  $("delete-account-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!accountDeletionInUi || !currentUser) {
      message("Account deletion is not available in this environment.", "error");
      return;
    }
    if (!form.reportValidity()) return;
    operation(form.querySelector('button[type="submit"]'), "Deleting your account", async () => {
      const input = fields(form);
      if (input.confirm !== "DELETE") {
        throw new Error("Type DELETE exactly to confirm.");
      }
      // Server independently verifies our signed JWT, then checks this
      // account's *current password* directly with managed Neon Auth. The
      // browser cannot submit a target user ID or access database secrets.
      const jwt = await getAccessToken();
      const endpoint = new URL(memberApiUrl);
      endpoint.pathname = "/account/delete";
      endpoint.search = "";
      const response = await fetch(endpoint.toString(), {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + jwt,
          "Content-Type": "application/json",
        },
        credentials: "omit",
        cache: "no-store",
        body: JSON.stringify({
          email: currentUser.email,
          password: String(input.password),
          confirm: "DELETE",
        }),
      });
      form.elements.password.value = "";
      form.elements.confirm.value = "";
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.deleted !== true) {
        throw new Error(result.error || "Deletion was not completed (HTTP " + response.status + ").");
      }
      // Once its user row is gone, managed Auth may reject signOut because the
      // session was cascaded already. Best-effort cookie cleanup only.
      try { await auth.signOut(); } catch { /* Already deleted */ }
      sessionUserId = null;
      currentUser = null;
      clearMemberView();
      renderAuthenticated(null);
      chooseAuthTab("signin");
      message("Your account and linked private profile were deleted. Database backups expire according to their retention schedule.", "ok");
    });
  });

  $("profile-form").addEventListener("input", renderProfilePreview);
  $("profile-form").addEventListener("change", renderProfilePreview);

  $("profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    operation(form.querySelector('button[type="submit"]'), "Saving your profile", async () => {
      const draft = readProfileDraft(form);
      if (!draft.adultConfirmed) throw new Error("You must confirm that you are at least 18.");
      const result = await requestProfile("PUT", draft);
      showStoredProfile(result.profile);
      message("Your profile has been saved privately to PostgreSQL.", "ok");
    });
  });

  $("question-skip").addEventListener("click", () => {
    if (!currentQuestion) return;
    skippedQuestions.add(currentQuestion.id);
    clearPendingQuestion();
    renderQuestion();
  });
  $("answered-review").addEventListener("change", event => {
    editingQuestionId = event.currentTarget.value || null;
    renderQuestion();
  });
  $("question-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!currentQuestion || !form.reportValidity()) return;
    const question = currentQuestion;
    const own = form.querySelector('input[name="answer"]:checked');
    if (!own) return;
    const accepted = [...form.querySelectorAll('input[name="acceptable"]:checked')].map(input => input.value);
    if (!accepted.length) {
      message("Select at least one answer you would accept from someone else.", "error");
      return;
    }
    operation(form.querySelector('button[type="submit"]'), "Saving your answer", async () => {
      const answer = {
        questionId: question.id,
        optionId: own.value,
        acceptableOptions: accepted,
        importance: Number($("question-importance").value),
        isPrivate: $("question-private").checked,
        note: $("question-note").value.trim(),
      };
      await requestPrivate("/answers", "PUT", answer);
      savedAnswers.set(question.id, answer);
      if (!editingQuestionId) clearPendingQuestion();
      editingQuestionId = null;
      renderQuestion();
      message("Answer saved privately to your account.", "ok");
    });
  });
}

async function start() {
  if (local) {
    $("environment-label").textContent = "DEVELOPMENT ONLY";
    document.title = "DEV | OG Cupid Member Accounts";
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
      : (registrationOpenInUi ? "Sign in or create your OG Cupid account." : "Sign in to your OG Cupid account."), "ok");
  } catch {
    message("Couldn't check your session. Try signing in again.", "error");
  }
}

start();

