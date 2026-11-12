# OG Cupid member site (development and production)

**Live at https://ogcupid.onrender.com/account/ since 2026-11-12.**
Production account creation, saved profiles, match answers and owner-only
self-deletion are enabled. Full public-launch security, privacy and moderation
hardening remains open. This folder is the source for the real `/account/` experience. The legacy `dev/account-smoke/` harness remains as a
small regression test. The existing public homepage, quizzes, and OGTrends
are intentionally untouched.

## Architecture

- Managed Neon Better Auth: email signup, OTP verification, sessions
- Neon Function `members`: owner-scoped profile reads and writes via JWT
- PostgreSQL `app_private.member_profiles` with forced RLS and a **restricted**
  `ogcupid_member_api` connection role. Never use `neondb_owner` for this API:
  that role has `BYPASSRLS` and would defeat isolation.
- Vite creates a static build in `../public/account/`, not a new server.
  Render currently serves the **prebuilt, versioned** assets committed into
  `public/account/`; its build command does not rebuild this app. Future
  frontend changes require an explicit Vite build and published assets.

## Local development

The development Neon API currently permits the origin
`http://localhost:5173`. Stop any older Vite server using that port first.
From `member-app/` run:

```bash
npm install
npm run dev
```

Visit `http://localhost:5173/`. Only localhost automatically connects to
the **isolated development branch**. Members can now create accounts (email
verification by OTP), sign in, save profiles, and delete their own accounts
with their current password plus a DELETE confirmation. Both signup and
self-service deletion are enabled for iterative development. Production
registration is also enabled, requiring email OTP verification.

The source does not store passwords, OTPs, or JWTs in localStorage, console
logs, GitHub, or HTML. The session is managed by Neon Auth.

## Production build / release behavior

```bash
npm install
npm run build
```

The output is generated at `public/account/` and normally ignored by Git;
the production deployment explicitly commits the generated artifacts (forced
Git add) so Render can serve them. Do not assume changing this source file
alone updates the production website. Eventually update the Render build to
compile the member app rather than depending on prebuilt assets.

Non-local builds have no backend endpoints by default. To connect to **the
production branch**, a deliberate release must set these *public* Vite build
variables, then rebuild:

- `VITE_OGC_AUTH_URL` — production Neon Auth base URL (not a secret).
- `VITE_OGC_MEMBER_API_URL` — production member Function URL (not a secret).
- `VITE_OGC_REGISTRATION_ENABLED=true` for current production builds; the
  production Neon Auth signup gate was independently checked as enabled.

Never set production URLs to the dev branch. Never put `DATABASE_URL`,
`AWS_SECRET_ACCESS_KEY`, or any auth/admin secret in a `VITE_*` variable.

The account page includes `noindex` while under development.
The registration form is enabled automatically on localhost, where the
isolated Neon Auth development branch also allows signup. Non-local builds
require an explicit `VITE_OGC_REGISTRATION_ENABLED=true` and a separately
enabled server-side signup setting. Existing members can still sign in.

Password recovery uses Neon's supported Email OTP endpoints. The owner has
successfully tested a recovery email/code, reset, re-login, and preservation
of the saved profile. Old-password rejection and an already-active session's
revocation remain separate acceptance tests.

The custom deletion endpoint was successfully exercised end-to-end with
a disposable development member. It independently verifies a signed JWT,
reauthenticates the *same* member using their current password, limits
deletion to five attempts per hour, and uses a separate database role with
permission only to invoke the no-target-parameter erasure function.
As of 2026-11-12, owner-authorized self-service deletion is enabled on
**both the isolated development site and production**. Development migration
005 removed the temporary disposable-only allowlist; production migration
006 adds its own dedicated deletion role and function. The browser form is
shown on authenticated deployments; the API permits only explicitly named
development or production Neon branches with
`OGC_ACCOUNT_DELETION_ENABLED=true` and a server-side
`OGC_DELETION_DATABASE_URL` credential. It rechecks the current password,
verifies the same account ID, and limits deletion to five attempts/hour.
Production Neon Function deployment #3 completed; Render published the
versioned member app build in commit `65af7c79b430bfc442a2f96c85be74146292711d`.
The old reauth diagnostic route remains disabled. Existing database FKs
cascade deletion to saved match answers and private profiles; future owned
content and media must define equivalent lifecycle behavior.

## Tested in the isolated development environment

- Two real email-verified test users can sign in/out and persist separate
  private profiles (owner-reported browser test).
- Unauthenticated GET /profile returned 401.
- Scoped Postgres role cannot bypass RLS.
- SQL-level cross-user reads/updates denied; forged cross-user upsert rejected.
- The locally tested signup display name now prepopulates a blank profile.

## Post-launch security and feature hardening backlog

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
- [x] Add restricted, server-context active-user lookup on the
      isolated development branch and verify SQL behavior for deleted,
      missing and existing member IDs (migration 004).
- [ ] Deploy the updated profile API and browser UI to development,
      validate HTTP 401 for a deleted member's previously issued JWT,
      and verify the stale profile UI is cleared.
- [x] Enable scoped production self-deletion with dedicated no-table-access
      role, verified JWT/current password, throttling, and cascades for
      current profile and saved question answers (migration 006).
- [ ] Publish privacy/consent policy and backup/retention disclosures,
      verify stale-JWT behavior end-to-end, and extend deletion cleanup to
      future member-owned assets/data. No live production account was
      created/deleted for a destructive test.
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

Current release status: **production site LIVE; signup and self-deletion
backend/UI enabled on November 12, 2026**. No production destructive
end-to-end browser test has been run; remaining security and compliance
items are tracked above. Public user registration has no current members.
