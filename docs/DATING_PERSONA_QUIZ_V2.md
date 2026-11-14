# Dating Persona Quiz v2 — November 13, 2026

Owner authorized production publication, creative control over new questions/answers, preservation of all original personas, incorporation of recovered questions, direct result text, and removal of Wayback captures.

## Implementation
- 40 items: 20 statements, 16 detailed scenarios, 4 historical/reconstructed items. Four pages of 10; variable choice counts and full-width detailed answers.
- Four independent axes: planning/spontaneity; consideration/self-prioritization; romantic/physical priorities; uncertainty/practiced confidence.
- Each answer has an explicit score on one axis. Zero means balanced/not-applicable; unrelated historical interludes are unscored.
- Sum, then majority, then earliest strongest direction breaks ties. No directional evidence defaults to the first letter. This deterministic fallback is disclosed, not a claim of certainty.
- Historical four-letter codes and 32 existing names are unchanged. Complete recovered originalWriteups are preserved verbatim; partial openings retained.
- The Bachelor, Stiletto, Poolboy, and 5-Night Stand have labeled revival summaries where full original wording is absent from the supplied collection. These summaries are not transcriptions.
- No archive iframe, capture-toggle button, or public archive links. Source provenance remains in code/research.
- No account data, backend, auth gate, or persistence changes. Answers remain ephemeral within the page.

## Historical item provenance
The local research/09-persona-question-recovery.md is the supplied evidence ledger. Original weights are unknown; no weight is represented as recovered.
- Mother/father: https://www.reddit.com/r/OkCupid/comments/3urme2/i_improved_my_personality_with_one_simple_trick/ . Prompt and two choices recovered; neutral opt-out added. Unscored.
- Logic: https://www.tapatalk.com/groups/l_anon/the-dating-persona-test-t3567723-s90.html#p16116825 . Prompt and four choices recovered. Unscored; not a proxy for romantic skill.
- Commitment: https://www.tapatalk.com/groups/l_anon/the-dating-persona-test-t3567723-s120.html#p16623730 . Recovered prompt, newly written answers/scoring. Explicitly mutual temporary arrangements support Gentle; concealed intent supports Brutal.
- Sacrifice: https://www.tapatalk.com/groups/l_anon/the-dating-persona-test-t3567723-s30.html#p4970390 . New combined reconstruction of the reported 10/10,000 pair, disclosed in UI. Unscored.
- Boat scenario: https://forums.ohtori.nu/viewtopic0a22.html?id=846&p=3 . Topic-only inspiration; question and answers newly written, not a recovered quotation.

## Result summary references
The supplied catalog provided the archetypes/partial text. Additional corroboration for the short, newly written summaries:
- Bachelor: https://clubsnap.com/threads/what-dating-type-u-belong-to.279255/
- Stiletto: https://www.sixtwentysevenblog.com/2008/10/stiletto.html
- Poolboy: https://forums.anandtech.com/threads/okcupid-take-this-test-about-you-and-love-accurate.1334430/page-2
- 5-Night Stand: supplied surviving opening and DBSM mapping.
No new full third-party result transcription is claimed.

## Verification
Run `node --test member-app/persona.test.mjs` (also included in member-app npm test).
Tests execute the actual inline quiz script against a small DOM harness: all 16 outcomes reachable, 32 results render meaningful copy, historical interludes score zero, explicit mutual casual agreement remains Gentle, variable options/back/retake/share routes work, and removed archive controls are absent. Browser QA uses a disposable local fixture with the auth gate omitted only in that fixture, never in production.
