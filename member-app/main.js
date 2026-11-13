import { createAuthClient } from "@neon/auth";
import { nextCompatibilityQuestion } from "./question-flow.js";
import { displayQuestionProgress, acceptedAnswerSuggestion } from "./question-presentation.js";
import { memberHomeState } from "./home-dashboard.js";
import { SIGNUP_WELCOME_HASH, memberSectionFromHash, welcomeQuestionStatus } from "./welcome-flow.js";
import { createLocalityPicker } from "./locality-picker.js";
import { createPhotoUI } from "./photo-uploads.js";
import { createProfilePhotoGallery } from "./profile-photo-gallery.js";
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
let homeCityPicker = null;
let photoUI = null;
let profileGallery = null;
let savedPhotoCount = 0;
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
  homeCityPicker?.clear();
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
  photoUI?.reset();
  savedPhotoCount = 0;
}

function renderHomework() {
  const state = memberHomeState({
    profileSaved: Boolean(cachedProfile?.updatedAt),
    photoCount: savedPhotoCount,
    answeredCount: savedAnswers.size,
  });
  $("homework-photos-state").textContent = state.hasPhoto
    ? "✓ " + state.photoCount + (state.photoCount === 1 ? " photo added" : " photos added")
    : "No photos yet";
  $("homework-photos").classList.toggle("is-complete",state.hasPhoto);
  $("homework-profile-state").textContent = state.hasProfile ? "✓ Profile saved" : "Start here";
  $("homework-profile").classList.toggle("is-complete",state.hasProfile);
  $("homework-questions-state").textContent = welcomeQuestionStatus(state.answeredCount);
  // Do not mark the combined quiz + questions step complete: persona-quiz
  // completion has no authenticated persistence yet.
  $("homework-questions").classList.remove("is-complete");
  $("homework-next").textContent = !state.hasProfile
    ? "First up: fill out your profile basics."
    : !state.hasPhoto
      ? "Profile saved. Next, add a photo."
      : state.answeredCount === 0
        ? "Looking good. Try the Dating Persona Quiz and answer some match questions."
        : "Keep answering questions, explore the site, and have fun.";
  $("dashboard-member-name").textContent =
    String(cachedProfile?.displayName || currentUser?.name || "friend").slice(0, 60);
  $("dashboard-question-count").textContent = String(state.answeredCount);
  $("dashboard-question-label").textContent =
    state.answeredCount === 1 ? "question answered" : "questions answered";
  $("dashboard-homework-count").textContent = welcomeQuestionStatus(state.answeredCount);
  const page = $("member-columns").dataset.memberPage;
  const onHome = Boolean(currentUser && page === "home");
  const onWelcome = Boolean(currentUser && (page === "welcome" || (onHome && !state.showRegularHome)));
  // The semi-walled onboarding layout is scoped to this view only. Other
  // member views keep their normal navigation, account settings and layout.
  document.body.classList.toggle("is-welcome-flow", onWelcome);
  $("welcome-side-profile-status").textContent =
    state.hasProfile ? "Profile basics saved" : "Profile basics not saved yet";
  $("welcome-side-photos-status").textContent = state.hasPhoto
    ? state.photoCount + (state.photoCount === 1 ? " photo added" : " photos added")
    : "No photos yet";
  $("welcome-side-questions-status").textContent = welcomeQuestionStatus(state.answeredCount);
  show("welcome-side-panel", onWelcome);
  show("member-home-dashboard", onHome && state.showRegularHome);
  show("homework-dashboard", onWelcome);
  // The quiz is already a visible action in welcome step three.
  show("member-persona-panel", false);
}

