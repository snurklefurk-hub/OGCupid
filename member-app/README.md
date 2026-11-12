# OG Cupid member site (development)

**Not live; not production-ready.** This folder is the source for the real
`/account/` experience. The legacy `dev/account-smoke/` harness remains as a
small regression test. The existing public homepage, quizzes, and OGTrends
are intentionally untouched.

## Architecture

- Managed Neon Better Auth: email signup, OTP verification, sessions
- Neon Function `members`: owner-scoped profile reads and writes via JWT
- PostgreSQL `app_private.member_profiles` with forced RLS and a **restricted**
  `ogcupid_member_api` connection role. Never use `neondb_owner` for this API:
  that role has `BYPASSRLS` and would defeat isolation.
- Vite creates a static build in `../public/account/`, not a new server.
  The Render static-site build must compile this before publication.

## Local development

The development Neon API currently permits the origin
`http://localhost:5173`. Stop any older Vite server using that port first.
From `member-app/` run:

```bash
npm install
npm run dev
```

Visit `http://localhost:5173/`. Only localhost automatically connects to
the **isolated development branch**. Existing test accounts can sign in and
save/load their own profile. Signup is independently controlled by Neon Auth;
it is currently **disabled** on the development branch after the tests.

The source does not store passwords, OTPs, or JWTs in localStorage, console
logs, GitHub, or HTML. The session is managed by Neon Auth.

## Production build / release behavior

```bash
npm install
npm run build
```

The output is generated at `public/account/` and is intentionally ignored
by Git. A future Render build should compile the member app and then preserve
the current homepage build. **Do not update Render or merge this branch until
all release gates have passed.**

Non-local builds have no backend endpoints by default. To connect to **the
production branch**, a deliberate release must set these *public* Vite build
variables, then rebuild:

- `VITE_OGC_AUTH_URL` — production Neon Auth base URL (not a secret).
- `VITE_OGC_MEMBER_API_URL` — production member Function URL (not a secret).
- `VITE_OGC_REGISTRATION_ENABLED=true` only after the server-side production
  signup gate is intentionally opened and independently verified.

Never set production URLs to the dev branch. Never put `DATABASE_URL`,
`AWS_SECRET_ACCESS_KEY`, or any auth/admin secret in a `VITE_*` variable.

The account page includes `noindex` while under development.
The registration button is disabled unless the build explicitly specifies
`VITE_OGC_REGISTRATION_ENABLED=true` **and** the branch's server-side
registration setting is separately enabled. Existing accounts can still log in.

Password recovery uses Neon's supported Email OTP endpoints. The owner has
successfully tested a recovery email/code, reset, re-login, and preservation
of the saved profile. Old-password rejection and an already-active session's
revocation remain separate acceptance tests.

A custom deletion endpoint is drafted because managed Auth has no exposed
switch for native Better Auth hard deletion. It uses independently verified
JWT and account password, a five-attempt/hour rate limit, and a separate
database credential that can invoke only a narrowly scoped erasure function.
**It has been deployed and end-to-end tested on one disposable development
account; deletion and diagnostic endpoints were disabled again after success.**
The API requires both
the exact development branch and `OGC_ACCOUNT_DELETION_ENABLED=true`; the
browser form also requires localhost and
`VITE_OGC_DELETE_TEST=true`. Both flags are OFF by default. Read
[account lifecycle notes](../docs/ACCOUNT_LIFECYCLE.md) first.

## Tested in the isolated development environment

- Two real email-verified test users can sign in/out and persist separate
  private profiles (owner-reported browser test).
- Unauthenticated GET /profile returned 401.
- Scoped Postgres role cannot bypass RLS.
- SQL-level cross-user reads/updates denied; forged cross-user upsert rejected.
- The locally tested signup display name now prepopulates a blank profile.

## Production launch BLOCKERS

- [x] New member page loaded in browser; existing sessions, login/switching,
      private profile auto-load verified by owner on localhost.
- [ ] Verify production role-specific connection (no owner/BYPASSRLS), proper
      CORS/origin policies, and HTTP cross-user isolation.
- [x] Owner browser-tested email-code password reset, new login, and intact
      profile. See [account lifecycle notes](../docs/ACCOUNT_LIFECYCLE.md).
- [ ] Verify recovery edge cases: expired OTP, old-password rejection and
      revocation of already-active sessions in another browser.
- [x] Draft isolated, rate-limited backend deletion path with dedicated
      least-privilege database role and server-side password recheck.
- [x] Deploy and exercise the scoped development self-deletion endpoint
      using an email-verified disposable account. Real password verified,
      browser deletion succeeded; read-only database checks confirmed
      Auth user, linked credentials, private profile, active sessions, and
      test throttling row all gone; four existing accounts/profiles intact.
      Development deletion/diagnostic routes were re-disabled immediately
      afterward (Neon Function deployment #13).
- [ ] Generalize/review deletion for production, publish privacy and consent
      policy and backup/retention disclosures, verify stale-JWT behavior,
      and extend cleanup to all future member-owned assets/data.
- [ ] Configure production auth trusted domains, branded/custom SMTP, and
      disable production localhost acceptance.
- [ ] Review defenses against signup abuse, credential stuffing, and API
      flooding; choose edge rate limiting and an abuse response process.
- [ ] Protect user photos and strip EXIF/GPS before upload. No uploads or public
      member discovery are offered in this page.
- [ ] Establish adequate backups/restore beyond Neon's 6-hour free-history
      window; test one restoration before public signup.
- [ ] Validate mobile accessibility, session recovery, error states, no
      cross-account data leaks, and privacy/security notices.
- [ ] Resolve copyright/trademark questions about recovered legacy artwork,
      and finalize terms and safety/moderation rules before wider public access.

Current release status: **development draft PR only, production signup locked**.
