import React, {lazy, Suspense, useEffect, useMemo, useState} from "react";
import {Navigate, NavLink, Outlet, Route, Routes} from "react-router-dom";
import {defaultRoute, primaryNavigation} from "./navigation.mjs";
import PublishedUiDesign from "./PublishedUiDesign.jsx";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {SidebarPromos, ProfileFloater, ProfileRefinement} from "./ClassicSidebar.jsx";
import {useSitePromos} from "./use-site-promos.mjs";
import {filterAndSortMembers, pageMembers} from "./member-directory.mjs";
import {recommendedPhotoMembers} from "./classic-editorial.mjs";

// Route components load only when visited.
const loadEditorial=()=>import("./EditorialPages.jsx");
const EmbeddedEditorial=lazy(()=>loadEditorial().then(m=>({default:m.EmbeddedEditorial})));
const PersonaRoute=lazy(()=>loadEditorial().then(m=>({default:m.PersonaRoute})));
const ContactPage=lazy(()=>import("./ContactPage.jsx"));
const SitemapPage=lazy(()=>import("./SitemapPage.jsx"));
const ProfileEditor=lazy(()=>import("./ProfileEditor.jsx"));
const ProfileSettings=lazy(()=>import("./ProfileSettings.jsx"));
const PublicMemberProfile=lazy(()=>import("./PublicMemberProfile.jsx"));
const QuickmatchView=lazy(()=>import("./QuickmatchView.jsx"));
const MessagesView=lazy(()=>import("./MessagesView.jsx"));
const MatchesView=lazy(()=>import("./MatchesView.jsx"));
const CommunityChat=lazy(()=>import("./CommunityChat.jsx"));
const AdminDashboard=lazy(()=>import("./AdminDashboard.jsx"));
const MatchQuestions=lazy(()=>import("./MatchQuestions.jsx"));
const Onboarding=lazy(()=>import("./Onboarding.jsx"));
const PhotoManager=lazy(()=>import("./PhotoManager.jsx"));
const loadAccounts=()=>import("./AccountPages.jsx");
const JoinForm=lazy(()=>loadAccounts().then(m=>({default:m.JoinForm})));
const RecoveryForm=lazy(()=>loadAccounts().then(m=>({default:m.RecoveryForm})));
const VerifyForm=lazy(()=>loadAccounts().then(m=>({default:m.VerifyForm})));
const AccountManagement=lazy(()=>loadAccounts().then(m=>({default:m.AccountManagement})));

const profileHref = slug => "/profiles/" + encodeURIComponent(slug);
const questionScore = member => member.matchPercent === null
  ? "Not enough shared answers"
  : member.matchPercent + "% question match · " + member.commonQuestions + " shared";

export function MemberPhoto({member}) {
  const {kind, user, getMemberAvatar} = useMemberSession();
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!["member","onboarding"].includes(kind) || !member?.userId) return;
    let closed = false;
    let created = null;
    setUrl(null);
    if(member.avatarPhotoId===null)return;
    void getMemberAvatar(member.userId,member.avatarPhotoId).then(image => {
      if (closed || !image) return;
      created = URL.createObjectURL(image);
      setUrl(created);
    }).catch(() => { /* The card falls back if an image is not available. */ });
    return () => {
      closed = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [kind, user?.id, getMemberAvatar, member?.userId, member?.avatarPhotoId]);
  return (["member","onboarding"].includes(kind)&&url)
    ? <img className="ogcl-member-photo" src={url} alt="" loading="lazy" />
    : <span className="ogcl-member-photo ogcl-photo-placeholder" aria-hidden="true">♥</span>;
}

function MemberCard({member}) {
  return <NavLink className="ogcl-member-link" to={profileHref(member.slug)}>
    <MemberPhoto member={member} />
    <span className="ogcl-member-copy">
      <strong>{member.displayName}</strong>
      <small>{questionScore(member)}</small>
    </span>
  </NavLink>;
}

