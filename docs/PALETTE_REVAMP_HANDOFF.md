# Palette revamp — handoff (2026-11-17)

Branch `feature/palette-revamp`, worktree `ogc-palette-revamp/`, based on `origin/main` @ `de3dd88`.
**Local only: not pushed, no PR.**

## Goal

Restyle all OGC pages to look like logged-in OkCupid c. 2013, desktop first.
Mobile can be dealt with later, either with CSS or as a separate mobile site.

## Specs (read in this order)

1. `../research/design/okc-period-style-addendum.md`: **authoritative**. It
   was taken from real screenshots and corrects the Lovable card.
2. `../research/design/okc-2011-palette-card.md` / `.png`: the Lovable card.
   Use its colors and components only where the addendum doesn't override
   them. Ignore its "rules" section, which is an artifact of a vague prompt
   (no backend, static data, etc.).
3. `../research/design/period-refs/`: the screenshots. `useronboard-slide-0xx.jpg`
   is the primary reference. `okc_quickmatchmatches.png` is the 2015 flat
   redesign, so use it for layout only.

## Owner decisions

- Start fresh from main. `ogc-2011-integration` is retired: its WIP is saved in
  `../archive/2011-integration-wip/` and its branch is kept locally.
- Use the full component styling, not just colors.
- All pages get the revamp.
- Style for modern displays. The owner uses 1080p, and the Review pane is
  about 856px wide, so it has to look right at both.
- Keep the right rail even without ads. Fill it with promos so ads can drop in
  later without a redesign.

## Done

- `public/okc-period.css`: a new opt-in layer that applies only to
  `<body class="okc">`. It loads after `okc-2011.css` and contains:
  - the three-column grid (fluid up to 1280px)
  - the navy left rail with icon rows and badges
  - top-right text links
  - the gradient page-title header
  - the callout with a speech tail
  - white cards on `#f7f7f9`
  - small gradient buttons
  - right-rail promo and ad slots (`.okc-rbox`, `.okc-slot`)
  - the footer
  - container and media breakpoints

  `okc-2011.css` is unchanged.
- `index.html` (landing page) has been converted to the new markup: rail nav,
  toplinks, a right rail with 3 promo boxes, and the wave removed. It was
  verified at 856px.

## Next

1. Convert the other public pages with the same markup pattern as
   `index.html`: contact, privacy, terms, ogtrends (+ subpages), questions,
   quiz, profiles, 404. Note that `public/brand/classic-rail.js` injects a rail
   on `.site` pages; reconcile it with `.okc-railnav`.
2. Member app (`member-app/`, built into `public/account/`): add the shell
   markup and the components from addendum §4–6 (profile header with tabs,
   question block, details table, Match/Friend/Enemy stat box, essay pencils).
3. Replace the placeholder nav glyphs (♥ ☻ ? ★ ✎ ✉) with proper small icons.
4. Once every page is on `body.okc`, retire `lovable-home.css`,
   `member-home-theme.css`, `legal-home-theme.css` and `ogtrends/home-theme.css`.
5. Cache-bust the stylesheet links (`?v=`), check the 1080p and 856px widths,
   push and open a PR.

## Local preview

`node C:\Users\Lou\AppData\Local\Temp\opencode\ogc-serve.cjs "<worktree>"`
serves the site at http://127.0.0.1:4173/ (use 127.0.0.1, not localhost).
It's a scratch static server that maps `/` to `index.html` and everything else
to `public/`.
