# OG Cupid — minimal visitor counts

Status: code is installed but **disabled** until the site owner supplies a
GoatCounter endpoint. The website must not send hits to a guessed account.

## What is counted

Two aggregate totals only:

- `first-visit`: the first time a browser with localStorage visits OG Cupid.
- `return-visit`: a later visit after **at least 8 hours**.

Reloads, navigation, and repeat activity during the same 8-hour window don't
trigger a new event. A different browser/device or cleared browser storage
appears as a new browser. These are approximate browser counts, **not unique
people**. Browsers blocking analytics or storage will be undercounted.

## What we do NOT transmit or store

The OG Cupid tracking code sends only one of two **fixed event names** to
GoatCounter. No IDs, emails, page URLs, titles, queries, referrers, IPs, browser
fingerprints, geolocation, demographics, or individual browsing histories are
included in the event. The browser stores only a boolean seen flag and the
timestamp of the last reported count in its own localStorage. These stay on
the visitor's device and are never uploaded. No tracking cookies are set.

As with *any* HTTP endpoint, the analytics server receives transport headers
including the connecting IP address and user-agent. GoatCounter documents
using those in **temporary memory** for session deduplication (up to 8 hours),
not storing them on disk. To keep their backend aggregate-only, use their
privacy/data-collection settings below.

## One-time activation

1. Create a free GoatCounter site at https://www.goatcounter.com/ .
   Hosted GoatCounter is free for reasonable small-site and small-business use.
2. In **Settings → Data collection**, **disable individual pageview collection**,
   and **disable browser, operating system, location, language, device/screen
   and referrer collection**. (These are optional in GoatCounter.)
3. Edit `public/visit-counter.js` and change
   `const ENDPOINT = "";` to
   `const ENDPOINT = "https://YOUR-REAL-CODE.goatcounter.com/count";`
   substituting the endpoint actually assigned to your GoatCounter site.
   Do **not** put an account password or API key into JavaScript.
4. Publish `main` normally. Render automatically deploys it.
5. Visit the site in a normal browser and check the two fixed events:
   `first-visit` and `return-visit`. A return is counted only after 8 hours
   in the same browser. A separate browser tests the first-visit counter.

The counter deliberately excludes non-production hosts, Do Not Track
and Global Privacy Control browsers, and browsers without localStorage.

**Limitations:** It cannot recognize a human across devices or browser
resets. GoatCounter's own 8-hour session deduplication and ad blockers may
suppress some legitimate counts. Network errors can cause lost counts, and
automated/spoofed requests can inflate public counters. No historical counts
can be recovered before activation.

Provider docs:
- https://www.goatcounter.com/help/privacy
- https://www.goatcounter.com/help/pixel
- https://www.goatcounter.com/help/sessions
