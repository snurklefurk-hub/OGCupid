# OG Cupid — classic desktop UI handoff (November 18, 2026)

## Authority and intent
The user's November 18, 2026 approval authorizes an implementation pass, not another round of wireframes. The visual authority is the owner-supplied circa-2014 OkCupid screenshot, the OG Cupid [project wiki](https://app.notion.com/p/4159a21787a881238b23e4b72cabd9bd), and the [2011 design token contract](./OGC_DESIGN_2011.md). The reference image itself was not available as a byte-backed asset in this session; Notion's precise descriptions guided this first pass. Never copy the screenshot's depicted member, advertisements or old OkCupid wordmark.

## Newly implemented React pieces
- `ogc-l-react/src/App.jsx`: small royal blue top strip; Profile · Settings · Sign out; five compact dark-navy navigation rows (MATCHES, MESSAGES, VISITORS, QUICKMATCH, COMMUNITY); compact OG Cupid wordmark in the upper-left blue frame.
- `ogc-l-react/src/ClassicSidebar.jsx`: floating navy profile tile with a **real member-only primary photo** in a circle, no visible label or completion text; one separate actionable refinement tile; three site-promo tiles in each desktop rail.
- `ogc-l-react/src/classic-editorial.mjs`: exact pool of 20 approved site promotions and 5 profile-refinement cards. Six site cards are drawn without duplicate entries per page refresh and remain stable across route changes. Unshipped destinations are inert; no fabricated ads, visitors or unread counts.
- `ogc-l-react/src/QuickmatchHearts.jsx` and `QuickmatchView.jsx`: original SVG arrow-shot Like heart and deflated Dislike heart. Voting still requires confirmed Neon persistence. No Undo or artificial mutual status. Skip for now appears only with at least four OTHER eligible candidates.
- `ogc-l-react/src/PublicMemberProfile.jsx`: square portrait, pink name and compact metadata, About · Photos · Questions · Personality tabs, approximately 60/40 About essays/details, green owner pencil links and in-place owner essay edits. Tabs show only genuine data already in the authorized member API.

## Design maintenance
Keep desktop 16/68/16 outer columns and center-only vertical scroll. Use Verdana, #2963a4 royal blue, #183b62 navy, #0b2847 ink navy, #f83265 match pink, #63a62f edit green. Small type and hairline borders; no oversized glassy SaaS cards. The desktop additions are at the end of `ogc-l-react/src/styles.css`; keep desktop-specific overrides inside the `min-width:801px` media query. The mobile web redesign is separate and is not part of this pass.

## Working boundaries and honest gaps
- The photo-only **You might like** widget strictly requires genuine >75% question matches with verified <=100-mile member-profile distance. The current discovery payload does **not** supply authenticated distance metadata, so no distant/unknown-distance members are invented as “nearby” photos. To populate this widget, add a privacy-reviewed server-derived proximity field without exposing exact coordinates. No fallback portraits or fake scores.
- The canonical profile's Photos tab can currently show the member's authorized primary JPEG; multi-photo gallery and owner upload/edit remain in the established legacy member app until native media methods are brought over.
- The Looking For panel displays saved interested-in and relationship-goal values. The peer API does not yet return the complete four-group preferences (including age-range and distance), so missing values are not fabricated.
- The Questions tab shows the genuine count of public saved responses rather than pretending the complete public answered-question browser or trait dashboard exists.
- VISITORS and COMMUNITY currently have honest nonfunctional placeholders. No profile-visit tracking, community posts, or activity badges are fabricated.
- Sign-in uses existing Neon Auth; profile/photo reads, Quickmatch decisions, messaging, and per-essay writes remain JWT-scoped. Do not replace these with localStorage or hardcoded demo data.
- Work targets Render `ogcupid-l-staging` deployed from `OGC-lovable`. Existing Render `main` site remains a separate live fallback.

## Lovable refinement target
Refine **visual details** in the rendered 1920×1080 signed-in desktop interface: profile floater positioning/scale, logo size, icon silhouettes, nav hairlines, promo tile alignment, photo crops, pink name baseline, heart geometry, and editorial typography. Prioritize matching the owner screenshot's placement and proportions. Do **not** reimagine layout or introduce swipe mechanics. Existing privacy/behavior and exact owner decisions are constraints, not optional rough concepts.
