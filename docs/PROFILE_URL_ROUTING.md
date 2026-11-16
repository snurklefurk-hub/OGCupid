# Authenticated display-name profile URLs — routing and release notes

Entrypoint: /profiles/index.html with /profiles/view.js and view.css.
No member data is embedded in the initial HTML. Unauthenticated visitors
are redirected to the normal welcome page at / after Neon Auth validation.
JSON and photo requests require a server-verified JWT and active member status.

## Required Render static-site rewrite

The existing ogcupid static site is not Blueprint-managed, so a new render.yaml
file alone would not change its active routing configuration.

On the EXISTING Render service (do not create another service), open
Dashboard > ogcupid > Redirects/Rewrites > Add rule:

Source: /profiles/*
Destination: /profiles/index.html
Action: Rewrite (not Redirect)

Keep existing rules. Do not use a /* catch-all because it would alter
Contact, OgTrends, account, and static-file routes.

A public/404.html JavaScript bootstrap temporarily handles deep links while
the rewrite is unavailable to the current connected Render tools. It is
not a substitute for the rewrite: HTTP status on fallback can remain 404.

## Verification after applying the rewrite

1. Signed out: direct /profiles/poopoo URL and refresh should redirect to /,
   with no profile text or photo bytes exposed.
2. Owner signed in: direct URL shows live profile with pencil edit controls;
   save each field, reload, and verify. Add, select, and remove photos.
3. Different signed-in member: profile is read only; cross-member writes
   rejected by API and RLS.
4. Duplicate signup names get separate name and name-2 slugs. Editing
   preserves the original slug.
5. Questions tab hides is_private answers, and never shows personal notes,
   acceptable answers or importance. Profile JSON excludes email, DOB,
   credentials and photo object keys.
6. Test mobile, browser history, blocked cookies, deleted sessions, and
   HTTP 200 on canonical member profile direct links.

## Data and ownership

Neon migrations 017 and 018 provide stable unique slugs, authenticated
read policies and peer-photo bytes. Owner-write policies remain in effect.
The Neon API /profiles/:slug returns a whitelisted profile plus isOwner
computed from the verified JWT; /profile GET/PUT remains owner-only and
now returns the slug. The account app sends completed members to the
canonical URL for editing, while unfinished members retain onboarding.

Unrelated November 16 local-only dashboard experiment remains unmerged;
do not conflate it with this profile page implementation.
