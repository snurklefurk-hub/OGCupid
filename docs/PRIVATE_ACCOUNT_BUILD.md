# Private member accounts — security gates and integration

Status (2026-11-11): **DRAFT / NOT DEPLOYED**. Production signups are disabled.
This work is on GitHub `feature/private-member-accounts` and Neon
`dev/private-member-accounts`. Do not apply the migration or function
to the production branch without a completed auth/privacy test.

## Foundation

- `db/migrations/001_private_member_profiles.sql`: owner-only profile table
  with `FORCE ROW LEVEL SECURITY`, no PUBLIC schema/table privileges, and
  verified-auth-user transaction context (`app.current_user_id`).
- `api/member-profile.ts`: PUT/GET member's own profile only, JWT verified
  against Neon Auth JWKS and issuer; no user ID accepted from the request body
  or path; exact browser origin list; SQL parameterization; no secret logging.
- Auth lives in Neon Managed Better Auth, not in the member API.
- Photos remain disabled; the existing Neon `uploads` bucket is private.
- Sign-up remains disabled in production until all checks below pass.

## Wiring still required

1. Review the *local* generated `neon.ts` and preserve existing auth/storage
   settings; add the member Function declaration (slug `members`, source
   `api/member-profile.ts`). Do not overwrite the generated file blindly.
2. Install backend dependencies (`pg`, `jose`, `@neon/functions`, and
   TypeScript types as appropriate). Review npm audit and bundle behavior.
3. Deploy on `dev/private-member-accounts` first; Functions must receive
   Neon's injected `DATABASE_URL`, `NEON_AUTH_BASE_URL`, and
   `NEON_AUTH_JWKS_URL`. Never put these credentials into browser code.
4. Build browser account pages with the supported `@neon/auth` client
   and proper cross-origin handling; no ad-hoc auth protocol.
5. Add only the intended web origins to Neon Auth's trusted domains and
   confirm the site's HTTPS certificate is valid.
6. Configure production custom SMTP for Neon Auth email delivery and
   test sign-up, verification, reset, and session revocation.
7. Provide a privacy policy, terms, age-18 declaration and account deletion
   path before collecting public account data. The current age check is
   an attestation, not independent identity/age verification.
8. Enable recoverable backups and test a restore. Free tier's six-hour history
   is insufficient as the sole durable recovery plan.

## Required negative tests (two distinct synthetic users A and B)

- [ ] Anonymous GET/PUT /profile => 401; invalid JWT => 401.
- [ ] Tokens issued for a different Neon project/issuer => 401.
- [ ] Cross-origin browser requests from untrusted Origin => 403.
- [ ] A writes/reads A; B writes/reads B; they see only their own records.
- [ ] Request-supplied owner ID is ignored; no path can read another user.
- [ ] Query without transaction-scoped `app.current_user_id` returns no rows,
      even when database owner executes the query.
- [ ] SQL injection and HTML/script payloads cannot execute or cross accounts.
- [ ] Profile state survives logout/login, browser refresh, and backend restart.
- [ ] Password reset revokes sessions; unverified email cannot sign in.
- [ ] Profile and email never appear in GitHub, logs, static JS, public HTML,
      unauthenticated API responses, or publicly discoverable object URLs.
- [ ] Backend uses restricted database credentials and protected transport.
- [ ] Backups, retention, deletion, monitoring, and abuse-rate limits tested.

## Release rule

**Do not enable production signups** until this checklist is verified and the
owner agrees to the public beta scope. A commit or a function deployment is not
proof of a secure end-to-end registration system.


## Verified development-role and isolation testing (2026-11-11)

The first API deployment inherited Neon's `DATABASE_URL` for `neondb_owner`,
a role with `rolbypassrls=true`. **FORCE ROW LEVEL SECURITY is not
effective for BYPASSRLS roles.** This was caught during security verification
before public registration.

Correction, applied to the *development branch only*:

- Provisioned `ogcupid_member_api` as a Neon `read_write` role scoped
  to database `neondb` and schema `app_private`. Verified
  `rolsuper=false`, `rolbypassrls=false`, and no create-role or
  create-database privileges.
- Through the Neon admin connection, obtained a role-specific connection
  string **without displaying or storing the password in code or docs**.
- Redeployed the `members` Function with a user-defined `DATABASE_URL`
  environment override for the scoped role. This overrides Neon's default
  injected owner string; Neon returns environment variable *names*, not values.
  Deployment 2 completed.
- **Important operational rule:** each target branch, including production,
  needs its own scoped role and protected runtime connection override before
  deploying the member API. Never allow a release to fall back to the branch
  owner's automatically injected `DATABASE_URL`; it bypasses RLS. A normal
  `neon deploy` retains variables not declared in `neon.ts` per Neon docs,
  but verify the function deployment's effective role before trusting it.
- The developer's local `.env.local` still contains Neon-generated owner
  URLs. Do not use those URLs to run production member API code.

**Passing test results (scoped role against dev branch):**

- Unauthenticated deployed HTTP `GET /profile` returned 401.
- No transaction-scoped user identity: SELECT returned zero profiles; UPDATE
  changed zero rows.
- Two synthetic Neon Auth identities were created on the development branch
  for database-level testing. A could see its one record and not B; B could
  see its one record and not A.
- Attempts to UPDATE the other user's row affected zero rows.
- An attempt to insert/update B's identity under A's transaction context failed
  with PostgreSQL `42501`, RLS policy violation.

**Still unverified:** valid JWT HTTP GET/PUT from sign-in sessions,
registration/email OTP, profile survival through login/logout, rate limits,
frontend integration, DNS/HTTPS, backups/restore, and production role isolation.
Do not enable public signup or mark this release production ready.



## Local browser smoke-test harness

A non-production test UI is committed under `dev/account-smoke/`:
`index.html`, `main.js`, and an isolated `package.json`.
The UI uses the official `@neon/auth` client and the development branch's
public Auth URL; it has **no database credentials or server secrets**.
Run only on `http://localhost:5173` with Vite. It tests email OTP signup,
sign-in/out, JWT retrieval, private profile GET/PUT, and persistence.

The `members` Function source permits localhost:5173 **only when**
`NEON_BRANCH=dev/private-member-accounts`; all other branches retain the
production web origins only. This source change is not deployed until the
development Neon Function is redeployed.

Keep development public signup disabled until the local UI is running.
Enable it only on the development Neon Auth branch for manual email-verification
testing; keep production signup disabled. After testing, disable dev signup.
Never send real passwords or OTP codes in ChatGPT messages.

Owner's local project is not automatically synchronized with GitHub PR files.
They may download the test harness and revised API source from the PR branch
before a subsequent `neon config plan` and safe development redeploy.
