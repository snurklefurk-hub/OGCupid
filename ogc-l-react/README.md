# OGC-L — React + Vite app-shell migration

A **visual and architectural redesign** of OG Cupid. The owner chose React + Vite with React Router, retaining existing Neon Auth, Neon Member Functions and Postgres. This directory is isolated from the legacy website.

## Status as of November 17, 2026

- Existing `main` and live `/account/` and `/profiles/` pages are untouched.
- This React shell is developed on `OGC-lovable` through reviewed feature branches.
- Shared 16/68/16 desktop frame, centered-only scrolling, four primary tabs, secondary Questions route, mobile preview fallback.
- **Connected real membership**: Neon Auth getSession, opaque-cookie -> short-lived JWT exchange, server-verified `GET /onboarding`, read-only `GET /profile` and `GET /discovery`, sign-in and sign-out.
- Sign-in uses existing Neon accounts. Creation, recovery, and unfinished onboarding still link to the established account app. No duplicate user database.
- Member-only views are fail-closed while identity or onboarding is unverified. Expired/deleted accounts and 401s never reveal member information. Private notes, email, answers and location/DOB data are not placed into shell state.
- Discovery scores are provisional real backend results. Unscored profiles remain visible with a label; no fake scores, visitor activity or messages.
- Photo thumbnails, in-React profile editing and Questions authoring still need porting. The first React build is **not** feature-complete or production deployed.

## Setup (explicit environment, no fallback)

```bash
cd ogc-l-react
npm install
VITE_OGC_AUTH_URL=https://YOUR_NEON_AUTH_HOST/neondb/auth \
VITE_OGC_MEMBER_API_URL=https://YOUR_APPROVED_NEON_MEMBERS_FUNCTION/profile \
npm run build
npm test
```

Only **public service URLs** belong in Vite `VITE_*` values—never a database connection string, Neon API secret, JWT, password or storage key. Without both HTTPS URLs, the React app stays disabled for member authentication and shows an explicit configuration error.

The existing production Auth/member API CORS restrictions allow only approved OG Cupid origins. A separate Render staging domain requires an explicit, reviewed backend CORS allowance before authenticated browser testing there. Do not bypass origin controls or silently target the development database.

## Routing and publishing

- Vite writes solely under `public/ogc-l/`; the historical site is not overwritten.
- Temporary `HashRouter` makes routes reachable at `/ogc-l/#/matches` without new Render rewrite rules. Switch to `BrowserRouter` only with tested production deep links.
- `npm run dev` uses the existing Vite local development setup; do not confuse a build passing in CI with a signed-in browser end-to-end pass.
- The session provider lives **above** route components so navigating doesn't recreate Neon Auth. On tab return it rechecks after 60 seconds and clears old member state before starting any identity verification.

## Regression tests

`npm test` covers route invariants, signed-in/out behavior, cookie-to-JWT exchange, onboarding-first checks, deleted session and 401 behavior, secondary data outages, safe member/public fields and no silent sign-out success.

## Next safe steps

- Confirm the site builds from a pinned lockfile, and deploy the branch to an isolated Render preview with CORS reviewed for that origin.
- Verify real sign-in, sign-out, deleted/expired sessions, onboarding redirects, profile URL and discovery on the approved test domain with a disposable member account.
- Migrate nine essays, photo controls, Questions and Messages individually, checking that existing Neon persistence and ownership rules remain intact.
- Only after owner-approved live QA, make the existing Render site deploy OGC-L instead of `main`, preserving the old branch as a rollback.
