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
