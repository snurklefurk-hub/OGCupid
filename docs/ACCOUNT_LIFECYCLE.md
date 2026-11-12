# Account recovery and deletion — implementation status

Status: **draft development feature, not public launch ready**.
Last reviewed: 2026-11-11 US Eastern.
Related: [Draft PR #1](https://github.com/snurklefurk-hub/OGCupid/pull/1).

## Password recovery

Implemented in the `member-app/` browser UI, behind the development
Neon Auth branch when running at localhost:

1. Guest clicks **Forgot your password?** and enters account email.
2. App calls Neon Managed Better Auth's Email OTP recovery endpoint:
   `auth.forgetPassword.emailOtp({ email })` (with a compatibility branch for
   `auth.emailOtp.requestPasswordReset({ email })` where exposed).
3. User enters the email code and a new 12–128 character password twice.
4. App calls `auth.emailOtp.resetPassword({ email, otp, password })` and
   returns to the sign-in screen.
5. Neon branch setting `revoke_sessions_on_password_reset=true` is
   confirmed on both dev and production branches. Users must sign back in.

The app does not read or store the code or password outside the active form,
does not put recovery tokens into URLs, and does not email codes itself.
Neon generates and emails codes subject to its expiration and throttling.
Use custom SMTP before public launch. Shared Neon test mail currently sends
from `auth@mail.myneon.app`.

**Owner-reported passed:** recovery email/code, new password, login after
reset, and preserved saved profile on the local member page. **Still to test
separately:** rejection of the old password and revocation of an already-active
second-browser session.

Official docs:
- https://neon.com/docs/auth/guides/plugins/email-otp
- https://neon.com/docs/auth/guides/password-reset

## Account deletion — development backend ready, destructive route OFF

Neon Managed Better Auth does not currently expose a confirmed server setting
to enable native `auth.deleteUser`. We therefore built a **separate,
server-authorized self-service deletion pathway** in the existing member
Function instead of handing out Neon administrative credentials.

The backend code is committed to `api/member-profile.ts`, but is **NOT YET
DEPLOYED**. The development database migrations have been applied; production
has not been changed.

### Security workflow

1. The browser sends `POST /account/delete` with the signed member JWT,
   account email, current password, and explicit `DELETE` confirmation.
   There is **no user ID** in the request. The site hides the action unless
   running on localhost with `VITE_OGC_DELETE_TEST=true`.
2. The backend is disabled unless it runs on the exact
   `dev/private-member-accounts` branch AND its server-only
   `OGC_ACCOUNT_DELETION_ENABLED=true` setting is explicitly enabled.
   Production cannot enable this route by setting an environment variable.
3. The Function verifies the EdDSA JWT against Neon Auth's published JWKS.
   The `sub` UUID is the *only* target identity.
4. A scoped rate-limiter allocates at most **5 attempts/hour/member**
   *before* any password verification call.
5. The Function sends the supplied email/password over HTTPS directly to
   the branch's Neon Managed Auth `/sign-in/email` endpoint. It accepts
   the confirmation only if Auth succeeds and **returns the same user ID
   as the verified JWT**. Credentials, provider cookies, and error details
   are never echoed or logged to the client.
6. The Function opens an entirely separate `ogcupid_delete_api` Postgres
   connection. That role has neither BYPASSRLS nor direct read/write on
   member or Auth tables; it can execute only the narrow
   `app_private.erase_current_member_after_reauth()` SECURITY DEFINER
   operation. The ordinary `ogcupid_member_api` profile role cannot
   execute that eraser.
7. The SQL eraser takes **no account ID**; it deletes exactly the UUID
   previously set as `app.current_user_id` by the server from the
   authenticated JWT. PostgreSQL foreign-key cascades remove linked
   profiles, credentials, and session records atomically.
8. The browser clears its local profile UI and attempts Auth cookie signout
   after confirmed success. Retained backups remain subject to a separate
   published retention period.

Database custom session GUC values are **not cryptographic credentials**;
the trust boundary is the isolated server-only database connection and
the backend's JWT/password verification. The special delete-role URI is
stored in the Neon development Function environment as
`OGC_DELETION_DATABASE_URL`, never in Git or the browser.

### Verified security controls

Applied migrations `002_member_self_deletion.sql` and
`003_separate_account_deletion_role.sql` on the **development branch only**.

- `ogcupid_member_api`: can access private profiles and use the deletion
  attempt limiter, **cannot execute the privileged erase function**.
- `ogcupid_delete_api`: can execute the erase function, **cannot directly
  SELECT the member profiles or DELETE from Neon Auth users**;
  `rolsuper=false` and `rolbypassrls=false`.
- Both no-context deletion helper calls returned `false` in read-only
  negative tests. Four existing development accounts and profiles remain
  intact.
- Development Function deployment #4 is an environment-only update: both
  original `DATABASE_URL` and dedicated `OGC_DELETION_DATABASE_URL` keys
  were verified; it still serves the previously deployed API source.

### Remaining test gates

- [ ] Deploy updated backend source to development (no destructive flag).
- [ ] Confirm unauthenticated `POST /account/delete` cannot succeed and
      disabled route returns not-found.
- [ ] Obtain a **new disposable development account with a genuine password**.
      Never delete either established owner test account.
- [ ] Explicitly enable the backend deletion flag *on development only* and
      the local frontend test flag. Confirm wrong-password and wrong-email
      rejection, quota handling, and successful owner-only deletion.
- [ ] Confirm all dependent records and active sessions are gone, other
      users unaffected, and that stale JWTs cannot recreate private data.
- [ ] Security review: provider rate limits, SQL SECURITY DEFINER hardening,
      network access to the DB role, Auth provider behavior, backup retention,
      media cleanup, and account deletion audit policy.
- [ ] Design production rollout with separate, branch-specific restricted
      credentials. This development endpoint explicitly refuses production.

Sources:
- https://better-auth.com/docs/concepts/users-accounts
- https://neon.com/docs/compute/functions/authentication.md


## Isolated development deletion test — PASSED (2026-11-12 UTC)

With the owner's explicit authorization, used Neon administration **only** on
`dev/private-member-accounts` (branch `br-empty-lab-bbjb0q1u`) to create and
delete exactly one synthetic disposable Auth user.

- Baseline: **4** Auth users and **4** private profiles (two existing owner test
  accounts + two established synthetic security-test accounts).
- Created disposable Auth user ID:
  `a5f68c0f-dc52-40dd-820c-70221d405f91`.
- Added one private profile linked to that ID. Both counts became **5**.
- Reconfirmed the disposable ID, email, and profile before deletion.
- Called Neon administrative `delete_auth_user` for **that ID only**.
- Queried tables afterward: **0** rows for that user ID in
  `neon_auth."user"`, `neon_auth."account"`,
  `neon_auth."session"`, and `app_private.member_profiles`.
- Total counts returned to **4** Auth users and **4** private profiles;
  original synthetic security-test profiles also remained unchanged.

This confirms successful administrative deletion and the expected
`ON DELETE CASCADE` cleanup of the associated private profile. It does
**not** prove browser self-service deletion, password reauthentication,
revocation of a preexisting active session (none was established for this
disposable user), or immediate erasure from retained database backups.
Neither of the owner's established test accounts was deleted or modified.
Production branch remains untouched.

**Next:** test the newly drafted, independently reauthenticated member
endpoint on a *new* disposable development account after deployment and
explicit enabling. No further account erasure has occurred or been authorized
solely by this historical administrative cascade test.

## Reauthentication regression and safe diagnosis (2026-11-12)

**Owner confirmed:** the disposable user can sign OUT and sign IN normally with
the same password that deletion failed to reauthenticate. Therefore do not
instruct another password reset. The original deletion backend's raw
`fetch(NEON_AUTH_BASE_URL + "/sign-in/email")` request had no explicit
`Origin` header, and suppressed all upstream status/error codes. Better Auth
may reject such a request for CSRF/origin reasons, but the actual root cause
is **unconfirmed** until diagnostics run. It also initially assumed only
`response.user.id` rather than accepting a wrapped `response.data.user.id`.

**Change:** GitHub feature branch now has a **non-destructive**,
member-authenticated `POST /account/reauth-check` route. The route is
entirely absent except on the isolated dev branch with *both*
`OGC_REAUTH_TEST_ENABLED=true` and
`OGC_REAUTH_TEST_USER_ID` matching the designated disposable account's
ID. It confirms the JWT subject matches that user ID, reserves an ordinary
rate-limit attempt, posts to Neon Auth from a **fixed trusted localhost
origin**, and returns only sanitized stage/status/allowlisted error codes
instead of secrets or credentials. A match produces
`{verified:true,deleted:false}` and returns **before** the SQL erase call.
The browser test form now shows only for that disposable account, and has
a separate **Check password safely (no deletion)** button.

The privileged `/account/delete` route remains disabled with server-only
`OGC_ACCOUNT_DELETION_ENABLED=false`. Neon Function deployment **#10**
updated **environment configuration only**, enabling the isolated diagnostic
route but not deploying the new source yet. The existing #10 code does not
contain that route; a **new source deployment is needed** before testing.

Dev SQL attempted attempts counter had reached 6 from repeated failed
verification tests. While deletion was disabled, the single disposable
member's hourly window start was advanced 61 minutes into the past, retaining
its historical count, so its *next* properly rate-limited check can start a
new window. No account was deleted; 5 users and 5 profiles remain; the
test-only SQL allowlist is intact. Do not reset or bypass the limiter for
other users or production.

**Next acceptance:** sync/deploy the updated Function to the **development**
branch only; sync local `member-app/index.html` and `main.js`; ask owner to
click *Check password safely* with the same known-working password exactly
once; inspect whether `verified:true,deleted:false`, or a diagnostic
stage/status/code. Recheck database and clean up the diagnostic flag before
allowing an actual deletion test. Never share passwords or raw provider
responses in chats/logs.

See Better Auth origin security guidance:
https://better-auth.com/docs/reference/security

## Safety / deployment state

- Development and production signup are **disabled server-side**.
- New frontend signup UI defaults to disabled even on localhost, unless
  `VITE_OGC_REGISTRATION_ENABLED=true` is explicitly set.
- No production Neon Function/schema changes.
- No Render deployment and no GitHub branch merge.
- Never test password recovery or deletion with production accounts until
  the full security checklist is completed.
- Member profile access and session isolation still use the previously
  deployed verified JWT, restricted Postgres role, and forced RLS policy.
- Open registration remains blocked on custom SMTP, tested restore/backups,
  account deletion, privacy policy and retention, moderation, and abuse
  controls.

## Next acceptance test: gated self-service deletion

Download the updated `api/member-profile.ts` from the feature branch and
deploy it to the linked **development** Neon Function *without enabling
deletion*. Inspect the deployment, then test a disabled call. Account deletion
must remain off until a disposable, email-verified password account can
exercise correct-password and wrong-password paths safely.

**Never test deletion on the two established accounts or production.**
