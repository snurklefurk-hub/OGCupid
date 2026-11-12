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

**Not yet user-tested:** OTP delivery, code acceptance, old-password
rejection, new-password acceptance, and session revocation with the current
version of the SDK. These are explicit acceptance tests, not assumed successes.

Official docs:
- https://neon.com/docs/auth/guides/plugins/email-otp
- https://neon.com/docs/auth/guides/password-reset

## Account deletion

**NOT enabled.** A draft native Better Auth deletion form exists in the member
page, but is invisible unless (a) running at localhost and (b)
`VITE_OGC_DELETE_TEST=true` is explicitly configured. The form requires a
current password plus typing `DELETE`, and would call
`auth.deleteUser({ password })` against the authenticated account. No
user-supplied account ID goes to a privileged endpoint.

The normal Better Auth server leaves account hard deletion **disabled by
default**; the available Neon Managed Auth settings do not expose the
necessary server-side option. Do not assume this operation works. Do not
enable the testing flag until provider support has been confirmed and a
disposable development user is available. Never use the owner's two existing
test accounts as deletion targets without their explicit approval.

A read-only development database inspection confirmed
`app_private.member_profiles.user_id` references
`neon_auth."user"(id) ON DELETE CASCADE`. That means a *successful auth user
deletion* should remove its private profile automatically. Verify with a
disposable user, including associated Auth sessions and any future user-owned
tables/assets; do not claim erasure of backups immediately (backup expiry
follows retention policy).

If Managed Auth does not support native deletion, implement a **separate
reviewed self-service deletion mechanism** with independent identity
reverification, server-only scoped credentials, atomic cleanup and audit,
and an appropriate user-visible completion status. Do not grant the profile
API ownership of Neon Auth tables or embed an admin/owner connection string
in client JavaScript.

Official reference:
- https://better-auth.com/docs/concepts/users-accounts

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

**Next:** implement a secure member-initiated deletion path with fresh
identity verification and minimal server authority; test it end-to-end on
another disposable development account, then verify session and asset cleanup.
Do not enable the hidden client deletion form until server support is
confirmed. No additional destructive action is authorized by this test.

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

## Next acceptance test: password recovery

With the local member-app running (stop previous server on port 5173), sign
out and open **Forgot your password?**. Use one existing *development* test
account you control. Request the email code, enter it and the new password.
Then sign in with the new password and confirm the correct private profile
remains. Also confirm the old password is rejected. Inspect the exact error
message (without sending codes/passwords) if any step fails.

**Do not enable deletion testing yet.**
