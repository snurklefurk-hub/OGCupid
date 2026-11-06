# OG Cupid — minimal visitor counts

Status: **ACTIVE**. Site visitor-count events go to
`https://ogcupid.goatcounter.com/count` through the small first-party script
`public/visit-counter.js`. We deliberately do **not** install GoatCounter's
standard `count.js` because it would also send page-level information.

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

## Activated setup

GoatCounter site: https://ogcupid.goatcounter.com/

The owner supplied the endpoint on November 5, 2026. It is now configured
in `public/visit-counter.js`. All public pages already load that first-party
script, and Render redeploys automatically from `main`.

**Owner privacy setting:** In GoatCounter's dashboard, open
**Settings → Data collection**, and keep **Individual pageviews** disabled
(the documented default). Disable any extra breakdown categories that
aren't needed (browser/device/location/referrer) in the provider settings.

To check totals, open https://ogcupid.goatcounter.com/ and sign in if needed.
Look for two events: `first-visit` and `return-visit`. Returning visits
are counted only after an 8-hour gap in the same browser. A new/incognito
browser tests the first-visit event. No API key or password is embedded.

**GoatCounter's default pasted snippet is intentionally not installed.**
The custom script sends only a fixed event type using the documented stable
`/count?p=...&e=1` pixel interface, with an empty title and referrer.
Ordinary network metadata (such as IP address and user agent) is visible
to GoatCounter while handling requests, but is not included as an event
field. GoatCounter says it keeps those details only temporarily in memory
for visit deduplication.

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
