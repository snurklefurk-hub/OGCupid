import React, {useMemo, useState} from "react";
import {Navigate, NavLink, Outlet, Route, Routes} from "react-router-dom";
import {defaultRoute, primaryNavigation} from "./navigation.mjs";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {selectRecommendedMembers} from "./member-gateway.mjs";

const profileHref = slug => "/profiles/" + encodeURIComponent(slug);
const questionScore = member => member.matchPercent === null
  ? "Not enough shared answers"
  : member.matchPercent + "% question match · " + member.commonQuestions + " shared";

function MemberCard({member}) {
  return (
    <a className="ogcl-member-link" href={profileHref(member.slug)}>
      <strong>{member.displayName}</strong>
      <span>{questionScore(member)}</span>
    </a>
  );
}

function LeftRail() {
  const {kind, discovery, discoveryUnavailable} = useMemberSession();
  const isMember = kind === "member";
  const recommendations = useMemo(() => selectRecommendedMembers(discovery), [discovery]);
  return (
    <aside className="ogcl-left" aria-label="Primary navigation">
      <a className="ogcl-brand" href="/account/" aria-label="OG Cupid member home">
        <img src="/brand/ogcupid-logo-white.png" width="218" height="54" alt="OG Cupid" />
      </a>
      <nav className="ogcl-primary" aria-label="OG Cupid main">
        {primaryNavigation.map(({path, label, icon}) =>
          isMember ? (
            <NavLink key={path} to={path}
              className={({isActive}) => isActive ? "ogcl-nav-link active" : "ogcl-nav-link"}>
              <span aria-hidden="true">{icon}</span>{label}
            </NavLink>
          ) : (
            <span key={path} className="ogcl-nav-link ogcl-locked" aria-disabled="true">
              <span aria-hidden="true">{icon}</span>{label}
            </span>
          ))}
      </nav>
      <section className="ogcl-left-note" aria-label="Suggested members">
        <h2>You might like</h2>
        {!isMember ? <p>Sign in and finish onboarding to see members.</p> :
          discoveryUnavailable ? <p>Recommendations are temporarily unavailable.</p> :
            recommendations.length
              ? <div className="ogcl-member-list">{recommendations.map(member =>
                  <MemberCard key={member.userId} member={member} />)}</div>
              : <p>No discoverable profiles are available yet.</p>}
      </section>
    </aside>
  );
}

function RightRail() {
  const session = useMemberSession();
  const {kind, user, profile, profileUnavailable, onboarding} = session;
  const progressKeys = ["identity", "locality", "profile", "photo", "quiz", "explored"];
  const finished = progressKeys.filter(k => onboarding?.[k] === true).length;
  const percent = Math.round((finished / progressKeys.length) * 100);
  return (
    <aside className="ogcl-right" aria-label="Account and discovery">
      <section className="ogcl-side-card">
        {kind === "member" ? (
          <>
            <h2>View your profile</h2>
            <p>{profile?.displayName || user?.name || "OG Cupid member"}</p>
            {profile?.slug ? <a href={profileHref(profile.slug)}>Your member profile</a> :
              <a href="/account/">Your account</a>}
            {profileUnavailable && <p>Profile details could not load. Try refreshing.</p>}
            <button type="button" className="ogcl-side-button" onClick={session.signOut}>Sign out</button>
          </>
        ) : kind === "onboarding" ? (
          <>
            <h2>Complete your profile</h2>
            <p>{percent}% complete · {onboarding?.answerCount ?? 0} questions answered</p>
            <div className="ogcl-progress" aria-label="Onboarding completion" role="progressbar"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <span style={{width: percent + "%"}} />
            </div>
            <a href="/account/#welcome-title">Continue your setup</a>
            <button type="button" className="ogcl-side-button" onClick={session.signOut}>Sign out</button>
          </>
        ) : (
          <>
            <h2>Your profile</h2>
            <p>Sign in to view your saved account and recommendations.</p>
            <a href="/account/">Existing member site</a>
          </>
        )}
      </section>
      <section className="ogcl-side-card">
        <h2>Stay curious</h2>
        <p>Don't judge a profile by the photo alone.</p>
        <a href="/ogtrends/">Read OgTrends</a>
        <a href="/account/persona.html">Dating Persona Test</a>
      </section>
    </aside>
  );
}

function AppShell() {
  return (
    <div className="ogcl-app">
      <a className="ogcl-skip" href="#ogcl-content">Skip to content</a>
      <LeftRail />
      <main id="ogcl-content" className="ogcl-center" tabIndex={-1}>
        <div className="ogcl-banner">OG CUPID <span>REACT SHELL PREVIEW</span></div>
        <Outlet />
      </main>
      <RightRail />
    </div>
  );
}

