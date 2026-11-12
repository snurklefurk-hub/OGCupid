# Account recovery and deletion — implementation status

Status: **production registration and member-owned deletion deployed**.
Last reviewed: 2026-11-12 UTC.
Related: [GitHub main](https://github.com/snurklefurk-hub/OGCupid/tree/main) and [historical draft PR #1](https://github.com/snurklefurk-hub/OGCupid/pull/1).

## Production self-service deletion enabled — 2026-11-12

Owner explicitly authorized enabling account deletion in **production** after
production member signup and persistence had been published. This is an
implementation/release record, not a claim that all future content moderation,
legal, privacy or hardening work is complete.

- **Backend:** main-branch `api/member-profile.ts` now permits `POST
  /account/delete` only when `NEON_BRANCH` is `production` or the named
  development branch **and** `OGC_ACCOUNT_DELETION_ENABLED=true` **and**
  a server-only `OGC_DELETION_DATABASE_URL` credential exists. The old
  development-only diagnostic route remains separately disabled.
  Production uses the fixed, Neon Auth-trusted
  `https://ogcupid.onrender.com` origin for current-password reauthentication,
  not the untrusted incoming request Origin.
- **Authentication:** API independently verifies the signed JWT; it rate-limits
  each owner to five deletion attempts per hour; then Neon Auth verifies the
  submitted current password, requiring Auth-returned user ID to **equal**
  the JWT subject. No client-supplied target account ID is accepted.
- **Production SQL:** [migration 006](../db/migrations/006_production_member_self_deletion.sql)
  applied on Neon branch `production`. A dedicated `ogcupid_delete_api`
  credential (NO BYPASSRLS; no direct table reads, writes or user deletion)
  can only execute a SECURITY DEFINER no-argument self-erasure function.
  Ordinary `ogcupid_member_api` cannot execute that function but may execute
  a separate attempt-throttling helper. Cascading Auth user FKs delete the
  current private profile, stored match answers, linked sessions, and attempts
  record. Backup retention remains governed by the service's actual policy.
- **Deployed:** production Neon Function `members` active **deployment #3**
  has status `completed`, with server-only deletion credential and enable
  flag present. GitHub `main` compiles the account page with production
  Auth/member endpoints; Render deployed the versioned member UI bundle in
  commit `65af7c79b430bfc442a2f96c85be74146292711d` with status
  **live**. Production signup remains email-OTP verified.
- **Safety checks (non-destructive):** the new database role lacks direct
  SELECT on `member_profiles` / `member_match_answers` and lacks direct
  DELETE on Neon Auth users; restricted role privilege checks passed.
  Frontend compiled code contains correct production endpoints and
  enables the deletion form for an authenticated user. No database credentials
  are exposed in the browser. Production had **zero Auth users, profiles
  and answers** during release verification; no existing account was deleted.
- **Unverified:** a genuine production browser POST involving an authenticated
  member, correct password and resulting self-deletion, as well as live
  previously-issued JWT replay and restore/retention workflows, were **not**
  exercised, per the owner's request to stop repetitive account exercises.
  The deployment completed, but an HTTP end-to-end successful account deletion
  must not be claimed without a real test.

**Earlier development sections below are historical milestones.** References
below to "production disabled", "not deployed", or a disposable-only SQL
allowlist describe the state *before* this production release and have been
superseded by the current status in this section.

## Current development state — signup and owner deletion ENABLED (2026-11-12)

**Product decision:** the owner asked to stop repeated disposable-account
security rehearsals and enable normal account creation and self-service
deletion while adding substantive dating-site data and features. Conduct
further comprehensive security and data-lifecycle reviews once the feature
set is ready. This authorization is limited here to the **isolated
development branch**; it is **not authorization to open public production
registration**.

**Implementation now enabled on development:**

- Neon Auth `dev/private-member-accounts`: email/password signup **allowed**,
  verification OTP **required**, and revoke sessions on password reset remains
  **true**. Production Neon Auth signup was independently confirmed
  **disabled**.
- Browser source on GitHub branch `feature/private-member-accounts`: signup
  and normal "Delete my account" form are available for all members on
  localhost without `VITE_OGC_REGISTRATION_ENABLED` or the obsolete
  `VITE_OGC_DELETE_TEST`. The disposable-only two-tab JWT test harness and
  hardcoded profile user ID restriction were removed from the local UI.
  The account-delete form still requires the current password and exact
  `DELETE` confirmation; no browser-provided target user ID is accepted.
- Development PostgreSQL migration
  `db/migrations/005_enable_dev_self_deletion.sql` replaces the
  historical single-disposable-ID SQL allowlist with a no-target-argument
  function deleting only the transaction-local member identity. The
  security-definer function is executable only by dedicated
  `ogcupid_delete_api`, **not** ordinary `ogcupid_member_api` or PUBLIC.
- The development `members` Function remains branch-scoped and requires
  its server-side `OGC_ACCOUNT_DELETION_ENABLED=true`; dev Neon Function
  deployment **#18 completed**. Separate reauth diagnostic
  `OGC_REAUTH_TEST_ENABLED=false`. Standard password recheck, JWT
  validation, 5/hour attempt limit, private-profile FK cascade, and
  active-member checks are retained.

**Independent non-destructive verification:** the dev database still has
5 Auth users / 5 private member profiles, including the separate temporary
account created for the paused token-replay test; none were deleted while
enabling this feature. SQL function has **no hardcoded allowed account ID**,
retains its self-target predicate, and ordinary member database role still
cannot execute deletion. Dev Neon Auth reports signup enabled and OTP email
verification required. Production Neon Auth signup reports disabled.

**Deployment scope:** GitHub client source changes are committed but
*still need to be pulled into the owner's locally running Vite app*. Neon
backend signup/deletion settings have already been applied. Production
Render/main branch, accounts, and authentication remain unchanged.

**Caveats for future product development:** this currently erases Auth user,
Auth linked credentials/sessions, and the current private profile via
foreign-key cascade; new question responses, photos, messages, and other
user-owned content must declare their ownership, retention and deletion
behavior before real launch. Valid-but-stale JWT HTTP replay, backup
retention, operational abuse defenses, moderation, privacy policy, and
production rollout review remain uncompleted and should be revisited as
the site's data model matures. **Do not mistake enabled development
features for security-reviewed public registration.**

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

## Self-service browser account deletion — PASSED (2026-11-12 UTC)

**Result:** the owner used the disposable development account to complete
email verification, password establishment, and verified browser sign-in.
Initial deletion attempts were correctly rejected while the server's raw
Better Auth sign-in call was missing a trusted `Origin` header; the resulting
attempts accumulated against the rate limiter. The owner demonstrated that
the identical password worked via the normal browser sign-in. The backend was
updated to use the fixed trusted development Origin and to accept either of
the provider's expected user-response shapes. A **non-destructive**
`/account/reauth-check` confirmed `verified:true, deleted:false` from
the browser without touching user data.

The owner then submitted `DELETE` and the same known-working password to the
development-only `POST /account/delete` endpoint. The browser displayed:
**"Your test account and linked profile were deleted. Database backups
expire according to their retention schedule."**

**Independently confirmed after the browser result via read-only PostgreSQL:**

| Check | Observed |
|---|---:|
| Total Neon Auth users, before -> after | 5 -> **4** |
| Total `app_private.member_profiles`, before -> after | 5 -> **4** |
| Deleted user row (disposable UUID only) | **0** |
| Deleted user's private profile | **0** |
| Deleted user's linked `neon_auth.account` rows | **0** |
| Deleted user's `neon_auth.session` rows | **0** |
| Deleted user's `app_private.member_deletion_attempts` rows | **0** |
| Established synthetic security-test private profiles | **2** unchanged |
| Temporary one-user SQL allowlist still installed | **Yes** |

The session results demonstrate **database-side cleanup of existing session
records**, including this test user's previously active sessions. This does
not by itself establish how quickly an already-issued JWT or cached browser
session fails across every route, or prove removal from snapshots/backups
before retention expiry. No files/photos, messaging, payments, or third-party
storage have been implemented for this member profile yet.

**Immediately after the owner's success message**, the development Neon
Function was switched back to
`OGC_ACCOUNT_DELETION_ENABLED=false` and
`OGC_REAUTH_TEST_ENABLED=false`. Neon **deployment #13 completed** and
`get_function` confirmed that deployment active. The test-only SQL allowlist
remains deliberately in place to prevent any other account from being erased
if a test flag is accidentally reenabled. The deleted disposable account's
UUID will never be reused. Both owner test accounts remain, all other
development records returned to the prior four/four baseline, and **nothing
was deployed or modified in production**.

**Acceptance:** end-to-end account deletion, current password recheck,
owner-only targeting, database cascade (profile + auth credentials + sessions),
per-user attempt log cleanup, and isolation from other dev accounts all passed
for one disposable member in the isolated development environment.

**Before public release:** remove all hardcoded development test-account IDs
and test flags, replace the one-user SQL allowlist only after a reviewed
production-safe authorization design, verify backup/retention notices, audit
log behavior, session/JWT behavior after deletion, uploads/media and future
associated records, abusive retry defenses, and production rollout controls.
The website is **not yet ready for public registration**.

## Deleted-member JWT hardening — prepared and SQL-tested (2026-11-12)

**Risk:** a cryptographically valid, short-lived JWT can outlive its
originating Auth user and session database rows. After our verified
self-service deletion, the existing profile API would return
`{profile:null}` for `GET /profile` and a generic database error for
`PUT /profile`. These results are misleading and do not explicitly reject a
deleted member identity.

**Fix in development feature branch:**

- Migration `004_active_member_guard.sql` defines
  `app_private.current_member_is_active()`, a narrow no-argument
  `SECURITY DEFINER` function that checks whether the authenticated
  request's transaction-local JWT subject still has a matching
  `neon_auth."user"` row.
- `ogcupid_member_api` may execute this function but still cannot read the
  Neon Auth user table directly. `ogcupid_delete_api` has no permission to
  execute the liveness function; it retains only its separate scoped
  deletion permission.
- The profile API calls the liveness function after validating the JWT and
  before **either** profile read or profile write. If absent, it responds
  `401 {"error":"Account no longer active"}`.
- On any profile API HTTP 401, the browser clears its cached profile,
  guest/member state, and attempts best-effort Auth signout. This avoids
  displaying the deleted profile on a stale browser tab.

**Tests completed (isolated development database, no new deletion):**

| Restricted role/context | `current_member_is_active()` |
|---|---|
| No member identity set | **false** |
| UUID of the account deleted in prior browser test | **false** |
| UUID of an existing synthetic test account | **true** |

Permission queries confirm that the ordinary role still has **no direct
SELECT** on `neon_auth."user"`; its execute grant is narrowly scoped to
the boolean helper. The separate deletion role cannot use it. User/profile
totals remain **4/4**. Frontend source passed JavaScript parsing and the
backend's GET/PUT 401 guard placement was checked.

**Deployment:** the migration has been applied to the development database.
The GitHub API and browser changes have **not yet been compiled/deployed** to
Neon Function and local Vite, respectively. The development deletion and
reauth diagnostics remain **disabled** (Function deployment #13). No
production changes were made.

**What this does not prove:** actual rejection of a *previously issued,
cryptographically valid JWT* by the deployed HTTP service, or immediate
revocation of a token by Neon Auth itself. Existing profile foreign keys
already prevent a deleted user from recreating the profile at database level.
An HTTP regression needs a safely captured disposable-token fixture in a
future isolated test with explicit permission. Never request or store the
owner's login tokens, passwords or OTPs in Notion.

## Stale, once-valid JWT replay — prepared, NOT yet executed (2026-11-12)

**Why another disposable member is required:** the prior successful
self-service account deletion removed its Auth sessions, and no previously
issued JWT was retained. Fabricating a token from the deleted user's ID
would not prove the authentication path. To test this end to end we need a
legitimate, **unexpired JWT that was accepted for a profile read BEFORE its
account was deleted**, then replay that exact bearer JWT afterward.

Created a fresh **disposable development Neon Auth user only**, with
member UUID `e948d6c8-192a-4c07-9e5b-a18c53b57bae`, named
`DISPOSABLE STALE JWT TEST`. The address is a test alias delivered to
the existing owner inbox; **do not store it, a code or password in
Notion/docs**. Neon Auth reports it as not yet email-verified, with one
linked Auth account but no session or profile. Preexisting accounts and
private profiles were untouched; DB now has five users and four profiles.

The isolated dev GitHub branch has a new browser-only,
`VITE_OGC_DELETE_TEST=true`-gated, exact-user-ID-gated **Stale token
security test** panel. Stage 1 obtains a legitimate JWT from the
member's authenticated browser session, checks subject/expiry, and proves
that exact JWT can `GET /profile` with HTTP 200. The JWT is held **only
in the JavaScript heap in that single browser tab**: no web storage,
network logging or transcript. Stage 2, from the still-open first tab,
replays the same JWT after the disposable member has been deleted from
another tab, expecting `GET /profile` and `PUT /profile` to each
return HTTP **401** while the JWT's `exp` remains in the future.
A `GET` response other than 401 stops before any write probe.
If token expiry is too close, the test is **inconclusive** rather than
being called a pass. No valid JWT string is printed to UI/logs.

**Safety before test:** the UI's destructive submit button is **disabled**
while setting up the account; the privileged eraser remains gated by its
old deleted account UUID in the dev SQL function, so it cannot delete
the fresh or existing accounts; Neon Function deployment **#15 completed**
with `OGC_ACCOUNT_DELETION_ENABLED=false` and
`OGC_REAUTH_TEST_ENABLED=false`. The four established member accounts
remain untouched. Static checks confirmed browser JS parses, all
referenced HTML IDs exist, and the negative test handles read and write
separately.

**Steps still pending:**

1. Owner updates the local Vite `index.html`/`main.js` from feature
   branch, confirms email and establishes a password for the new
   disposable account, then signs into it.
2. Owner uses the first browser tab to arm the valid-token test.
3. **Only after explicit readiness and permission** update the
   development-only SQL erase allowlist to this new UUID, restore its
   delete button, briefly enable only the dev deletion endpoint, then
   owner deletes this disposable member in another tab.
4. Owner immediately replays the cached original JWT from tab one; the
   assistant must independently inspect Auth+profile/session cleanup
   and disable the dev deletion endpoint immediately after receiving
   the deletion result.
5. Record HTTP GET/PUT status and whether the JWT was still unexpired.
   Maintain separation from public registration/production.

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

## Next acceptance tests

- Keep the destructive and diagnostic development routes disabled.
- Run regression tests for post-deletion stale JWTs/cached sessions (especially
  whether the profile API rejects a deleted identity cleanly).
- Determine documented data-retention, audit and backup policy before public
  launch; extend cleanup to photos/uploads and all future user-owned tables.
- Separately verify old-password rejection/parallel-session revocation after
  password reset, production build isolation, moderation and security review.
- Do not promote this dev-only endpoint with its hardcoded user allowlist.

**Never test deletion on the two established accounts or production.**