function renderMemberPage() {
  if (!currentUser) {
    document.body.classList.remove("is-welcome-flow");
    show("welcome-side-panel", false);
    show("homework-dashboard", false);
    show("member-home-dashboard", false);
    show("member-view", false);
    show("profile-panel", true);
    show("photo-panel", false);
    show("questions-panel", true);
    show("profile-preview-panel", false);
    show("member-persona-panel", false);
    return;
  }
  const page = memberSectionFromHash(window.location.hash);
  const home = page === "home";
  show("member-view", page === "settings");
  show("profile-panel", page === "profile");
  show("profile-preview-panel", page === "profile");
  show("photo-panel", page === "photos");
  show("questions-panel", page === "questions");
  $("member-columns").dataset.memberPage = page;
  document.querySelectorAll(".classic-member-tabs a[href^='#']").forEach(link => {
    if ((link.hash === "#member-title" && home) ||
        (link.hash === SIGNUP_WELCOME_HASH && page === "welcome") ||
        (link.hash === "#profile-title" && page === "profile") ||
        (link.hash === "#photos-title" && page === "photos") ||
        (link.hash === "#question-title" && page === "questions") ||
        (link.hash === "#settings-title" && page === "settings")) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
  renderHomework();
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
  // The classic sidebar is real account navigation, not a demo profile.
  $("classic-rail-member").hidden = !authenticated;
  $("classic-rail-guest").hidden = authenticated;
  $("classic-rail-progress-section").hidden = !authenticated;
  document.querySelectorAll("[data-classic-auth]").forEach(link => {
    link.hidden = !authenticated;
  });
  $("classic-member-greeting").textContent = authenticated
    ? "Hi, " + String(member.name || "member").slice(0, 60)
    : "Welcome to OG Cupid";
  if (!member) {
    renderMemberPage();
    return;
  }
  $("classic-rail-member-name").textContent = member.name || "OG Cupid member";
  $("member-welcome").textContent = member.name || "OG Cupid member";
  $("member-email").textContent = member.email || "";
  if (!cachedProfile && !$("profile-name").value.trim()) {
    $("profile-name").value =
      typeof member.name === "string" ? member.name.trim().slice(0, 60) : "";
  }
  renderMemberPage();
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
    try { await photoUI?.load(member.id); }
    catch { message("Photo album temporarily unavailable.", "error"); }
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

async function requestProfileImage(path) {
  const token=await getAccessToken();
  const url=new URL(memberApiUrl);
  url.pathname=path;
  const res=await fetch(url.toString(),{
    method:"GET",
    headers:{Authorization:"Bearer "+token},
    cache:"no-store",credentials:"omit",
  });
  if(!res.ok) throw new Error("Photo couldn't be retrieved");
  if(!(res.headers.get("content-type")||"").startsWith("image/jpeg")) {
    throw new Error("Photo server returned an unexpected format");
  }
  const blob=await res.blob();
  if(blob.size>2_500_000) throw new Error("Photo exceeded size limit");
  return blob;
}
async function uploadProfileJpeg(blob) {
  const token=await getAccessToken();
  const url=new URL(memberApiUrl);
  url.pathname="/photos";
  const res=await fetch(url.toString(),{
    method:"POST",
    headers:{"Authorization":"Bearer "+token,"Content-Type":"image/jpeg"},
    body:blob,cache:"no-store",credentials:"omit",
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||"Upload wasn't saved");
  return data;
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
  renderHomework();
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
  const count = savedAnswers.size;
  show("question-complete", !currentQuestion && count >= questions.length);
  show("question-pause", !currentQuestion && count < questions.length);
  show("question-answer-error", false);
  const progress = displayQuestionProgress(count);
  $("question-progress").textContent = progress.label;
  if (!currentQuestion) return;
  $("question-prompt").textContent = currentQuestion.prompt;
  const own = $("question-choices");
  const acceptable = $("acceptable-choices");
  own.replaceChildren($("question-prompt"));
  acceptable.replaceChildren(acceptable.querySelector("legend"), $("acceptable-hint"));
  currentQuestion.options.forEach((label, index) => {
    const id = currentQuestion.optionIds[index];
    const ownLabel = document.createElement("label");
    ownLabel.className = "classic-question-choice";
    const radio = document.createElement("input");
    radio.type = "radio"; radio.name = "answer"; radio.value = id; radio.required = true;
    const ownText = document.createElement("span");
    ownText.textContent = label;
    ownLabel.append(radio, ownText);
    own.append(ownLabel);
    const partnerLabel = document.createElement("label");
    partnerLabel.className = "classic-question-choice";
    const check = document.createElement("input");
    check.type = "checkbox"; check.name = "acceptable"; check.value = id;
    const partnerText = document.createElement("span");
    partnerText.textContent = label;
    partnerLabel.append(check, partnerText);
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
  const importance = String(previous?.importance ?? 1);
  document.querySelectorAll('input[name="importance"]').forEach(input => {
    input.checked = input.value === importance;
  });
  $("question-note").value = previous?.note ?? "";
  $("question-private").checked = previous?.isPrivate ?? false;
}

// OG Cupid's classic long-form profile is entirely owner-editable. The
// preview uses textContent and DOM nodes, never member-submitted HTML.
const longProfileFields = Object.freeze(["cityRegion","work","education","height","kids","pets","smoking","drinking","diet","ethnicity","bodyType","vaping","drugs","religion","sign","income","status","relationshipType","lifeDirection","goodAt","favorites","sixThings","fridayNight","messageMeIf"]);
const previewEssays = Object.freeze([["aboutMe","about","about-section"],["lifeDirection","life-direction","life-direction-section"],["goodAt","good-at","good-at-section"],["favorites","favorites","favorites-section"],["sixThings","six-things","six-things-section"],["fridayNight","friday-night","friday-night-section"],["messageMeIf","message-me-if","message-me-if-section"]]);
const previewDetails = Object.freeze([["Orientation","orientation"],["Ethnicity","ethnicity"],["Height","height"],["Body Type","bodyType"],["Diet","diet"],["Smokes","smoking"],["Vapes","vaping"],["Drinks","drinking"],["Drugs","drugs"],["Religion","religion"],["Sign","sign"],["Education","education"],["Job","work"],["Income","income"],["Status","status"],["Type","relationshipType"],["Offspring","kids"],["Pets","pets"],["Speaks","languages"]]);

const selectedValues = element => element ? [...element.selectedOptions].map(option => option.value).join(", ") : "";
const qualified = (value, checked, suffix = "Strictly") => value ? (checked ? `${suffix} ${value}` : value) : "";
const readLanguages = form => [1, 2, 3].flatMap(index => {
  const name = form.elements[`languageName${index}`].value;
  const level = form.elements[`languageLevel${index}`].value;
  return name && level ? [`${name} (${level})`] : [];
}).join(", ");

function restoreLanguages(form, value) {
  for (const index of [1, 2, 3]) {
    form.elements[`languageName${index}`].value = "";
    form.elements[`languageLevel${index}`].value = "";
  }
  String(value ?? "").split(", ").slice(0, 3).forEach((entry, offset) => {
    const match = /^(.*) \((Fluently|Okay|Poorly)\)$/.exec(entry);
    if (!match) return;
    const index = offset + 1;
    if ([...form.elements[`languageName${index}`].options].some(option => option.value === match[1])) {
      form.elements[`languageName${index}`].value = match[1];
      form.elements[`languageLevel${index}`].value = match[2];
    }
  });
}

function restoreQualifiedChoice(form, field, checkbox, value, prefix) {
  const text = String(value ?? "");
  const isQualified = text.startsWith(prefix);
  form.elements[field].value = isQualified ? text.slice(prefix.length) : text;
  form.elements[checkbox].checked = isQualified;
}

function restorePairedChoice(form, field, qualifier, value) {
  const [choice, ...rest] = String(value ?? "").split(", ");
  form.elements[field].value = choice || "";
  form.elements[qualifier].value = rest.join(", ");
}

function updateOffspringOptions() {
  const form = $("profile-form");
  const more = form.elements.kids.value === "Has kids" ? " more" : "";
  const select = form.elements.wantsKids;
  const previous = select.selectedIndex;
  select.replaceChildren(new Option("Wants kids?", ""),
    ...[`Wants${more} kids`, `Doesn't want${more} kids`, `Might want${more} kids`].map(text => new Option(text, text)));
  select.selectedIndex = Math.max(0, previous);
}

function readProfileDraft(form = $("profile-form")) {
  const ageValue = form.elements.age.value.trim();
  const draft = {
    displayName: form.elements.displayName.value.trim(),
    aboutMe: form.elements.aboutMe.value.trim(),
    age: ageValue ? Number(ageValue) : null,
    locality: homeCityPicker?.current() ?? null,
    // Search starts from the broad location already chosen in Basics. There
    // is intentionally no separate place picker or GeoNames terminology.
    searchOrigin: homeCityPicker?.current() ?? null,
    searchRadiusMiles: form.elements.searchRadiusMiles.value === "" ? null : Number(form.elements.searchRadiusMiles.value),
    gender: form.querySelector('input[name="gender"]:checked')?.value ?? "",
    // Existing private text columns are sufficient for the classic fixed choices.
    // Store stable comma-separated option values; no new schema or public access.
    orientation: form.elements.orientation.value,
    interestedIn: [...form.querySelectorAll('input[name="interestedIn"]:checked')].map(input => input.value).join(", "),
    relationshipGoal: [...form.querySelectorAll('input[name="openTo"]:checked')].map(input => input.value).join(", "),
    pronouns: cachedProfile?.pronouns ?? "",
  };
  for (const field of longProfileFields) draft[field] = form.elements[field].value.trim();
  draft.ethnicity = selectedValues(form.elements.ethnicity);
  draft.pets = selectedValues(form.elements.pets);
  draft.diet = qualified(draft.diet, form.elements.dietStrict.checked);
  draft.education = qualified(draft.education, form.elements.educationWorkingOn.checked, "Working on");
  draft.relationshipType = qualified(draft.relationshipType, form.elements.relationshipStrict.checked);
  draft.religion = [draft.religion, form.elements.religionImportance.value].filter(Boolean).join(", ");
  draft.sign = [draft.sign, form.elements.signImportance.value].filter(Boolean).join(", ");
  draft.kids = [draft.kids, form.elements.wantsKids.value].filter(Boolean).join(", ");
  draft.languages = readLanguages(form);
  return draft;
}

function updateClassicRailProgress() {
  // Count genuine draft details, never a fictitious 72% completion.
  const form = $("profile-form");
  const data = new FormData(form);
  const exists = name => String(data.get(name) || "").trim().length > 0;
  const essay = ["lifeDirection", "goodAt", "favorites", "sixThings", "fridayNight", "messageMeIf"]
    .some(exists);
  const completed = [
    exists("displayName"), exists("aboutMe"), exists("age"), exists("cityRegion"),
    exists("gender"), data.getAll("interestedIn").length > 0,
    data.getAll("openTo").length > 0, essay,
  ].filter(Boolean).length;
  const percentage = Math.round(completed / 8 * 100);
  $("classic-rail-progress-fill").style.width = percentage + "%";
  $("classic-rail-progress-label").textContent = completed + " of 8 starting details";
}

function renderProfilePreview() {
  updateClassicRailProgress();
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

  const details = $("preview-details");
  details.replaceChildren();
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
  photoUI?.setProfileReady(Boolean(profile));
  renderHomework();
  const fallback = typeof currentUser?.name === "string"
    ? currentUser.name.trim().slice(0, 60) : "";
  form.elements.displayName.value = profile?.displayName ?? fallback;
  const setValue = (name, value) => { if (form.elements[name]) form.elements[name].value = value ?? ""; };
  form.elements.aboutMe.value = profile?.aboutMe ?? "";
  form.elements.age.value = profile?.age == null ? "" : String(profile.age);
  for (const field of longProfileFields) form.elements[field].value = profile?.[field] ?? "";
  restoreLanguages(form, profile?.languages);
  restoreQualifiedChoice(form, "diet", "dietStrict", profile?.diet, "Strictly ");
  restoreQualifiedChoice(form, "education", "educationWorkingOn", profile?.education, "Working on ");
  restoreQualifiedChoice(form, "relationshipType", "relationshipStrict", profile?.relationshipType, "Strictly ");
  restorePairedChoice(form, "religion", "religionImportance", profile?.religion);
  restorePairedChoice(form, "sign", "signImportance", profile?.sign);
  restorePairedChoice(form, "kids", "wantsKids", profile?.kids);
  updateOffspringOptions();
  form.elements.wantsKids.value = String(profile?.kids ?? "").split(", ")[1] || "";
  homeCityPicker?.restore(profile?.localityId, profile?.localityKey, profile?.cityRegion || "");
  form.elements.searchRadiusMiles.value = profile?.searchRadiusMiles == null ? "" : String(profile.searchRadiusMiles);
  form.querySelectorAll('input[name="gender"]').forEach(input => {
    input.checked = input.value === String(profile?.gender ?? "").toLowerCase();
  });
  form.querySelectorAll('input[name="openTo"]').forEach(input => {
    input.checked = String(profile?.relationshipGoal ?? "").split(", ").includes(input.value);
  });
  form.querySelectorAll('input[name="interestedIn"]').forEach(input => {
    input.checked = String(profile?.interestedIn ?? "").split(", ").includes(input.value);
  });
  setValue("orientation", profile?.orientation);
  setValue("ethnicity", "");
  for (const value of String(profile?.ethnicity ?? "").split(", ")) {
    const option = [...form.elements.ethnicity.options].find(item => item.value === value); if (option) option.selected = true;
  }
  setValue("bodyType", profile?.bodyType);
  setValue("vaping", profile?.vaping); setValue("drugs", profile?.drugs);
  setValue("income", profile?.income); setValue("status", profile?.status);
  for (const value of String(profile?.pets ?? "").split(", ")) { const option = [...form.elements.pets.options].find(item => item.value === value); if (option) option.selected = true; }
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
  $("profile-kids").addEventListener("change", updateOffspringOptions);
  updateOffspringOptions();
  const age = $("profile-age");
  for (let value = 18; value <= 120; value += 1) age.add(new Option(String(value), String(value)));
  const height = $("profile-height");
  for (let inches = 48; inches <= 84; inches += 1) {
    const feet = Math.floor(inches / 12), remaining = inches % 12, cm = Math.round(inches * 2.54);
    height.add(new Option(`${feet}' ${remaining}\" (${cm} cm)`, `${feet}' ${remaining}\" (${cm} cm)`));
  }
  homeCityPicker = createLocalityPicker($("profile-city-region"), $("profile-city-options"), $("profile-city-hint"), renderProfilePreview);
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
      // Remember the welcome destination through email verification, even
      // if the new account is not signed in until a separate login.
      if (window.location.hash !== SIGNUP_WELCOME_HASH) window.location.hash = SIGNUP_WELCOME_HASH;
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
      // A completed new signup must never land in Account Settings.
      if (window.location.hash !== SIGNUP_WELCOME_HASH) window.location.hash = SIGNUP_WELCOME_HASH;
      else if (member) renderMemberPage();
      message(member
        ? "Email verified! Start with your profile basics."
        : "Email verified. Sign in to see your getting-started page.", "ok");
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
      // Old free-text places are kept unchanged until the owner selects a
      // canonical town. Newly entered places must come from the lookup.
      if (draft.cityRegion && !draft.locality &&
          draft.cityRegion !== String(cachedProfile?.cityRegion ?? "").trim()) {
        throw new Error("Choose your city or town from the search results.");
      }
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
  $("question-choices").addEventListener("change", event => {
    const input = event.target;
    if (!input?.matches?.('input[name="answer"]')) return;
    const acceptable = $("acceptable-choices");
    const accepted = [...acceptable.querySelectorAll('input[name="acceptable"]:checked')].map(option => option.value);
    const suggested = acceptedAnswerSuggestion(input.value, accepted);
    if (suggested) {
      const sameAnswer = [...acceptable.querySelectorAll('input[name="acceptable"]')]
        .find(option => option.value === suggested);
      if (sameAnswer) sameAnswer.checked = true;
    }
    show("question-answer-error", false);
  });
  $("acceptable-choices").addEventListener("change", () => {
    show("question-answer-error", false);
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
      $("question-answer-error").textContent = "Choose at least one answer you'd accept from a match.";
      show("question-answer-error", true);
      $("acceptable-choices").scrollIntoView({ block: "center", behavior: "auto" });
      return;
    }
    show("question-answer-error", false);
    operation(form.querySelector('button[type="submit"]'), "Saving your answer", async () => {
      const answer = {
        questionId: question.id,
        optionId: own.value,
        acceptableOptions: accepted,
        importance: Number(form.querySelector('input[name="importance"]:checked')?.value ?? 1),
        isPrivate: $("question-private").checked,
        note: $("question-note").value.trim(),
      };
      await requestPrivate("/answers", "PUT", answer);
      savedAnswers.set(question.id, answer);
      renderHomework();
      if (!editingQuestionId) clearPendingQuestion();
      editingQuestionId = null;
      renderQuestion();
      $("question-prompt").scrollIntoView({ block: "start", behavior: "auto" });
      message("Answer saved to your account.", "ok");
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
  profileGallery = createProfilePhotoGallery({
    primaryButton: $("preview-primary-photo"),
    thumbnailStrip: $("preview-photo-thumbnails"),
    dialog: $("profile-photo-viewer"),
    image: $("profile-photo-viewer-image"),
    counter: $("profile-photo-viewer-count"),
    previousButton: $("profile-photo-viewer-prev"),
    nextButton: $("profile-photo-viewer-next"),
    closeButton: $("profile-photo-viewer-close"),
  });
  photoUI = createPhotoUI({
    requestJson: (method,path,body) => requestPrivate(path,method,body),
    requestImage: requestProfileImage,
    uploadJpeg: uploadProfileJpeg,
    onPhotosChanged: (count, photos) => {
      savedPhotoCount = count;
      profileGallery?.setPhotos(photos);
      renderHomework();
    },
  });
  wireForms();
  window.addEventListener("hashchange", () => {
    renderMemberPage();
    if (currentUser) window.scrollTo({ top: 0, behavior: "instant" });
  });
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

