import React, {useEffect, useMemo, useState} from "react";
import {Navigate, NavLink, Outlet, Route, Routes} from "react-router-dom";
import {defaultRoute, primaryNavigation} from "./navigation.mjs";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {selectRecommendedMembers} from "./member-gateway.mjs";
import {filterAndSortMembers, pageMembers} from "./member-directory.mjs";
import {legacyHref} from "./legacy-links.mjs";
import ProfileEditor from "./ProfileEditor.jsx";
import PublicMemberProfile from "./PublicMemberProfile.jsx";
import QuickmatchView from "./QuickmatchView.jsx";
import MessagesView from "./MessagesView.jsx";
import MatchQuestions from "./MatchQuestions.jsx";

const profileHref = slug => "#/profiles/" + encodeURIComponent(slug);
const questionScore = member => member.matchPercent === null
  ? "Not enough shared answers"
  : member.matchPercent + "% question match · " + member.commonQuestions + " shared";

export function MemberPhoto({member}) {
  const {kind, getMemberAvatar} = useMemberSession();
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (kind !== "member" || !member?.userId) return;
    let closed = false;
    let created = null;
    setUrl(null);
    void getMemberAvatar(member.userId).then(image => {
      if (closed || !image) return;
      created = URL.createObjectURL(image);
      setUrl(created);
    }).catch(() => { /* The card falls back if an image is not available. */ });
    return () => {
      closed = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [kind, getMemberAvatar, member?.userId]);
  return url
    ? <img className="ogcl-member-photo" src={url} alt="" loading="lazy" />
    : <span className="ogcl-member-photo ogcl-photo-placeholder" aria-hidden="true">♥</span>;
}

function MemberCard({member}) {
  return <a className="ogcl-member-link" href={profileHref(member.slug)}>
    <MemberPhoto member={member} />
    <span className="ogcl-member-copy">
      <strong>{member.displayName}</strong>
      <small>{questionScore(member)}</small>
    </span>
  </a>;
}

function LeftRail() {
  const {kind, discovery, discoveryUnavailable} = useMemberSession();
  const isMember = kind === "member";
  const recommendations = useMemo(() => selectRecommendedMembers(discovery), [discovery]);
  return (
    <aside className="ogcl-left" aria-label="Primary navigation">
      <a className="ogcl-brand" href={legacyHref("/account/")} aria-label="OG Cupid member home">
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
              <a href={legacyHref("/account/")}>Your account</a>}
            {profileUnavailable && <p>Profile details could not load. Try refreshing.</p>}
            <NavLink to="/profile">Edit About essays</NavLink>
            <NavLink to="/questions">Edit match questions</NavLink>
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
            <a href={legacyHref("/account/#welcome-title")}>Continue your setup</a>
            <button type="button" className="ogcl-side-button" onClick={session.signOut}>Sign out</button>
          </>
        ) : (
          <>
            <h2>Your profile</h2>
            <p>Sign in to view your saved account and recommendations.</p>
            <a href={legacyHref("/account/")}>Existing member site</a>
          </>
        )}
      </section>
      <section className="ogcl-side-card">
        <h2>Stay curious</h2>
        <p>Don't judge a profile by the photo alone.</p>
        <a href={legacyHref("/ogtrends/")}>Read OgTrends</a>
        <a href={legacyHref("/account/persona.html")}>Dating Persona Test</a>
        <NavLink to="/questions">Answer match questions</NavLink>
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
        <div className="ogcl-banner">OG CUPID <span>MEMBERS</span></div>
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
        <p>Sign in with your existing OG Cupid account.</p>
      </header>
      <div className="ogcl-content-panel">
        <form className="ogcl-signin-form" onSubmit={submit}>
          <label>Email address<input name="email" type="email" required autoComplete="email" maxLength={254} /></label>
          <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
          <button type="submit" disabled={busy}>{busy ? "Checking account…" : "Sign in"}</button>
          {(error || sessionError) && <p className="ogcl-error" role="alert">{error || sessionError}</p>}
        </form>
        <p><a href={legacyHref("/account/?join=1")}>Create an account</a> · <a href={legacyHref("/account/")}>Forgot your password?</a></p>
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
        <p><a href={legacyHref("/account/#welcome-title")}>Continue onboarding</a></p>
      </div>
    </section>
  );
  return (
    <section className="ogcl-view" role="alert">
      <header className="ogcl-view-head"><h1>Account unavailable</h1></header>
      <div className="ogcl-content-panel">
        <p>{error || "We couldn't confirm your account status."}</p>
        <button type="button" className="ogcl-button" onClick={refresh}>Retry account check</button>
        <p><a href={legacyHref("/account/")}>Open existing member site</a></p>
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

function MemberDirectory() {
  const {discovery, discoveryUnavailable, refresh} = useMemberSession();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("match");
  const [page, setPage] = useState(1);
  const ordered = useMemo(() => filterAndSortMembers(discovery, {search, sort}), [discovery, search, sort]);
  const directoryPage = useMemo(() => pageMembers(ordered, page), [ordered, page]);
  useEffect(() => { setPage(1); }, [search, sort]);
  return <PreviewView title="Matches" intro="Browse members who've completed their profiles.">
    <p className="ogcl-note">Compatibility is a provisional question-only calculation. A missing score means there aren't enough shared answers.</p>
    {discoveryUnavailable ? <div role="alert"><p>Member discovery couldn't load.</p>
      <button type="button" className="ogcl-button" onClick={refresh}>Try again</button></div> :
      <>
        <div className="ogcl-directory-tools">
          <label>Find by username
            <input type="search" maxLength={80} value={search} placeholder="Search members"
              onChange={event => setSearch(event.target.value)} />
          </label>
          <label>Sort results
            <select value={sort} onChange={event => setSort(event.target.value)}>
              <option value="match">Highest match %</option>
              <option value="name">Username A–Z</option>
            </select>
          </label>
          <span className="ogcl-directory-count">{ordered.length} matching {ordered.length === 1 ? "member" : "members"}</span>
        </div>
        {directoryPage.items.length ? <div className="ogcl-directory">{directoryPage.items.map(p =>
          <MemberCard key={p.userId} member={p} />)}</div> :
          <p>{search ? "No members match that username." : "No discoverable members are available yet."}</p>}
        {directoryPage.totalPages > 1 && <nav className="ogcl-pages" aria-label="Matches pages">
          {Array.from({length:directoryPage.totalPages},(_,index) => index + 1).map(n =>
            <button key={n} type="button" aria-current={n===directoryPage.page ? "page" : undefined}
              onClick={() => setPage(n)}>{n}</button>)}
        </nav>}
      </>}
  </PreviewView>;
}

const views = {
  visitors: ["Visitors", "Who's been stopping by.",
    "Visitor tracking isn't live yet. No activity is being recorded or invented."]
};

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to={defaultRoute} replace />} />
        <Route path="matches" element={<MemberGate><MemberDirectory /></MemberGate>} />
        <Route path="profile" element={<MemberGate><ProfileEditor /></MemberGate>} />
        <Route path="profiles/:slug" element={<MemberGate><PublicMemberProfile Photo={MemberPhoto} /></MemberGate>} />
        <Route path="questions" element={<MemberGate><MatchQuestions /></MemberGate>} />
        <Route path="quickmatch" element={<MemberGate><QuickmatchView Photo={MemberPhoto} /></MemberGate>} />
        <Route path="messages" element={<MemberGate><MessagesView /></MemberGate>} />
        <Route path="messages/:peerId" element={<MemberGate><MessagesView /></MemberGate>} />
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
