/* OG Cupid members-only, display-name URL profile.
 * Authentication is revalidated by Neon Auth and every private API request
 * uses a verified JWT. All profile text is inserted via textContent.
 */
(() => {
  "use strict";

  const AUTH = "https://ep-hidden-breeze-bbdn5nsb.neonauth.c-15.us-east-1.aws.neon.tech/neondb/auth";
  const API = "https://br-plain-unit-bbcbxpqq-members.compute.c-15.us-east-1.aws.neon.tech";
  const path = window.location.pathname;
  const parsed = /^\/profiles\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(path);
  const querySlug = new URLSearchParams(window.location.search).get("u");
  const slug = parsed ? parsed[1] : /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(querySlug || "") ? querySlug : null;
  const el = id => document.getElementById(id);
  const renderMessage = text => { el("loading").textContent = text; };
  const noAccess = () => window.location.replace("/");
  const ownerFields = [
    "aboutMe","age","cityRegion","gender","pronouns","orientation",
    "interestedIn","relationshipGoal","work","education","height",
    "kids","pets","smoking","drinking","diet","languages","ethnicity",
    "bodyType","vaping","drugs","religion","sign","income","status",
    "relationshipType","lifeDirection","goodAt","favorites","sixThings",
    "fridayNight","messageMeIf"
  ];
  const essays = [
    ["aboutMe","My self-summary",5000],
    ["lifeDirection","What I'm doing with my life",2000],
    ["goodAt","I'm really good at",1500],
    ["favorites","Favorite books, movies, shows, music and food",2000],
    ["sixThings","Six things I could never do without",1500],
    ["fridayNight","On a typical Friday night I am",1500],
    ["messageMeIf","You should message me if",1500]
  ];
  const facts = [
    ["Orientation","orientation"],["Ethnicity","ethnicity"],["Height","height"],
    ["Body Type","bodyType"],["Diet","diet"],["Smokes","smoking"],
    ["Vapes","vaping"],["Drinks","drinking"],["Drugs","drugs"],
    ["Religion","religion"],["Sign","sign"],["Education","education"],
    ["Job","work"],["Income","income"],["Status","status"],
    ["Type","relationshipType"],["Offspring","kids"],["Pets","pets"],
    ["Speaks","languages"],["Pronouns","pronouns"]
  ];
  const selectChoices = {
    bodyType:["","Thin","Athletic","Average","Jacked","Chubby","Overweight"],
    vaping:["","Never","Sometimes","Often","Just weed","Just weed · Sometimes","Just weed · Often","Just weed · Never"],
    drugs:["","Never","Sometimes","Often","Just weed","Just weed · Sometimes","Just weed · Often","Just weed · Never"],
    income:["","Broke","Pocket money","Fuck you money"],
    status:["","Single","Seeing someone","Married"],
    relationshipType:["","Monogamous","Polyamorous"]
  };
  const maxLength = {
    aboutMe:5000,lifeDirection:2000,goodAt:1500,favorites:2000,
    sixThings:1500,fridayNight:1500,messageMeIf:1500,
    interestedIn:120,relationshipGoal:100,work:160,education:120,
    height:50,kids:80,pets:80,smoking:60,drinking:60,diet:100,
    languages:160,ethnicity:200,bodyType:30,vaping:30,drugs:30,
    religion:160,sign:100,income:30,status:30,relationshipType:50,
    orientation:60,pronouns:40
  };

  let token = null;
  let profile = null;
  let isOwner = false;
  let publicAnswers = [];
  let personaCode = null;
  let photos = [];
  let photoUrls = [];
  let editing = null;
  let pendingImage = null;
  let busy = false;

  function node(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = String(text);
    return n;
  }
  function pencil(field, title) {
    const button = node("button","edit-pencil","✎");
    button.type = "button";
    button.setAttribute("aria-label","Edit " + title);
    button.title = "Edit " + title;
    button.addEventListener("click", () => startEdit(field,title));
    return button;
  }
  async function authToken() {
    const response = await fetch(AUTH + "/token", {
      method:"GET",credentials:"include",cache:"no-store",
      headers:{Accept:"application/json"}
    });
    if (!response.ok) throw new Error("No valid account session");
    const data = await response.json();
    const jwt = data?.token || data?.data?.token;
    if (typeof jwt !== "string" || jwt.split(".").length !== 3) {
      throw new Error("Missing member authentication");
    }
    return jwt;
  }
  async function request(pathname,method="GET",body=null,kind="json") {
    const requestOnce = () => fetch(API + pathname, {
      method,cache:"no-store",credentials:"omit",
      headers:{
        Authorization:"Bearer " + token,
        ...(kind==="image" ? {} : body instanceof Blob
          ? {"Content-Type":"image/jpeg"} : body ? {"Content-Type":"application/json"} : {})
      },
      ...(body ? {body:body instanceof Blob ? body : JSON.stringify(body)} : {})
    });
    let response = await requestOnce();
    if (response.status === 401) {
      try { token = await authToken(); } catch { noAccess(); throw new Error("Session expired"); }
      response = await requestOnce();
    }
    if (response.status === 401 || response.status === 403) {
      noAccess();
      throw new Error("Membership is required");
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const failure = new Error(error.error || "Request failed");
      failure.status = response.status;
      throw failure;
    }
    if (kind === "image") {
      if (!(response.headers.get("content-type") || "").startsWith("image/jpeg")) {
        throw new Error("Photo data was not a JPEG");
      }
      const blob = await response.blob();
      if (blob.size > 2500000) throw new Error("Photo is too large");
      return blob;
    }
    return response.json();
  }
  async function verifyMember() {
    const response = await fetch(AUTH + "/get-session", {
      method:"GET",credentials:"include",cache:"no-store",
      headers:{Accept:"application/json"}
    });
    if (!response.ok) return false;
    const result = await response.json();
    const data = result?.data || result;
    return Boolean(data?.user?.id && data?.session);
  }

  function setTab(name,updateHash=true) {
    const names = ["about","photos","questions","personality"];
    if (!names.includes(name)) name = "about";
    for (const tabName of names) {
      const active = tabName === name;
      el("panel-"+tabName).hidden = !active;
      el("tab-"+tabName).setAttribute("aria-selected",String(active));
      el("tab-"+tabName).tabIndex = active ? 0 : -1;
    }
    if (updateHash) history.replaceState(null,"",path + (name === "about" ? "" : "#" + name));
  }
  function renderHeader() {
    el("display-name").textContent = profile.displayName || "Member";
    const sub = [
      Number.isInteger(profile.age) ? String(profile.age) : "",
      profile.cityRegion || "",
      profile.gender || ""
    ].filter(Boolean);
    el("member-summary").textContent = sub.join(" · ");
    el("owner-note").hidden = !isOwner;
    document.title = (profile.displayName || "Member") + " | OG Cupid";
  }
  function renderAbout() {
    const list = el("profile-essays");
    list.replaceChildren();
    for (const [field,title] of essays) {
      const value = String(profile[field] || "");
      if (!value && !isOwner && field !== "aboutMe") continue;
      const section = node("section","profile-essay");
      const heading = node("h2",null,title);
      if (isOwner) heading.append(pencil(field,title));
      const paragraph = node("p",value ? "" : "empty",value || (isOwner ? "Click the pencil to add this section." : "Nothing written yet."));
      section.append(heading,paragraph);
      list.append(section);
    }
    const looking = el("looking-list");
    looking.replaceChildren();
    const lookingFacts = [
      ["Interested in",profile.interestedIn],
      ["Open to",profile.relationshipGoal],
      ["Looking for",profile.lookingFor]
    ].filter(([,value]) => String(value || "").trim());
    for (const [title,value] of lookingFacts) looking.append(node("li",null,title + " " + value));
    if (!lookingFacts.length) looking.append(node("li","muted","Not specified."));
    const lookingEdit = el("looking-edit");
    lookingEdit.replaceChildren();
    if (isOwner) lookingEdit.append(pencil("interestedIn","who you are interested in"),pencil("relationshipGoal","what you are open to"));

    const rows = el("profile-facts");
    rows.replaceChildren();
    for (const [title,field] of facts) {
      const value = String(profile[field] || "");
      if (!value && !isOwner) continue;
      const wrap = node("div","fact-row");
      const term = node("dt",null,title);
      const description = node("dd",value ? "" : "muted",value || "Not filled in");
      // Core identity is kept in the onboarding identity editor, not changed by
      // free-form profile fields that could desynchronize signup claims.
      if (isOwner && !["orientation"].includes(field)) description.append(pencil(field,title));
      wrap.append(term,description);
      rows.append(wrap);
    }
  }
  function renderQuestions() {
    const list = el("question-list");
    list.replaceChildren();
    const catalog = new Map((window.OGCQuestionBank?.questions || []).map(q => [q.id,q]));
    for (const answer of publicAnswers) {
      const question = catalog.get(answer.questionId);
      if (!question) continue;
      const optionIndex = question.optionIds.indexOf(answer.optionId);
      if (optionIndex < 0) continue;
      const item = node("li");
      item.append(node("strong",null,question.prompt),
        node("span",null,"Answer: " + question.options[optionIndex]));
      list.append(item);
    }
    if (!list.childElementCount) list.append(node("li","muted","No public answers to display yet."));
    el("answer-more").hidden = !isOwner;
  }
  function renderPersona() {
    const target = el("persona-result");
    target.replaceChildren();
    if (personaCode) {
      target.append(node("p","persona-code",personaCode),
        node("p",null,"This member has completed the Dating Persona Test."));
    } else {
      target.append(node("p","muted","No completed Dating Persona Test is available."));
    }
    el("persona-link").hidden = !isOwner;
  }
  function clearPhotoUrls() {
    for (const url of photoUrls) URL.revokeObjectURL(url);
    photoUrls = [];
  }
  async function loadPhotos() {
    clearPhotoUrls();
    photos = [];
    el("photo-grid").replaceChildren();
    const data = await request("/photos/member/" + encodeURIComponent(profile.userId));
    const all = Array.isArray(data.photos) ? data.photos : [];
    for (const meta of all.slice(0,5)) {
      const jpeg = await request("/photos/" + encodeURIComponent(meta.id) + "/bytes","GET",null,"image");
      const url = URL.createObjectURL(jpeg);
      photoUrls.push(url);
      photos.push({...meta,url});
    }
    renderPhotos();
  }
  function renderPhotos() {
    const avatar = el("profile-avatar");
    avatar.replaceChildren();
    const main = photos.find(item => item.isPrimary) || photos[0];
    if (main) {
      const picture = node("img");
      picture.src = main.url;
      picture.alt = "Primary photo of " + profile.displayName;
      avatar.append(picture);
    } else avatar.append(node("span","avatar-empty","♥"));
    if (isOwner) {
      const edit = pencil("photos","photos");
      edit.style.position = "absolute";
      edit.style.right = "6px";
      edit.style.bottom = "7px";
      edit.style.background = "#ffffffdd";
      avatar.append(edit);
    }
    const grid = el("photo-grid");
    grid.replaceChildren();
    for (const entry of photos) {
      const card = node("article","photo-card");
      const img = node("img");
      img.src = entry.url;
      img.alt = entry.isPrimary ? "Main profile picture" : "Member photo";
      img.loading = "lazy";
      const caption = node("div","photo-caption");
      caption.append(node("span",null,entry.isPrimary ? "Main picture" : "Photo"));
      if (isOwner) {
        if (!entry.isPrimary) {
          const primary = node("button",null,"Make primary");
          primary.type = "button";
          primary.addEventListener("click",() => photoAction("/photos/" + entry.id + "/primary","POST"));
          caption.append(primary);
        }
        const del = node("button",null,"Remove");
        del.type = "button";
        del.addEventListener("click",() => {
          if (confirm("Remove this photo from your profile?")) photoAction("/photos/" + entry.id,"DELETE");
        });
        caption.append(del);
      }
      card.append(img,caption);grid.append(card);
    }
    if (!grid.childElementCount) grid.append(node("p","muted",isOwner ? "Add a picture to introduce yourself." : "No profile pictures yet."));
    el("add-photo").hidden = !isOwner || photos.length >= 5;
    el("photo-message").textContent = photos.length + " of 5 photos";
  }
  async function photoAction(uri,method) {
    if (!isOwner || busy) return;
    busy = true;
    el("photo-message").textContent = "Updating your photos…";
    try { await request(uri,method); await loadPhotos(); }
    catch(error) {el("photo-message").textContent = error.message || "Photo couldn't be updated";}
    finally {busy = false}
  }
  function startEdit(field,label) {
    if (!isOwner) return;
    if (field === "photos") { setTab("photos"); if (photos.length < 5) el("add-photo").focus(); return; }
    editing = field;
    el("edit-title").textContent = "Edit " + label;
    el("edit-label").textContent = label;
    el("edit-error").textContent = "";
    const textarea = el("edit-value"),select = el("edit-select");
    textarea.hidden = false;select.hidden = true;
    if (selectChoices[field]) {
      select.replaceChildren();
      for(const value of selectChoices[field]) {
        const option = node("option",null,value || "Not specified");
        option.value = value;
        select.append(option);
      }
      if (!selectChoices[field].includes(String(profile[field] || ""))) {
        const legacy = node("option",null,String(profile[field] || ""));
        legacy.value = String(profile[field] || "");
        select.append(legacy);
      }
      select.value = String(profile[field] || "");
      select.hidden = false;textarea.hidden = true;
    } else {
      textarea.maxLength = maxLength[field] || 2000;
      textarea.value = String(profile[field] || "");
      textarea.rows = (field === "aboutMe" || essays.some(row => row[0]===field)) ? 8 : 3;
    }
    el("edit-dialog").showModal();
    (select.hidden ? textarea : select).focus();
  }
  async function saveEdit(event) {
    event.preventDefault();
    if (!isOwner || busy || !editing) return;
    busy = true;
    const field = editing;
    const value = el("edit-select").hidden ? el("edit-value").value.trim() : el("edit-select").value;
    const errorNode = el("edit-error");
    errorNode.textContent = "";
    const payload = {};
    for (const key of ownerFields) {
      payload[key] = key === "age" ? profile.age : String(profile[key] ?? "");
    }
    payload[field] = value;
    try {
      const data = await request("/profile","PUT",payload);
      if (!data.profile || data.profile.userId !== profile.userId) throw new Error("Profile update could not be confirmed");
      profile = data.profile;
      editing = null;
      el("edit-dialog").close();
      renderHeader();
      renderAbout();
    } catch(error) { errorNode.textContent = error.message || "Changes weren't saved"; }
    finally {busy = false}
  }
  async function uploadPhoto() {
    if (!isOwner || !pendingImage || busy) return;
    busy = true;
    el("photo-error").textContent = "";
    el("photo-save").disabled = true;
    try {
      const canvas = el("photo-crop-preview");
      const blob = await new Promise((resolve,reject) =>
        canvas.toBlob(result => result ? resolve(result) : reject(new Error("Could not encode photo")),"image/jpeg",0.86));
      if (blob.size > 2500000) throw new Error("Please choose a smaller photo");
      await request("/photos","POST",blob);
      el("photo-dialog").close();
      await loadPhotos();
    } catch(error) { el("photo-error").textContent = error.message || "Upload failed"; }
    finally {busy=false;el("photo-save").disabled=false}
  }
  async function previewCrop(file) {
    pendingImage = null;
    el("photo-save").disabled = true;
    el("photo-error").textContent = "";
    if (!file) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 15000000) {
      el("photo-error").textContent = "Choose a JPEG, PNG or WebP under 15 MB.";
      return;
    }
    try {
      const image = await createImageBitmap(file,{imageOrientation:"from-image"});
      const canvas = el("photo-crop-preview"),ctx=canvas.getContext("2d");
      const size = Math.min(image.width,image.height);
      ctx.clearRect(0,0,640,640);
      ctx.drawImage(image,(image.width-size)/2,(image.height-size)/2,size,size,0,0,640,640);
      image.close();
      canvas.hidden = false;
      pendingImage = true;
      el("photo-save").disabled = false;
    } catch {el("photo-error").textContent = "That picture couldn't be opened."}
  }
  async function boot() {
    if (!slug) { noAccess(); return; }
    try {
      if (!await verifyMember()) { noAccess(); return; }
      token = await authToken();
      renderMessage("Loading profile…");
      const data = await request("/profiles/" + encodeURIComponent(slug));
      if (!data.profile || typeof data.isOwner !== "boolean") throw new Error("Invalid profile response");
      profile = data.profile;
      isOwner = data.isOwner;
      publicAnswers = data.publicAnswers || [];
      personaCode = data.personaCode;
      renderHeader();renderAbout();renderQuestions();renderPersona();
      window.dispatchEvent(new CustomEvent("ogc:profile-ready", {detail:{isOwner}}));
      el("profile-app").hidden = false;
      el("loading").hidden = true;
      el("main").setAttribute("aria-busy","false");
      setTab(location.hash.replace(/^#/,""),false);
      try { await loadPhotos(); }
      catch {el("photo-message").textContent = "Photos are temporarily unavailable."}
    } catch(error) {
      if (error.status === 404) {
        renderMessage("That member profile doesn't exist.");
        el("main").setAttribute("aria-busy","false");
      } else if (error.message === "No valid account session" || error.message === "Missing member authentication") {
        noAccess();
      } else {
        renderMessage("Unable to display the profile right now. Please refresh the page.");
        el("main").setAttribute("aria-busy","false");
      }
    }
  }
  document.querySelectorAll(".tab-bar [data-tab]").forEach(button =>
    button.addEventListener("click",()=>setTab(button.dataset.tab)));
  document.querySelectorAll("[data-close]").forEach(button =>
    button.addEventListener("click",()=>el(button.dataset.close).close()));
  el("edit-form").addEventListener("submit",saveEdit);
  el("add-photo").addEventListener("click",()=> {
    el("photo-file").value = "";
    el("photo-crop-preview").hidden = true;
    el("photo-error").textContent = "";
    pendingImage = false;
    el("photo-save").disabled = true;
    el("photo-dialog").showModal();
  });
  el("photo-file").addEventListener("change",e=>previewCrop(e.target.files?.[0]));
  el("photo-save").addEventListener("click",uploadPhoto);
  window.addEventListener("pagehide",clearPhotoUrls);
  boot();
})();
