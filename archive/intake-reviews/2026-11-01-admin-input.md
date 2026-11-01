# OG Cupid: first Admin Input review — 2026-11-01

## Intake status

**23 files (1,327,866 bytes), 18 visually reviewed, 5 pending preview.**

The files remain untouched under `admin input/OGCupid/`. [Full itemized manifest](./2026-11-01-admin-input.json) contains each Git blob SHA, filename, bytes, topic, review status and privacy considerations. No filenames, original material, or screenshots were moved.

## High-value design references

| Historical file | Verified visual content | Use |
|---|---|---|
| [questions/okcqs.png](../../admin%20input/OGCupid/questions/okcqs.png) | Five importance levels, single member answer, acceptable partner answers, private option, optional explanation | **Top priority** compatibility question UI and data model |
| [questions/images.jpg](../../admin%20input/OGCupid/questions/images.jpg) | Later three-band importance control and padlock | Distinguish UI generations |
| [pages/okcdash.png](../../admin%20input/OGCupid/pages/okcdash.png) | Navigation, member recommendations, completion progress, activity feed | Dashboard inspiration |
| [pages/onlinedating_okcupid-625x625.webp](../../admin%20input/OGCupid/pages/onlinedating_okcupid-625x625.webp) | Member search filters and result cards | Member discovery |
| [profiles/gadget-dating-blogSpan.webp](../../admin%20input/OGCupid/profiles/gadget-dating-blogSpan.webp) | Older tabs: About / Photos / The Two of Us / Personality / Journal / Tests | Classic site/navigation layout |
| [profiles/527d51a86bb3f70a40e9b7dd.webp](../../admin%20input/OGCupid/profiles/527d51a86bb3f70a40e9b7dd.webp) | Long essays, profile details, last-online status | Long-form profile layout |
| [quizzes/okcper.png](../../admin%20input/OGCupid/quizzes/okcper.png) | Signed left/right personality comparison bars | Personality visualization |
| [messaging/okcmsg1.png](../../admin%20input/OGCupid/messaging/okcmsg1.png) | Timestamped messaging, reply box, block/report/delete | Messaging functionality and safety |

One surviving question is transcribed in [question-example.json](./2026-11-01-question-example.json).

## Important historical distinction

The screenshots **do not all represent the same version of OkCupid**. Early references show horizontal top navigation and journal/tests/awards; later examples show a deep-blue left sidebar and simpler About/Photos/Questions navigation. Treat them as **separate design eras**, with dates to be verified independently. We should not create an invented hybrid and label it an exact recreation.

The screenshots are **visual references, not site source code**. No recovered character artwork for the missing Dating Persona personas has been verified in this intake. The general “Improved: The OkCupid Test” graphic is **not verified** as an original Dating Persona character.

## Prioritized engineering takeaways

1. Build full compatibility-question record: selected own answer, allowed partner answers, importance, optional written explanation, private visibility.
2. Preserve long-form profile essays, strong edit controls, structured details, actual last-online times, rich member discovery filters and answers count.
3. Add match/friend/enemy percentages only when backed by real data and documented scoring; never fabricate.
4. Bring back journals/tests/personality views as **separate, intentional** navigation sections.
5. Treat block/report/messaging as functional safety features, not decorative buttons.

## Preservation and privacy

These images include **identifiable historic members, personal essays, and messages**, while the OG Cupid repository is **public**. **Do not copy their identifying content into our public live sample profiles or other marketing artifacts.** If we need to display them more broadly, make redacted derivatives and confirm rights to reuse. Old platform trademarks and images remain someone else's IP.

The five pending visual inspections comprise four AVIF images and one WebP that failed retrieval. The archive index records each as pending rather than guessing.

Next time the owner pushes a new intake commit, review only changed files and append a dated report. Keep the `admin input/` folder untouched so new drops remain obvious.
