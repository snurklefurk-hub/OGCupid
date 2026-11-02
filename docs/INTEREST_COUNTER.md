# OG Cupid interest clicker — operations

The homepage footer section contains a playful old-school interest clicker.

## Shared tally

- **Counter key:** `ogcupid_community_interest_v1_20261101_5575603`
- **Backend:** third-party, no-signup CountAPI instance at `https://countapi.mileshilliard.com`.
- **Read tally without incrementing:** [View current tally](https://countapi.mileshilliard.com/api/v1/get/ogcupid_community_interest_v1_20261101_5575603)
- **Increment endpoint (do not open unless you intend to add a click):** `https://countapi.mileshilliard.com/api/v1/hit/ogcupid_community_interest_v1_20261101_5575603`
- Data is **shared across browsers and survives page refreshes** if the provider retains its database. Requests to read are not counted as clicks.
- The page re-reads the global tally on load, when returning to the tab, and approximately every 30 seconds when visible.
- Clicks are queued and transmitted sequentially to avoid inaccurate parallel write results; failed calls do not intentionally report a recorded click.
- No cookies, signups, email addresses, or individual identifiers are added by OG Cupid's clicker code.

## Important operational caveats

This is a **public third-party counter**, not an OG Cupid-owned production database. Its published API supports setting values by knowing the key, and the provider controls its data retention and uptime. It is therefore a *fun public interest signal*, not a tamperproof audit log or guaranteed durable business metric. The public API can be rate-limited or unavailable. If it fails, the page displays an error rather than inventing a persisted total.

As OG Cupid develops its own backend, migrate the current total to an authenticated first-party storage service (e.g. database + atomic increment endpoint) and remove the third-party dependency. Protect the write endpoint against unintended automated traffic as appropriate, while still allowing enthusiastic repeat clicks.

## Manual checks

1. Open [the live homepage](https://ogcupid.onrender.com/#interest) and wait for the digits to load.
2. Click the button three times; the total should increase three times.
3. Reload the homepage; the count should remain and load from the remote service.
4. Open the same page in another browser/device; it should show the shared total.
5. Open the read endpoint above to see the current value in JSON.

**Do not edit the key or reset the provider counter without deliberately migrating the existing total.**
