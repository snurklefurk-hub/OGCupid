# OG Cupid — 2011 visual design contract

**Approved:** November 16, 2026. Basis: owner's uploaded image, “OkCupid, circa 2011 — Design Token Card.” This is styling guidance for OG Cupid, not permission to copy historic OkCupid branding, user profiles, copyrighted creative, or compatibility math.

## Palette — exact sRGB tokens

| CSS token | Hex | Use |
| --- | --- | --- |
| --okc-blue | #2963a4 | Background, links, main buttons |
| --okc-blue-top | #3a77b8 | Top chrome glow |
| --okc-blue-light | #3d85ce | Button top stop; focus ring |
| --okc-navy | #183b62 | Sidebar and navigation |
| --okc-navy-deep | #0b2847 | Flat dark buttons, search well |
| --okc-navy-line | #244a73 | Nav 1px highlight |
| --okc-navy-shadow | #0a2847 | Nav divider, block drop |
| --okc-sky | #d5e1ed | Text on navy, muted labels |
| --okc-sky-mid | #8fb3d6 | Muted labels / placeholder |
| --okc-pink | #f83265 | Match accent |
| --okc-pink-dark | #d21d51 | Match border/shadow |
| --okc-green | #63a62f | Answered / completed |
| --okc-green-dark | #4c9020 | Active text |
| --okc-green-pale | #e8f2e0 | Active list row |
| --okc-paper | #f6f6f6 | Content paper |
| --okc-paper-dim | #e9e9e9 | Tab strip bottom |
| --okc-ink | #555555 | Body |
| --okc-ink-soft | #999999 | Metadata |
| --okc-ink-strong | #303030 | Strong text |
| --okc-heading | #264e79 | Essay heading |
| --okc-qblue | #2a5a94 | Question blue |
| --okc-line | #dddddd | One-pixel hairline |
| --okc-rowline | #c2d4e6 | Member row divider |
| --okc-pale-blue | #e7eef5 | Secondary accent |
| --okc-yellow | #f5e663 | View-my-profile hover |
| --okc-gold | #f4b402 | Stars |
| --okc-black | #111111 | Black gloss CTA |
| --okc-white | #ffffff | Cards / insets / light logo |
| --okc-footer | #222222 | Dark footer ink |

Use these tokens rather than hardcoded near-matches in new components.

## Typography

- Verdana first, then "Bitstream Vera Sans", "DejaVu Sans", Geneva, sans-serif.
  No Inter, Poppins or system-ui for UI.
- Page h1 26px / 28px regular; section h2 22px / 26px regular.
- Percentage box 17px / 23px centered (pink Match, green Friend, gray Enemy).
- Question text 15px / 21px bold blue; essay heading 14px bold blue.
- Body copy 13px / 21px; base 12px / 19px; fine print 11px / 16px.

## Components, layout, and shape

- Source reference fixed 1150px centered wrap: left bar 215px, content 935px,
  top strip 64px, main navigation 48px. Keep modern responsive stacking for
  mobile because user previously required mobile-browser functionality.
- Navy sidebar/nav with 1px dividers; active rows green-pale with green text.
- okc-nav: navy gradient and 1px dividers; okc-tab: paper-dim strip with
  active tab merged into white panel; okc-percent-box: white, centered,
  pink/green/gray trio; okc-btn: 30px glossy black/blue/pink/green button
  with 3px corner radius; okc-side-list: dim paper rail, green active row;
  okc-nav-search: navy-deep with sky-mid placeholder; okc-thumb-shadow:
  1px white padding + 1px gray line and soft image shadow.
- All hairlines 1px. No giant 2xl radii, glassmorphism, big drop shadows,
  decorative icons, emoji badges, ALL-CAPS tracked labels or purple/indigo
  gradients on white. Restrict gradients to navy and glossy button fills;
  use restrained 4–8% vertical lightness changes.
- Pink is reserved for Match and relevant compatibility emphasis;
  green means answered/completed; never fabricate Match scores or activity.
- Keep OG Cupid's own white logo, user-facing content, all dynamic controls,
  forms, auth and private data rules. The older cream/pink OgTrends magazine
  cover remains editorial artwork rather than a reusable UI treatment.
- The token card also described a Match formula for a different reference
  project. Styling approval does not approve or implement that math.

## Code locations / maintenance

- Shared 29-token CSS and overrides: public/okc-2011.css.
- This CSS must load LAST in each of the 16 HTML entrypoints.
- For Vite member builds, member-app/vite.config.js reorders the published
  stylesheet links to keep the 2011 layer last.
- Feedback widget: public/feedback-widget.css, loaded by feedback-widget.js.
- Do not add a second copy of the tokens in each page's old stylesheet.
- Source image supplied by owner in the November 16, 2026 conversation.
- Verify in browser: Home; four OgTrends pages; Contact/Privacy/Terms;
  logged-in and logged-out member routes; Persona; owned/peer profiles and
  photo editor; mobile and desktop. No content or backend changes implied.