function SignInForm() {
  const {signIn, error: sessionError} = useMemberSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (busy || !form.reportValidity()) return;
    const email = form.elements.email.value;
    const password = form.elements.password.value;
    form.elements.password.value = ""; // Never retain password in component state.
    setError("");
    setBusy(true);
    try { await signIn(email, password); }
    catch (err) {
      setError(err?.code === "invalid"
        ? "Those sign-in details were not accepted."
        : "Unable to sign in right now. Please retry.");
    } finally { setBusy(false); }
  }
  return (
    <section className="ogcl-view" aria-labelledby="ogcl-signin-heading">
      <header className="ogcl-view-head">
        <h1 id="ogcl-signin-heading">Welcome to OG Cupid</h1>
        <p>Sign in with your existing account. This preview uses the same Neon member system.</p>
      </header>
      <div className="ogcl-content-panel">
        <form className="ogcl-signin-form" onSubmit={submit}>
          <label>Email address<input name="email" type="email" required autoComplete="email" maxLength={254} /></label>
          <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
          <button type="submit" disabled={busy}>{busy ? "Checking account…" : "Sign in"}</button>
          {(error || sessionError) && <p className="ogcl-error" role="alert">{error || sessionError}</p>}
        </form>
        <p><a href="/account/?join=1">Create an account</a> · <a href="/account/">Forgot your password?</a></p>
        <p className="ogcl-note">New accounts and unfinished onboarding still use the established member app while their views are migrated.</p>
      </div>
    </section>
  );
}

function MemberGate({children}) {
  const {kind, error, refresh} = useMemberSession();
  if (kind === "member") return children;
  if (kind === "guest") return <SignInForm />;
  if (kind === "checking") return (
    <section className="ogcl-view"><p role="status">Checking your account…</p></section>
  );
  if (kind === "onboarding") return (
    <section className="ogcl-view">
      <header className="ogcl-view-head"><h1>Finish getting started</h1></header>
      <div className="ogcl-content-panel">
        <p>Your account is signed in. Complete onboarding before using member discovery.</p>
        <p><a href="/account/#welcome-title">Continue onboarding</a></p>
      </div>
    </section>
  );
  return (
    <section className="ogcl-view" role="alert">
      <header className="ogcl-view-head"><h1>Account unavailable</h1></header>
      <div className="ogcl-content-panel">
        <p>{error || "We couldn't confirm your account status."}</p>
        <button type="button" className="ogcl-button" onClick={refresh}>Retry account check</button>
        <p><a href="/account/">Open existing member site</a></p>
      </div>
    </section>
  );
}

function PreviewView({title, intro, footnote, children}) {
  return (
    <section className="ogcl-view" aria-labelledby="ogcl-view-title">
      <header className="ogcl-view-head">
        <h1 id="ogcl-view-title">{title}</h1>
        <p>{intro}</p>
      </header>
      <div className="ogcl-content-panel">
        {children || <><h2>Under construction</h2><p>{footnote}</p></>}
      </div>
    </section>
  );
}

function MemberDirectory({quick = false}) {
  const {discovery, discoveryUnavailable} = useMemberSession();
  const choices = useMemo(() => quick && discovery.length
    ? [discovery[Math.floor(Math.random() * discovery.length)]] : discovery,
    [discovery, quick]);
  return <PreviewView
    title={quick ? "Quickmatch" : "Matches"}
    intro={quick ? "A little serendipity, without endless swiping." : "Find people worth getting to know."}>
    <p className="ogcl-note">Question-only compatibility is provisional. Few shared questions mean low confidence.</p>
    {discoveryUnavailable ? <p>Member discovery couldn't load. Refresh to try again.</p> :
      choices.length ? <div className="ogcl-directory">{choices.map(p =>
        <MemberCard key={p.userId} member={p} />)}</div> :
        <p>No discoverable members are available yet.</p>}
  </PreviewView>;
}

const views = {
  messages: ["Messages", "Conversations, not swipes.",
    "Messaging isn't enabled in the current backend. No fabricated conversations."],
  visitors: ["Visitors", "Who's been stopping by.",
    "Visitor tracking isn't live yet. No activity is being recorded or invented."],
  questions: ["Match questions", "Better answers, better conversations.",
    "Your existing saved question answers remain in the established account app until the editor is safely migrated."]
};

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to={defaultRoute} replace />} />
        <Route path="matches" element={<MemberGate><MemberDirectory /></MemberGate>} />
        <Route path="quickmatch" element={<MemberGate><MemberDirectory quick /></MemberGate>} />
        {Object.entries(views).map(([path, [title, intro, footnote]]) => (
          <Route key={path} path={path} element={
            <MemberGate><PreviewView title={title} intro={intro} footnote={footnote} /></MemberGate>
          } />
        ))}
        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
      </Route>
    </Routes>
  );
}
