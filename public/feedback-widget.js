/* OG Cupid beta feedback drawer. Sitewide on public and member pages.
 * No third-party widget, no analytics, no client access to other submissions.
 */
(() => {
  "use strict";
  if (window.__ogcFeedbackWidgetInstalled) return;
  window.__ogcFeedbackWidgetInstalled = true;
  const draftKey = "ogc:site-feedback-draft";
  const authBase = "https://ep-hidden-breeze-bbdn5nsb.neonauth.c-15.us-east-1.aws.neon.tech/neondb/auth";
  const memberApi = "https://br-plain-unit-bbcbxpqq-members.compute.c-15.us-east-1.aws.neon.tech/profile";

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if(className) node.className = className;
    if(text) node.textContent = text;
    return node;
  }
  function rememberDraft(message, path) {
    try { sessionStorage.setItem(draftKey, JSON.stringify({message, path})); } catch {}
  }
  function restoreDraft() {
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if(draft && typeof draft.message === "string" && typeof draft.path === "string") return draft;
    } catch {}
    return null;
  }
  function clearDraft() {
    try { sessionStorage.removeItem(draftKey); } catch {}
  }
  function canonicalPath(value) {
    if(typeof value !== "string" || (!/^\/[A-Za-z0-9_./~-]*$/.test(value) || value.startsWith("//")) || value.length > 240) return "/";
    return value;
  }
  async function submitDirect(body) {
    // On an authenticated member page, use its existing Neon Auth client.
    if(typeof window.ogcSubmitFeedback === "function") return window.ogcSubmitFeedback(body);
    // On public articles/pages, a current browser session may already exist.
    const response = await fetch(authBase + "/token", {
      credentials:"include", cache:"no-store", headers:{Accept:"application/json"}
    });
    if(!response.ok) throw Object.assign(Error("Sign in to send feedback."),{needsLogin:true});
    const json = await response.json().catch(() => ({}));
    const token = json.token || (json.data && json.data.token);
    if(typeof token !== "string" || token.split(".").length !== 3)
      throw Object.assign(Error("Sign in to send feedback."),{needsLogin:true});
    const endpoint = new URL(memberApi);
    endpoint.pathname = "/feedback";
    const save = await fetch(endpoint.href, {
      method:"POST", credentials:"omit", cache:"no-store",
      headers:{"Content-Type":"application/json", Authorization:"Bearer " + token},
      body:JSON.stringify(body)
    });
    const result = await save.json().catch(() => ({}));
    if(!save.ok) {
      const err = Error(result.error || "Could not send feedback.");
      if(save.status === 401) err.needsLogin = true;
      throw err;
    }
    return result;
  }

  function mount() {
    if(!document.body) return;
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/feedback-widget.css?v=1";
    document.head.appendChild(css);

    const widget = element("section","ogc-feedback-widget");
    widget.setAttribute("aria-label","Website feedback");
    const toggle = element("button","ogc-feedback-toggle","✎  LEAVE FEEDBACK");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded","false");
    toggle.setAttribute("aria-controls","ogc-feedback-panel");
    const panel = element("div","ogc-feedback-panel");
    panel.id = "ogc-feedback-panel";
    panel.hidden = true;
    const heading = element("div","ogc-feedback-heading");
    const title = element("strong",null,"Thoughts? Complaints? Bugs?");
    const close = element("button","ogc-feedback-close","×");
    close.type = "button";
    close.setAttribute("aria-label","Close feedback box");
    heading.append(title,close);
    const intro = element("p",null,"Tell us what worked, broke, or just looks weird. Your note goes privately to the site owner.");
    const form = element("form");
    const label = element("label",null,"YOUR NOTE");
    label.htmlFor = "ogc-feedback-message";
    const message = element("textarea");
    message.id = "ogc-feedback-message";
    message.name = "feedback";
    message.required = true;
    message.maxLength = 1200;
    message.rows = 5;
    message.placeholder = "I was on the profile page and...";
    const actions = element("div","ogc-feedback-actions");
    const counter = element("span",null,"0 / 1200");
    const send = element("button","ogc-feedback-send","Send note");
    send.type = "submit";
    actions.append(counter,send);
    const status = element("p","ogc-feedback-status");
    status.setAttribute("role","status");
    status.setAttribute("aria-live","polite");
    const signin = element("a","ogc-feedback-signin","Sign in to send your note");
    signin.href = "/account/";
    signin.hidden = true;
    const privacy = element("p","ogc-feedback-privacy","Private beta feedback. We store your note, the page, and your member account for review. This isn't a live chat.");
    form.append(label,message,actions,status,signin);
    panel.append(heading,intro,form,privacy);
    widget.append(toggle,panel);
    document.body.appendChild(widget);

    const saved = restoreDraft();
    let originatingPage = canonicalPath(location.pathname);
    if(saved && saved.message && saved.message.length <= 1200) {
      message.value = saved.message;
      originatingPage = canonicalPath(saved.path);
    }
    function updateCounter(){ counter.textContent = message.value.length + " / 1200"; }
    updateCounter();
    function openPanel(open) {
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded",String(open));
      if(open) message.focus();
      else toggle.focus();
    }
    toggle.addEventListener("click",() => openPanel(panel.hidden));
    close.addEventListener("click",() => openPanel(false));
    panel.addEventListener("keydown",event => {
      if(event.key === "Escape") openPanel(false);
    });
    message.addEventListener("input",() => {
      updateCounter();
      signin.hidden = true;
      status.textContent = "";
      rememberDraft(message.value,originatingPage);
    });
    form.addEventListener("submit",async event => {
      event.preventDefault();
      const text=message.value.trim();
      if(!text || text.length > 1200) {
        status.textContent="Write a note (up to 1200 characters).";return;
      }
      send.disabled=true;
      status.textContent="Sending…";
      signin.hidden=true;
      rememberDraft(text,originatingPage);
      try {
        const result=await submitDirect({message:text,pagePath:originatingPage});
        if(!result || !result.saved) throw Error("The site did not confirm saving your note.");
        clearDraft();
        message.value="";
        originatingPage=canonicalPath(location.pathname);
        updateCounter();
        status.textContent="✓ Saved. Thanks for helping make OG Cupid less terrible.";
      } catch(error) {
        status.textContent = error && error.message ? error.message : "Couldn't send. Your note is still here.";
        const loginHint = error && (error.needsLogin || /sign in|session|unauthorized/i.test(error.message || ""));
        signin.hidden = !loginHint;
        if(loginHint) status.textContent="Sign in to send. Your draft will still be here.";
      } finally {
        send.disabled=false;
      }
    });
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",mount,{once:true});
  else mount();
})();