function LeftRail({promoSelection}) {
  const {kind, discovery, discoveryUnavailable} = useMemberSession();
  const isMember = kind === "member";
  const recommendations = useMemo(() => recommendedPhotoMembers(discovery), [discovery]);
  return (
    <aside className="ogcl-left" aria-label="Primary navigation">
      <NavLink className="ogcl-brand" to="/matches" aria-label="OG Cupid member home">
        <img src="/brand/ogcupid-logo-white.png" width="172" height="42" alt="OG Cupid" />
      </NavLink>
      <nav className="ogcl-main-nav" aria-label="OG Cupid main">
        {primaryNavigation.map(({path,label,icon}) => {
          const content = <><span className="ogcl-nav-icon" aria-hidden="true">{icon}</span><span data-ogc-edit-text={"shell.nav."+path.slice(1)}>{label}</span></>;
          return (isMember || (kind==="onboarding" && path==="/community")) ? <NavLink key={path} to={path}
            data-ogc-nav={path.slice(1)}
            className={({isActive})=>isActive?"ogcl-nav-link active":"ogcl-nav-link"}>
            {content}
          </NavLink> : <span key={path} data-ogc-nav={path.slice(1)} className="ogcl-nav-link ogcl-locked" aria-disabled="true">
            {content}
          </span>;
        })}
      </nav>
      {isMember && !discoveryUnavailable && recommendations.length>0 && <section className="ogcl-left-note" aria-label="Suggested members">
        <h2 data-ogc-edit-text="shell.suggestions">You might like</h2>
        <div className="ogcl-suggested-thumbnails">
          {recommendations.map(member=><NavLink key={member.userId} to={profileHref(member.slug)}
            aria-label={"View member profile: "+member.displayName}>
            <MemberPhoto member={member}/>
          </NavLink>)}
        </div>
      </section>}
      <SidebarPromos side="left" selection={promoSelection}/>
    </aside>
  );
}

function RightRail({promoSelection}) {
  const {kind,user,onboarding} = useMemberSession();
  const keys=["identity","locality","profile","photo","quiz","explored"];
  const percent=Math.round(keys.filter(key=>onboarding?.[key]===true).length/keys.length*100);
  return (
    <aside className="ogcl-right" aria-label="Profile and site features">
      <ProfileFloater Photo={MemberPhoto}/>
      {kind==="onboarding" && <section className="ogcl-side-card ogcl-onboarding-widget">
        {user?.id && onboarding?.photo && <MemberPhoto member={{userId:user.id}}/>}
        <h2>Complete your profile</h2>
        <p>{percent}% complete</p>
        <div className="ogcl-progress" role="progressbar" aria-label="Profile completion"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span style={{width:percent+"%"}}/>
        </div>
        <NavLink to="/onboarding">Continue your setup</NavLink>
      </section>}
      <ProfileRefinement selection={promoSelection}/>
      <SidebarPromos side="right" selection={promoSelection}/>
    </aside>
  );
}

function AdminLink() {
  const {kind,adminRequest}=useMemberSession();
  const [allowed,setAllowed]=useState(false);
  useEffect(()=>{
    let active=true;setAllowed(false);
    if(kind==="member"||kind==="onboarding")void adminRequest("/admin").then(()=>{if(active)setAllowed(true);})
      .catch(()=>{if(active)setAllowed(false);});
    return ()=>{active=false;};
  },[kind,adminRequest]);
  return allowed?<NavLink data-ogc-edit-text="shell.account.admin" to="/admin">Admin</NavLink>:null;
}

function TopMemberNav() {
  const session=useMemberSession();
  return <nav className="ogcl-top-links" aria-label="Member account">
    {(session.kind==="member"||session.kind==="onboarding") && <>
      {session.kind==="member"&&<>
        <NavLink data-ogc-edit-text="shell.account.profile" to={session.profile?.slug?"/profiles/"+session.profile.slug:"/profile"}>Profile</NavLink>
        <NavLink data-ogc-edit-text="shell.account.settings" to="/settings">Settings</NavLink>
      </>}
      <NavLink data-ogc-edit-text="shell.account.account" to="/account">Account</NavLink>
      <AdminLink />
      <button data-ogc-edit-text="shell.account.signout" type="button" onClick={session.signOut}>Sign out</button>
    </>}
    {session.kind==="guest" && <>
      <NavLink data-ogc-edit-text="shell.account.signin" to="/signin">Sign in</NavLink>
      <NavLink data-ogc-edit-text="shell.account.join" to="/join">Join OG Cupid</NavLink>
    </>}
  </nav>;
}

