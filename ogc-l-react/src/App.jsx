import React from "react";
import { Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";
import { defaultRoute, primaryNavigation } from "./navigation.mjs";

const previewOnly = "Layout preview — member data and account actions are not connected yet.";

function LeftRail() {
  return (
    <aside className="ogcl-left" aria-label="Primary navigation">
      <a className="ogcl-brand" href="/account/" aria-label="OG Cupid existing member site">
        <img src="/brand/ogcupid-logo-white.png" width="218" height="54" alt="OG Cupid" />
      </a>
      <nav className="ogcl-primary" aria-label="OG Cupid main">
        {primaryNavigation.map(({ path, label, icon }) => (
          <NavLink key={path} to={path}
            className={({isActive}) => isActive ? "ogcl-nav-link active" : "ogcl-nav-link"}>
            <span aria-hidden="true">{icon}</span>{label}
          </NavLink>
        ))}
      </nav>
      <section className="ogcl-left-note" aria-label="Suggested members">
        <h2>You might like</h2>
        <p>Verified member recommendations will appear after the existing authenticated discovery service is connected.</p>
      </section>
    </aside>
  );
}

function RightRail() {
  return (
    <aside className="ogcl-right" aria-label="Account and discovery">
      <section className="ogcl-side-card">
        <h2>Your profile</h2>
        <p>Profile completion and thumbnail will be read from the existing Neon member API.</p>
        <a href="/account/">Open your existing account</a>
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

function PreviewView({ title, intro, footnote }) {
  return (
    <section className="ogcl-view" aria-labelledby="ogcl-view-title">
      <header className="ogcl-view-head">
        <h1 id="ogcl-view-title">{title}</h1>
        <p>{intro}</p>
      </header>
      <div className="ogcl-content-panel">
        <h2>Under construction</h2>
        <p>{footnote}</p>
        <p className="ogcl-note">{previewOnly}</p>
      </div>
    </section>
  );
}

const views = {
  matches: {
    title: "Matches",
    intro: "Find people worth getting to know.",
    footnote: "This will use the existing authenticated GET /discovery service. No invented match percentages or profiles."
  },
  messages: {
    title: "Messages",
    intro: "Conversations, not swipes.",
    footnote: "Messaging is not enabled in the existing backend. No fabricated conversations."
  },
  visitors: {
    title: "Visitors",
    intro: "Who's been stopping by.",
    footnote: "Visitor tracking isn't live yet. Nothing is being recorded or claimed."
  },
  quickmatch: {
    title: "Quickmatch",
    intro: "A little serendipity, without endless swiping.",
    footnote: "A real member's profile will be drawn from the discovery API after sign-in."
  },
  questions: {
    title: "Match questions",
    intro: "Better answers, better conversations.",
    footnote: "The established question flow and persisted answers remain in the existing member app until safely migrated."
  }
};

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to={defaultRoute} replace />} />
        {Object.entries(views).map(([name, view]) => (
          <Route key={name} path={name} element={<PreviewView {...view} />} />
        ))}
        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
      </Route>
    </Routes>
  );
}
