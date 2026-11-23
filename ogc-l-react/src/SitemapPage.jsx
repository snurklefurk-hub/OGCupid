import React from "react";
import {NavLink} from "react-router-dom";
import {SITEMAP_SECTIONS,SITEMAP_PATHS} from "./sitemap-pages.mjs";
import "./sitemap.css";

export default function SitemapPage(){
  return <section className="ogcl-view ogcl-sitemap" aria-labelledby="ogcl-sitemap-title">
    <header className="ogcl-view-head">
      <h1 id="ogcl-sitemap-title">Sitemap</h1>
      <p>Every OG Cupid page in one place, except individual member profiles and private message threads.</p>
    </header>
    <div className="ogcl-content-panel">
      <p className="ogcl-sitemap-intro">{SITEMAP_PATHS.length} pages · Member-only pages
        require sign-in. Administrator controls require an admin account.</p>
      <nav className="ogcl-sitemap-grid" aria-label="OG Cupid page directory">
        {SITEMAP_SECTIONS.map(section=><section className="ogcl-sitemap-group"
          key={section.title} aria-label={section.title}>
          <h2>{section.title}</h2>
          <ul>{section.items.map(page=><li key={page.path}>
            <NavLink to={page.path}>{page.label}</NavLink>
            {page.access!=="public"&&<small className="ogcl-sitemap-access">
              {page.access==="admin"?" · Admin only":" · Members"}
            </small>}
            <span>{page.note}</span>
          </li>)}</ul>
        </section>)}
      </nav>
      <p className="ogcl-sitemap-footer">Looking for somebody's profile? Use
        the <NavLink to="/matches">Matches</NavLink> page instead.</p>
    </div>
  </section>;
}
