import { createLocalityPicker, cityShard, cleanCitySearch } from "./locality-picker.js";

/* The onboarding view deliberately replaces the full member shell until Explore.
 * Completion is always read from the authenticated server, never local storage. */
const genders = ["Man", "Woman", "Transman", "Transwoman", "Something else"];
const orientations = ["Gay", "Straight", "Bi", "Something else"];
const goals = ["long-term dating", "short-term dating", "new friends", "casual sex", "activity partners"];
const countryCodes = ("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW").split(" ");
const choices = {
  ethnicity: ["Asian", "Black", "Hispanic / Latin", "Indigenous", "Middle Eastern", "Pacific Islander", "White", "Other"],
  bodyType: ["Thin", "Athletic", "Average", "Jacked", "Chubby", "Overweight"],
  diet: ["Vegan", "Vegetarian", "Carnivore", "Omnivore", "Takis", "Other"],
  smoking: ["Never", "Sometimes", "Often", "Just weed"],
  vaping: ["Never", "Sometimes", "Often", "Just weed"],
  drinking: ["Never", "Sometimes", "Often"],
  drugs: ["Never", "Sometimes", "Often"],
  religion: ["Agnosticism", "Atheism", "Buddhism", "Christianity", "Hinduism", "Islam", "Judaism", "Sikhism", "Other"],
  education: ["High school dropout", "High school", "Some college", "Associate degree", "Bachelor's degree", "Master's degree", "PhD"],
  income: ["Broke", "Pocket money", "Fuck you money"],
  status: ["Single", "Seeing someone", "Married"],
  relationshipType: ["Monogamous", "Polyamorous"],
  kids: ["Has kids", "Doesn't have kids"],
  wantsKids: ["Wants kids", "Doesn't want kids", "Might want kids"],
  pets: ["Has dogs", "Likes dogs", "Has cats", "Likes cats", "Has exotics", "Likes exotics"],
};
const multi = new Set(["ethnicity", "pets"]);
const text = (node, value) => { node.textContent = value == null ? "" : String(value); };
const byId = id => document.getElementById(id);
const values = (form, name) => [...form.querySelectorAll('input[name="' + name + '"]:checked')].map(x => x.value);
const splitSaved = value => String(value || "").split(", ").filter(Boolean);
export function birthAge(dateText, now = new Date()) {
  const date = new Date(String(dateText).slice(0,10) + "T00:00:00Z");
  if (!Number.isFinite(date.getTime())) return null;
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  if (now.getUTCMonth() < date.getUTCMonth() || (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate())) age--;
  return age;
}
export function zodiac(dateText) {
  const s = String(dateText || "").slice(0,10);
  const m = Number(s.slice(5,7)), d = Number(s.slice(8,10));
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return "";
  const limits = [20,19,21,20,21,21,23,23,23,23,22,22];
  const signs = ["Capricorn","Aquarius","Pisces","Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius"];
  return d < limits[m-1] ? signs[m-1] : signs[m%12];
}
export function nextRequired(status) {
  if (!status?.identity) return "identity";
  if (!status.locality) return "location";
  return "hub";
}
export function unlockedStages(status) {
  return [true, Boolean(status?.profile), Boolean(status?.photo), Boolean(status?.quiz)];
}
function choiceRow(name, title, options, saved, multiple = false) {
  const selected = splitSaved(saved);
  return '<fieldset class="ogc-choice-row" data-single="' + String(!multiple) + '"><legend>' + title + '</legend><div class="ogc-options">' +
    options.map(option => '<label><input type="checkbox" name="' + name + '" value="' + option.replace(/"/g,"&quot;") + '"' +
      (selected.includes(option) ? ' checked' : '') + '><span>' + option + '</span></label>').join("") + '</div></fieldset>';
}
function selectField(name,label,options,saved) {
  return '<label class="ogc-control">' + label + '<select name="' + name + '"><option value="">Select</option>' +
    options.map(option => '<option value="' + option.replace(/"/g,"&quot;") + '"' + (String(saved) === String(option) ? ' selected' : '') + '>' + option + '</option>').join("") +
    '</select></label>';
}
const languages = ["English","Spanish","French","German","Italian","Portuguese","Russian","Arabic","Hindi","Mandarin","Japanese","Korean","Pig Latin","Other"];
const levelOptions = ["Fluently","Okay","Poorly"];
function unpackLanguages(saved) {
  return splitSaved(saved).slice(0,3).map(s => {
    const m = /^(.*) \((Fluently|Okay|Poorly)\)$/.exec(s);
    return m ? {name:m[1],level:m[2]} : {name:"",level:""};
  });
}
export function createOnboardingUI({
  getUser, getProfile, saveProfile, request, signOut, deleteAccount,
  getPhotoCount, openNative, leaveToHome, verifyEmail
}) {
  const root = document.createElement("section");
  root.id = "ogc-onboarding";
  root.hidden = true;
  root.setAttribute("aria-label","Getting started with OG Cupid");
  document.body.appendChild(root);
  let status = null, stage = "hub", cityPicker = null, error = "", busy = false;
  let native = null, zipPlace = null, promptedPolyglot = false;
  function shell(markup) {
    root.innerHTML = '<div class="ogc-onboard"><header class="ogc-onboard-header">' +
      '<img src="/brand/og-cupid-arrow.svg" alt="OG Cupid" width="235" height="57">' +
      '<p>WELCOME TO OG CUPID</p></header><main class="ogc-onboard-content">' + markup +
      '<p id="ogc-onboard-error" class="ogc-error" role="alert" aria-live="polite"></p></main>' +
      '<footer class="ogc-onboard-footer"><button type="button" id="ogc-sign-out">Sign out</button>' +
      '<button type="button" id="ogc-delete">Delete account</button>' +
      '<a href="/contact/">Contact</a><a href="/terms/">Legal / Terms &amp; Conditions</a>' +
      '<button type="button" id="ogc-email">Verify my email</button></footer></div>';
    byId("ogc-sign-out").addEventListener("click", async () => {
      if (busy) return; busy = true;
      try { await signOut(); hide(); }
      catch (e) { fail(e); } finally { busy = false; }
    });
    byId("ogc-delete").addEventListener("click", () => { if (!busy) { stage = "delete"; render(); } });
    byId("ogc-email").hidden = status?.verified === true;
    byId("ogc-email").addEventListener("click", async () => {
      if (busy) return; busy = true;
      try {
        await requestVerification();
        text(byId("ogc-onboard-error"), "Verification link sent. Check your inbox — you can keep going.");
        byId("ogc-onboard-error").classList.add("ogc-success");
      } catch (e) { fail(e); } finally { busy = false; }
    });
  }
  function fail(e) {
    const node = byId("ogc-onboard-error");
    if (node) { node.classList.remove("ogc-success"); text(node, e instanceof Error ? e.message : "Please try again."); }
  }
  async function submit(button, action) {
    if (busy) return;
    busy = true; button.disabled = true; text(byId("ogc-onboard-error"), "");
    try { await action(); } catch (e) { fail(e); }
    finally { busy = false; if (button.isConnected) button.disabled = false; }
  }
  function go(to) { stage = to; render(); window.scrollTo(0,0); }
  function hide() {
    root.hidden = true; native = null;
    document.body.classList.remove("ogc-onboarding-active","ogc-onboarding-native");
  }
  async function requestVerification() {
    // This method is injected by the authenticated member shell: never store
    // access tokens, passwords, or verification secrets in this component.
    const button = byId("ogc-email");
    if (!getUser()?.email || !button) throw Error("Sign in before requesting email verification.");
    const url = location.origin + "/account/#welcome-title";
    if (typeof verifyEmail !== "function") throw Error("Verification service is unavailable.");
    await verifyEmail(getUser().email, url);
  }
  async function load() {
    if (!getUser()) { hide(); return; }
    const current = await request("GET", "/onboarding");
    status = current;
    if (status.explored) { hide(); leaveToHome(); return; }
    stage = nextRequired(status);
    render();
  }
  async function refresh() {
    const previous = stage;
    status = await request("GET", "/onboarding");
    if (status.explored) { hide(); leaveToHome(); return; }
    stage = nextRequired(status) !== "hub" ? nextRequired(status) : "hub";
    if (native) {
      document.body.classList.remove("ogc-onboarding-native");
      native = null;
    }
    if (previous === "delete") stage = "delete";
    render();
  }
  function renderIdentity() {
    shell('<h1>First, the basics.</h1><p>Just two things, and you’re on your way.</p>' +
      '<form id="ogc-identity" class="ogc-shortform"><label>Gender<select required name="gender"><option value="">Select your gender</option>' +
      genders.map(x => '<option>' + x + '</option>').join("") + '</select></label>' +
      '<label>Orientation<select required name="orientation"><option value="">Select your orientation</option>' +
      orientations.map(x => '<option>' + x + '</option>').join("") + '</select></label>' +
      '<button type="submit" class="ogc-next">Next</button></form>');
    const form = byId("ogc-identity");
    form.elements.gender.value = status?.state?.gender || "";
    form.elements.orientation.value = status?.state?.orientation || "";
    form.addEventListener("submit", e => { e.preventDefault(); if (!form.reportValidity()) return;
      submit(form.querySelector("button"), async () => {
        await request("PUT", "/onboarding", {step:"identity",gender:form.elements.gender.value,orientation:form.elements.orientation.value});
        await refresh();
      });
    });
  }
  function countryOptions(selected) {
    const display = new Intl.DisplayNames(["en"],{type:"region"});
    return countryCodes.slice().sort((a,b)=>display.of(a).localeCompare(display.of(b))).map(code =>
      '<option value="' + code + '"' + (code===selected?" selected":"") + '>' + display.of(code) + '</option>').join("");
  }
  function birthSelect(name,label,options,selected) {
    return '<label class="ogc-control">' + label + '<select required name="' + name + '"><option value="">'+ label + '</option>' +
      options.map(v => '<option value="' + v + '"' + (String(selected)===String(v)?" selected":"") + '>' + v + '</option>').join("") + '</select></label>';
  }
  function renderLocation() {
    const saved = status?.state || {};
    const current = saved.birth_date ? String(saved.birth_date).slice(0,10) : "";
    const months = Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0"));
    const days = Array.from({length:31},(_,i)=>String(i+1).padStart(2,"0"));
    const years = Array.from({length:103},(_,i)=>new Date().getUTCFullYear()-18-i);
    shell('<h1>When and where?</h1><p>No street address, no GPS. Just your birthday and general area.</p>' +
      '<form id="ogc-location" class="ogc-shortform"><fieldset><legend>Birthdate</legend><div class="ogc-three">' +
      birthSelect("month","Month",months,current.slice(5,7)) + birthSelect("day","Day",days,current.slice(8,10)) +
      birthSelect("year","Year",years,current.slice(0,4)) + '</div></fieldset>' +
      '<label class="ogc-control">Country<select name="country" id="ogc-country">' + countryOptions(saved.country_code || "US") + '</select></label>' +
      '<label class="ogc-control" id="ogc-zip-wrap">ZIP code<input id="ogc-zip" name="zip" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" placeholder="e.g. 30301" autocomplete="postal-code"></label>' +
      '<label class="ogc-control" id="ogc-city-wrap" hidden>City<input id="ogc-city" name="city" type="search" maxlength="100" autocomplete="off" placeholder="Start typing your city" aria-controls="ogc-city-results"></label>' +
      '<div id="ogc-city-results" class="locality-results" role="listbox" hidden></div><p id="ogc-city-message" class="ogc-city-message"></p>' +
      '<p id="ogc-location-ready" class="ogc-affirmation" hidden>Looking good! Let’s get inside.</p>' +
      '<button type="submit" class="ogc-next">DONE!</button></form>');
    const form = byId("ogc-location"), country=byId("ogc-country"), city=byId("ogc-city"),zip=byId("ogc-zip");
    cityPicker=createLocalityPicker(city, byId("ogc-city-results"), byId("ogc-city-message"), () => {
      zipPlace=null;
      const picked=cityPicker.current();
      if (picked) text(byId("ogc-city-message"), "✓ Ahh, " + picked.label.split(",")[0] + "!");
      updateReady();
    });
    if(saved.locality_id && saved.locality_shard && saved.city_label) cityPicker.restore(saved.locality_id,saved.locality_shard,saved.city_label);
    zip.value = saved.zip_code || "";
    function updateReady(){
      const place=country.value==="US"?zipPlace:cityPicker.current();
      byId("ogc-location-ready").hidden=!(place && form.elements.month.value && form.elements.day.value && form.elements.year.value);
    }
    function countryChange(){
      const us=country.value==="US";
      byId("ogc-zip-wrap").hidden=!us;byId("ogc-city-wrap").hidden=us;byId("ogc-city-results").hidden=true;
      zip.required=us;city.required=!us;zipPlace=null;
      if (!us && cityPicker.current()) { text(byId("ogc-city-message"),"✓ Ahh, "+city.value.split(",")[0]+"!"); }
      else text(byId("ogc-city-message"),"");
      updateReady();
    }
    country.addEventListener("change", countryChange);
    for (const name of ["month","day","year"]) form.elements[name].addEventListener("change",updateReady);
    let serial=0;
    zip.addEventListener("input", async () => {
      const value=zip.value.trim(), token=++serial; zipPlace=null;updateReady();
      if (!/^[0-9]{5}$/.test(value)) {text(byId("ogc-city-message"),""); return;}
      text(byId("ogc-city-message"),"Looking up your city…");
      try {
        const res=await fetch("https://api.zippopotam.us/us/"+value,{cache:"no-store"});
        if(!res.ok) throw Error("ZIP code not found");
        const data=await res.json();
        if(token!==serial) return;
        const place=data.places?.[0];
        if(!place?.["place name"] || !place["state abbreviation"]) throw Error("ZIP has no city");
        // Resolve ZIP city into our canonical self-reported locality index.
        const key=cityShard(place["place name"]);
        const shard=await fetch("/locations/"+key+".json",{cache:"force-cache"}).then(r=>r.json());
        if(token!==serial) return;
        const expected=cleanCitySearch(place["place name"]);
        const matching=shard.find(item=>item.c==="US" &&
          cleanCitySearch(item.n)===expected &&
          String(item.a).toUpperCase()===String(place["state abbreviation"]).toUpperCase());
        if(!matching) throw Error("Couldn't match that ZIP to a town in our city list. Try another nearby ZIP.");
        zipPlace={id:matching.id,key};
        text(byId("ogc-city-message"),"✓ Ahh, "+matching.n+"!");
        updateReady();
      } catch(e) {
        if(token!==serial) return;
        text(byId("ogc-city-message"),e instanceof Error?e.message:"City lookup is unavailable.");
      }
    });
    countryChange();
    if(country.value==="US" && zip.value) zip.dispatchEvent(new Event("input"));
    form.addEventListener("submit", e=> {
      e.preventDefault();if(!form.reportValidity()) return;
      submit(form.querySelector("button"),async()=>{
        const place=country.value==="US"?zipPlace:cityPicker.current();
        if(!place) throw Error("Select a verified city before continuing.");
        const birthDate=[form.elements.year.value,form.elements.month.value,form.elements.day.value].join("-");
        await request("PUT","/onboarding",{step:"locality",birthDate,countryCode:country.value,zipCode:zip.value.trim(),locality:place});
        await refresh();
      });
    });
  }
  function renderHub() {
    const done=[Boolean(status.profile),Boolean(status.photo),Boolean(status.quiz),Boolean(status.explored)];
    const unlocked=unlockedStages(status);
    const titles=["Fill out your profile","Add some photos","Persona quiz & match questions","Explore OG Cupid"];
    const descriptions=["Tell us the basics about yourself.","Give everyone a face to go with the words.","Answer 25 match questions or take the Dating Persona Test.","Make yourself at home."];
    shell('<h1>Welcome to OG Cupid!</h1><p>Just a few things before you head inside.</p>' +
      '<div class="ogc-quadrants">' + titles.map((title,i)=>
        '<button type="button" class="ogc-quadrant ' + (unlocked[i]?"":"is-locked ") + (done[i]?"is-done":"") +
        '" id="ogc-tile-'+i+'" aria-disabled="' + String(!unlocked[i]) +
        '"><span class="ogc-tile-icon" aria-hidden="true">' + ["✎","▣","♡","➜"][i] + '</span><strong>' + title +
        (done[i]?' <span aria-label="Complete">✓</span>':'') + '</strong><small>' + descriptions[i] + '</small></button>').join("") + '</div>' +
      (status.quiz ? '<div class="ogc-explore-footer"><p>Go write a 10 page profile, answer more questions, make your own, meet your future ex, have her write you a reference to your other future ex. Oh, and read the blog. But most importantly, have fun!</p>' +
      (!status.verified ? '<p><strong>Now would be a good time to verify your email. Your profile isn’t public until then.</strong></p>' : '<p class="ogc-verified">✓ Email verified.</p>') + '</div>' : ''));
    titles.forEach((_,i)=>byId("ogc-tile-"+i).addEventListener("click",async()=>{
      if(busy) return;
      if(!unlocked[i]) { text(byId("ogc-onboard-error"),"Getting ahead of yourself, huh?"); return; }
      if(i===0) go(status.profile?"details":"details");
      if(i===1) openEmbedded("photos");
      if(i===2) go("quiz-choice");
      if(i===3) await submit(byId("ogc-tile-3"),async()=>{
        await request("PUT","/onboarding",{step:"explore"});
        status.explored=true;hide();leaveToHome();
      });
    }));
  }
  function renderDetails() {
    const saved=getProfile() || {}, member=getUser(), s=status?.state||{};
    const gender=s.gender||"",orientation=s.orientation||"";
    const radiusOptions=[["10","Near me"],["25","25 miles"],["50","50 miles"],["100","100 miles"],["250","250 miles"]];
    const pref = String(saved.interestedIn||"").split(", ").filter(Boolean);
    const ageOptions=Array.from({length:83},(_,i)=>18+i);
    shell('<h1>Let’s fill out your profile.</h1><p>A few checkboxes, then we’ll give you the microphone.</p>' +
      '<form id="ogc-details" class="ogc-details"><h2>I’m looking for</h2>' +
      choiceRow("interestedIn","Interested in",genders,pref.join(", "),true) +
      '<fieldset><legend>Age range</legend><div class="ogc-three">' +
      selectField("ageMin","From",ageOptions,status.state?.match_age_min || "18") +
      selectField("ageMax","To",ageOptions,status.state?.match_age_max || "99") +
      '<label class="ogc-control">Distance<select name="radius">' + radiusOptions.map(o=>'<option value="'+o[0]+'">'+o[1]+'</option>').join("") + '</select></label></div></fieldset>' +
      choiceRow("openTo","I’m open to",goals,saved.relationshipGoal,true) +
      '<h2>My details</h2><p class="ogc-identity-line" id="ogc-identity-description"></p>' +
      '<p>My age: shown in profile headers only. Zodiac: <strong id="ogc-zodiac"></strong> (from your birthdate).</p>' +
      Object.entries(choices).map(([field,optionList])=>choiceRow(field,field === "relationshipType"?"Monogamy / polyamory":field[0].toUpperCase()+field.slice(1),optionList,saved[field],multi.has(field))).join("") +
      '<label class="ogc-check-extra"><input type="checkbox" name="justWeed"> Just weed (independent of frequency)</label>' +
      '<label class="ogc-control">Height<select name="height" id="ogc-height"><option value="">Select height</option></select></label>' +
      '<label class="ogc-control">Job<input type="text" name="work" maxlength="160"></label>' +
      '<fieldset><legend>Languages</legend><div id="ogc-languages"></div><p id="ogc-polyglot" class="ogc-affirmation" hidden>Trēs linguae? O polyglotta!</p></fieldset>' +
      '<button class="ogc-next" type="submit">Save &amp; Continue</button></form>');
    text(byId("ogc-identity-description"),orientation+" "+gender);
    text(byId("ogc-zodiac"),zodiac(s.birth_date));
    const f=byId("ogc-details");
    f.elements.work.value=saved.work||"";
    f.elements.radius.value=String(saved.searchRadiusMiles||10);
    for(let inches=48;inches<=84;inches++){
      const label=Math.floor(inches/12)+"' "+inches%12+'" ('+Math.round(inches*2.54)+' cm)';
      const option=new Option(label,label);byId("ogc-height").add(option);
    }
    f.elements.height.value=saved.height||"";
    if(String(saved.drugs||"").startsWith("Just weed")) {
      f.elements.justWeed.checked=true;
      const freq=String(saved.drugs).split(" · ")[1]||"";
      for(const el of f.querySelectorAll('input[name="drugs"]'))el.checked=el.value===freq;
    }
    const languageRecords=unpackLanguages(saved.languages);
    for(let index=1;index<=3;index++){
      const node=document.createElement("div");node.className="ogc-language-line";
      const name=document.createElement("select"),level=document.createElement("select");
      name.name="languageName"+index;name.setAttribute("aria-label","Language "+index);
      level.name="languageLevel"+index;level.setAttribute("aria-label","Proficiency "+index);
      name.add(new Option("Choose language "+index,""));
      level.add(new Option("Proficiency",""));
      languages.forEach(value=>name.add(new Option(value,value)));
      levelOptions.forEach(value=>level.add(new Option(value,value)));
      name.value=languageRecords[index-1]?.name||"";
      level.value=languageRecords[index-1]?.level||"";
      node.append(name,level);byId("ogc-languages").appendChild(node);
      name.addEventListener("change",()=>{
        if(index===3 && name.value && !promptedPolyglot) {
          promptedPolyglot=true;byId("ogc-polyglot").hidden=false;
        }
      });
    }
    f.addEventListener("change",e=>{
      const box=e.target;
      if(!(box instanceof HTMLInputElement) ||box.type!=="checkbox"||!box.checked)return;
      const row=box.closest("[data-single]");
      if(row?.dataset.single==="true"){
        row.querySelectorAll('input[type="checkbox"]').forEach(item=>{if(item!==box)item.checked=false;});
      }
    });
    f.addEventListener("submit", e=>{
      e.preventDefault();if(!f.reportValidity())return;
      submit(f.querySelector('button[type="submit"]'),async()=>{
        const interestedIn=values(f,"interestedIn");
        const openTo=values(f,"openTo");
        if(!interestedIn.length||!openTo.length)throw Error("Choose who interests you and what you’re open to.");
        const min=Number(f.elements.ageMin.value),max=Number(f.elements.ageMax.value);
        if(min>max)throw Error("Your match age range is backwards.");
        const detail={ aboutMe:saved.aboutMe||"",age:birthAge(s.birth_date),cityRegion:s.city_label,
          locality:{id:s.locality_id,key:s.locality_shard},searchOrigin:{id:s.locality_id,key:s.locality_shard},
          searchRadiusMiles:Number(f.elements.radius.value),gender,orientation,
          interestedIn:interestedIn.join(", "),relationshipGoal:openTo.join(", "),
          height:f.elements.height.value,work:f.elements.work.value.trim(),sign:zodiac(s.birth_date)};
        for(const name of Object.keys(choices))detail[name]=values(f,name).join(", ");
        if(f.elements.justWeed.checked)detail.drugs="Just weed"+(detail.drugs?" · "+detail.drugs:"");
        const languagesSaved=[];
        for(let i=1;i<=3;i++){
          const lang=f.elements["languageName"+i].value,level=f.elements["languageLevel"+i].value;
          if(lang && level)languagesSaved.push(lang+" ("+level+")");
        }
        detail.languages=languagesSaved.join(", ");
        await saveProfile(detail);
        await request("PUT","/onboarding",{step:"details",matchAgeMin:min,matchAgeMax:max});
        go("summary");
      });
    });
  }
  function renderSummary() {
    shell('<h1>Tell us a little about yourself!</h1><p>Alright, enough checkboxes. Let’s hear from you.</p>' +
      '<form id="ogc-summary" class="ogc-shortform"><label>My Self Summary' +
      '<textarea required minlength="15" maxlength="5000" rows="8" name="aboutMe" placeholder="Who are you? What makes you tick? What should someone know about you?"></textarea></label>' +
      '<p class="ogc-hint">Don’t worry about cramming your entire life story into one little box. We’ve got plenty of room for that later. Just give us a few sentences about yourself for now.</p>' +
      '<button class="ogc-next" type="submit">Save &amp; Continue</button></form>');
    const f=byId("ogc-summary");f.elements.aboutMe.value=getProfile()?.aboutMe||"";
    f.addEventListener("submit",e=>{
      e.preventDefault();if(!f.reportValidity())return;
      submit(f.querySelector("button"),async()=>{
        await saveProfile({aboutMe:f.elements.aboutMe.value.trim(),age:birthAge(status.state?.birth_date)});
        await refresh();
      });
    });
  }
  function renderQuizChoice() {
    shell('<h1>Let’s get to know you.</h1><p>Pick your first adventure. Either one counts.</p>' +
      '<div class="ogc-quiz-options"><button id="ogc-match-path" class="ogc-next">Answer 25 match questions</button>' +
      '<a class="ogc-next" href="/account/persona.html?onboarding=1">Take the Dating Persona Test</a></div>' +
      '<p class="ogc-hint">You can always do the other one later.</p><button type="button" id="ogc-quiz-back" class="ogc-back">Back</button>');
    byId("ogc-match-path").addEventListener("click",()=>openEmbedded("questions"));
    byId("ogc-quiz-back").addEventListener("click",()=>go("hub"));
  }
  function renderDeletion() {
    shell('<h1>Delete your account?</h1><p>This permanently erases your account, profile, photos, essays, answers, and sessions. Only your original signup email and a marker that an account once existed will remain.</p>' +
      '<form class="ogc-shortform" id="ogc-delete-form"><label>Current password<input type="password" name="password" required minlength="12" autocomplete="current-password"></label>' +
      '<label>Type DELETE to confirm<input type="text" name="confirmation" required autocomplete="off"></label>' +
      '<button class="ogc-next ogc-delete-cta" type="submit">Permanently delete my account</button></form>' +
      '<button class="ogc-back" id="ogc-cancel-delete" type="button">Cancel</button>');
    byId("ogc-cancel-delete").addEventListener("click",()=>go("hub"));
    const f=byId("ogc-delete-form");
    f.addEventListener("submit",e=>{
      e.preventDefault();if(!f.reportValidity())return;
      submit(f.querySelector("button"),async()=>{
        if(f.elements.confirmation.value!=="DELETE")throw Error("Type DELETE exactly.");
        await deleteAccount(f.elements.password.value);
        hide();
      });
    });
  }
  function render() {
    root.hidden=false;
    document.body.classList.add("ogc-onboarding-active");
    document.body.classList.remove("ogc-onboarding-native");
    native=null;
    if(stage==="identity")renderIdentity();
    else if(stage==="location")renderLocation();
    else if(stage==="details")renderDetails();
    else if(stage==="summary")renderSummary();
    else if(stage==="quiz-choice")renderQuizChoice();
    else if(stage==="delete")renderDeletion();
    else renderHub();
  }
  function openEmbedded(section) {
    if(section!=="photos"&&section!=="questions")return;
    native=section;root.hidden=true;
    document.body.classList.remove("ogc-onboarding-active");
    document.body.classList.add("ogc-onboarding-native");
    openNative(section);
    const footer=byId("ogc-photo-footer");
    if(footer)footer.hidden=section!=="photos";
    if(section==="photos") {
      text(byId("ogc-photo-looks"),["Man","Transman"].includes(status?.state?.gender)?"handsome":"gorgeous");
      const finish=byId("ogc-photo-finished");
      finish.disabled=!getPhotoCount();
      finish.onclick=()=>submit(finish,async()=>{
        if(!byId("ogc-photo-confirm").checked)throw Error("Confirm your main thumbnail is an actual photo of you.");
        await request("PUT","/onboarding",{step:"self-photo",confirmed:true});
        byId("ogc-photo-confirm").checked=false;await refresh();
      });
    }
  }
  function photoChanged() {
    if(native==="photos") {
      const button=byId("ogc-photo-finished");if(button)button.disabled=!getPhotoCount();
    }
  }
  async function answeredQuestion() {
    if(native==="questions" && getUser()) {
      const next=await request("GET","/onboarding");
      if(next.quiz) await refresh();
    }
  }
  return {load, refresh, hide, photoChanged, answeredQuestion,
    get active(){return !root.hidden || native!==null;},
    get complete(){return Boolean(status?.explored);},
    get state(){return status;},
  };
}
