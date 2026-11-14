# OG Cupid private beta feedback inbox

## For testers

A small **LEAVE FEEDBACK** tab appears in the bottom-right corner of OG Cupid pages. Click it to write a note of up to 1200 characters. It records the page on which the note was drafted. Submitted feedback is private, not a message to other members and not a live support chat.

Sign-in is required to submit feedback (anonymous input is disabled to reduce spam). If someone starts a note on a public page without an available member session, the draft stays in the browser's session storage while they visit **/account/** and sign in. The draft is erased when it is successfully submitted. Each account can submit at most two notes per rolling minute and thirty per rolling day.

## Owner review — Neon SQL editor

Open **Neon → OG Cupid → production branch → SQL Editor**. Run this **read-only** query using the database owner connection, not the restricted member API credentials:

```sql
SELECT
  f.id,
  f.submitted_at,
  f.user_id,
  COALESCE(p.display_name, '(account deleted or no profile)') AS display_name,
  f.page_path,
  f.message
FROM app_private.site_feedback AS f
LEFT JOIN app_private.member_profiles AS p
  ON p.user_id = f.user_id
ORDER BY f.submitted_at DESC
LIMIT 200;
```

This owner-only inbox has **no public GET endpoint**. Ordinary members cannot list, modify, or delete feedback. The site never sends user identities to the browser as part of another member's feedback.

For a count of unread notes, use your last review timestamp:

```sql
SELECT count(*) AS notes_since_last_review
FROM app_private.site_feedback
WHERE submitted_at > TIMESTAMPTZ '2026-11-13 00:00:00+00';
```

Replace the date/time with when you last reviewed. No reminder or automatic monitoring is currently configured.

## Data and security details

- Migration: `db/migrations/017_site_feedback.sql`.
- Authenticated endpoint: `POST /feedback` on the existing Neon `members` Function, protected by member JWT verification and active-account checks. Request JSON: `{"message":"text","pagePath":"/account/"}`.
- Body size, message size, allowed page paths, and rate limits are enforced server-side. The user ID comes from the JWT and **cannot be supplied as a request parameter**.
- Each note stores its text, sanitized pathname (no query strings or URL tokens), submission time, and account ID. No raw IP or browser fingerprint is stored in this feature's table.
- When an account is deleted, its reference is set to NULL but its feedback note remains for beta review; this behavior is disclosed in the privacy policy. To erase a specific note after a privacy request, a privileged operator must do so through reviewed deletion procedures.
- The client stores an **unsent** draft only in tab-scoped sessionStorage. It does not store authentication tokens or passwords.
- No member-facing inbox, admin page, public chat room, or email notifications are implemented. Feedback must be reviewed in Neon SQL Editor until a separate admin review interface is approved.

## Deployment and verification

Apply migration 017 before deploying the updated `members` Function and before making the feedback widget live. Backend regression test: `node --test api/member-feedback.test.js`. Member/frontend tests and Vite build should continue to pass.

**Test first:** sign in as one of the owner's designated test members, open the panel on /account/ and /account/persona.html, submit a harmless note, and confirm it arrives in the owner-only SQL query. A test note from a public page may require first signing in. Confirm anonymous attempts are rejected, rate limits work, and feedback from one account cannot be read through the member API.

This is a private beta feedback feature, not a user-to-user chat.