function RouteLoading(){
  return <section className="ogcl-view"><p role="status">Loading page…</p></section>;
}

function AppShell() {
  const promoSelection=useSitePromos();
  return (
    <div className="ogcl-app">
      <PublishedUiDesign />
      <a className="ogcl-skip" href="#ogcl-content" onClick={event=>{
        event.preventDefault();
        document.getElementById("ogcl-content")?.focus();
      }}>Skip to content</a>
      <LeftRail promoSelection={promoSelection}/>
      <main id="ogcl-content" className="ogcl-center" tabIndex={-1}>
        <div className="ogcl-banner"><TopMemberNav/></div>
        <div className="ogcl-sheet"><Suspense fallback={<RouteLoading/>}><Outlet /></Suspense></div>
        <footer className="ogcl-footer" aria-label="Site information">
          <span data-ogc-edit-text="shell.footer.disclaimer">OG Cupid · Independent, not affiliated with OkCupid or Match Group.</span>
          <nav aria-label="Site links">
            <NavLink data-ogc-edit-text="shell.footer.ogtrends" to="/ogtrends">OgTrends</NavLink>
            <NavLink data-ogc-edit-text="shell.footer.persona" to="/persona">Dating Persona</NavLink>
            <NavLink data-ogc-edit-text="shell.footer.contact" to="/contact">Contact</NavLink>
            <NavLink data-ogc-edit-text="shell.footer.sitemap" to="/sitemap">Sitemap</NavLink>
            <NavLink data-ogc-edit-text="shell.footer.privacy" to="/privacy">Privacy</NavLink>
            <NavLink data-ogc-edit-text="shell.footer.terms" to="/terms">Terms</NavLink>
          </nav>
        </footer>
      </main>
      <RightRail promoSelection={promoSelection}/>
    </div>
  );
}

function SignInForm() {
  const {kind,signIn, error: sessionError} = useMemberSession();
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
  if(kind==="member")return <Navigate to="/matches" replace/>;
  if(kind==="onboarding")return <Navigate to="/onboarding" replace/>;
  return (
    <section className="ogcl-view" aria-labelledby="ogcl-signin-heading">
      <header className="ogcl-view-head">
        <h1 id="ogcl-signin-heading">Online dating is dead because it sucks.</h1>
        <p>It doesn’t have to. We’re bringing back thoughtful profiles, real compatibility, and the gloriously weird internet where people actually got to know each other.</p>
      </header>
      <div className="ogcl-content-panel">
        <form className="ogcl-signin-form" onSubmit={submit}>
          <label>Email address<input name="email" type="email" required autoComplete="email" maxLength={254} /></label>
          <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
          <button type="submit" disabled={busy}>{busy ? "Checking account…" : "Sign in"}</button>
          {(error || sessionError) && <p className="ogcl-error" role="alert">{error || sessionError}</p>}
        </form>
        <p><NavLink to="/join">Make your profile</NavLink> · <NavLink to="/recover">Forgot your password?</NavLink> · <NavLink to="/verify">Verify email</NavLink></p>
        <p className="ogcl-note">New here? Create a free account to share more than a photo and a swipe.</p>
        <p className="ogcl-note"><NavLink to="/ogtrends">Read OgTrends</NavLink> · <NavLink to="/privacy">Privacy policy</NavLink> · <NavLink to="/terms">Terms</NavLink></p>
      </div>
    </section>
  );
}

