# OGC-L: isolated Render staging deployment

Decision: owner approved a **separate** staging site for the React + Vite visual/architectural redesign on 2026-11-17. Production `https://ogcupid.onrender.com` and GitHub `main` must remain unchanged.

## Render static site (not an existing production service)

- GitHub repo: `https://github.com/snurklefurk-hub/OGCupid`
- Deploy branch: `OGC-lovable` (never `main`).
- Suggested service name: `ogcupid-l-staging`, if available.
- Service type: **Static Site**.
- Build command: `npm install --prefix ogc-l-react --no-audit --no-fund && npm test --prefix ogc-l-react && npm run build --prefix ogc-l-react`
- Publish path: `public/ogc-l`
- Auto-deploy: enabled for `OGC-lovable`; protected by tests and branch-specific build configuration.
- The staging build sets `OGCL_DEPLOY_BASE=/`. In-site /ogc-l preview builds omit it and use `/ogc-l/`. The isolated app's logo asset is copied from the approved repository brand file.
- Set `VITE_OGCL_LEGACY_ORIGIN=https://ogcupid.onrender.com` so incomplete React features (existing onboarding, account creation, password recovery, profiles and OgTrends) link to the actual old site, not broken paths on the new staging host.
- Set `VITE_OGC_AUTH_URL=https://ep-hidden-breeze-bbdn5nsb.neonauth.c-15.us-east-1.aws.neon.tech/neondb/auth`.
- Set `VITE_OGC_MEMBER_API_URL=https://br-plain-unit-bbcbxpqq-members.compute.c-15.us-east-1.aws.neon.tech/profile`.
- No `DATABASE_URL`, Neon API key, JWT, private key, or service secret is permitted in frontend `VITE_*` build variables.

## Authentication origin approvals (after Render assigns the exact URL)

Staging is a different browser origin from the existing production site. Neither the Auth trusted-origin allowlist nor the production Neon Member Function CORS policy currently includes the new origin.

1. Confirm the **exact** Render staging URL from service metadata. Never guess it.
2. Add that URL (and only that URL) to the Neon production branch Auth trusted-domain list using `add_auth_trusted_domain`. Existing registered origins stay in place.
3. Add that **exact** origin to the Neon Function's `Access-Control-Allow-Origin` allowlist, with the existing Bearer-token, RLS, member liveness and origin checks preserved. Verify both preflight OPTIONS and signed-in GET. Prefer a deliberate additive server configuration rather than a wildcard. Code and deployment updates should be versioned on OGC-L and independently verified.
4. Do not treat passing backend tests as a successful signed-in end-to-end browser session. Verify cross-site Neon cookies, valid JWTs, login/logout, expired account, onboarding redirect and member discovery using an explicitly authorized test member.
5. If cookie policy blocks cross-site sessions in a particular browser, verify that behavior and plan an appropriate first-party custom domain or approved auth flow. Never weaken cookie/security controls as a quick workaround.

## Acceptance criteria

- New static site loads at its own exact Render URL with HTTP 200, compiled CSS/JS and logo; no broken `/ogc-l/assets` reference on the staging root.
- Navigation uses `/#/matches` etc without server rewrites; left and right rails stay mounted, center pane scrolls independently on desktop.
- Legacy member links point to `https://ogcupid.onrender.com`.
- No Render settings, GitHub commits, or Neon data on production main site are changed merely to create staging.
- Authentication remains inaccessible until exact staging URL is trusted; no unsafe CORS wildcard and no secret in published bundle.
- When approved origins are configured, separately confirm signed-in read-only calls to `/onboarding`, `/profile` and `/discovery` and correct signed-out/expired-session behavior.
- Existing `main` and its associated live Render service remain the rollback implementation.

Current evidence: staging build variants and link routing have CI tests in the OGC-L branch. An actual Render staging service must be created and verified separately in the user's explicitly selected Render workspace.