function MemberGate({children,allowOnboarding=false}) {
  const {kind, error, refresh} = useMemberSession();
  if (kind === "member" || (allowOnboarding && kind==="onboarding")) return children;
  if (kind === "guest") return <SignInForm />;
  if (kind === "checking") return (
    <section className="ogcl-view"><p role="status">Checking your account…</p></section>
  );
  if (kind === "onboarding") return <Onboarding/>;
  return (
    <section className="ogcl-view" role="alert">
      <header className="ogcl-view-head"><h1>Account unavailable</h1></header>
      <div className="ogcl-content-panel">
        <p>{error || "We couldn't confirm your account status."}</p>
        <button type="button" className="ogcl-button" onClick={refresh}>Retry account check</button>
        <p><NavLink to="/signin">Try signing in again</NavLink></p>
      </div>
    </section>
  );
}

// Administration is independent of dating-profile onboarding. The admin
// Function still verifies JWT liveness AND database role before every call.
function AdminGate({children}) {
  const {kind}=useMemberSession();
  return kind==="onboarding"?children:<MemberGate>{children}</MemberGate>;
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
    "Visitor tracking isn't live yet. No activity is being recorded or invented."],
};

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to={defaultRoute} replace />} />
        <Route path="signin" element={<SignInForm />} />
        <Route path="join" element={<JoinForm/>} />
        <Route path="recover" element={<RecoveryForm/>} />
        <Route path="verify" element={<VerifyForm/>} />
        <Route path="onboarding" element={<Onboarding/>} />
        <Route path="account" element={<AccountManagement/>} />
        <Route path="persona" element={<PersonaRoute/>} />
        <Route path="ogtrends" element={<EmbeddedEditorial pageKey="ogtrends"/>} />
        <Route path="ogtrends/zero" element={<EmbeddedEditorial pageKey="zero"/>} />
        <Route path="ogtrends/perfect-profile" element={<EmbeddedEditorial pageKey="perfect-profile"/>} />
        <Route path="ogtrends/references" element={<EmbeddedEditorial pageKey="references"/>} />
        <Route path="privacy" element={<EmbeddedEditorial pageKey="privacy"/>} />
        <Route path="terms" element={<EmbeddedEditorial pageKey="terms"/>} />
        <Route path="contact" element={<ContactPage/>} />
        <Route path="sitemap" element={<SitemapPage/>} />
        <Route path="photos" element={<MemberGate><PhotoManager/></MemberGate>} />
        <Route path="matches" element={<MemberGate><MatchesView Photo={MemberPhoto}/></MemberGate>} />
        <Route path="profile" element={<MemberGate><ProfileEditor /></MemberGate>} />
        <Route path="settings" element={<MemberGate><ProfileSettings /></MemberGate>} />
        <Route path="profiles/:slug" element={<MemberGate><PublicMemberProfile Photo={MemberPhoto} /></MemberGate>} />
        <Route path="questions" element={<MemberGate allowOnboarding><MatchQuestions /></MemberGate>} />
        <Route path="quickmatch" element={<MemberGate><QuickmatchView Photo={MemberPhoto} /></MemberGate>} />
        <Route path="messages" element={<MemberGate><MessagesView /></MemberGate>} />
        <Route path="community" element={<MemberGate allowOnboarding><CommunityChat /></MemberGate>} />
        <Route path="admin" element={<AdminGate><AdminDashboard /></AdminGate>} />
        <Route path="messages/:peerId" element={<MemberGate><MessagesView /></MemberGate>} />
        {Object.entries(views).map(([path, [title, intro, footnote]]) => (
          <Route key={path} path={path} element={
            <MemberGate><PreviewView title={title} intro={intro} footnote={footnote} /></MemberGate>
          } />
        ))}
        <Route path="*" element={<section className="ogcl-view">
          <header className="ogcl-view-head"><h1>Page not found</h1></header>
          <div className="ogcl-content-panel">
            <p>That address doesn't exist on OG Cupid.</p>
            <NavLink to="/">Go to the home page</NavLink>
          </div>
        </section>} />
      </Route>
    </Routes>
  );
}
