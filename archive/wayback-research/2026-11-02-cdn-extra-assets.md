# Additional CDN and archive discoveries — 2026-11-02

Read-only research; no live website content changed.

## Verified live CDN assets

Each file below was opened in the browser and returned an image with the stated natural dimensions.

| Asset | CDN URL | Dimensions |
|---|---|---|
| Extra Nurse illustration | [/graphics/nurse2.gif](https://cdn.okccdn.com/graphics/nurse2.gif) | 150 × 152 |
| Slut Test icon | [/graphics/tests/icon_slut.gif](https://cdn.okccdn.com/graphics/tests/icon_slut.gif) | 60 × 60 |
| Politics Test icon | [/graphics/tests/icon_politics.jpg](https://cdn.okccdn.com/graphics/tests/icon_politics.jpg) | 60 × 60 |
| Death Test icon | [/graphics/tests/icon_death.gif](https://cdn.okccdn.com/graphics/tests/icon_death.gif) | 60 × 60 |
| Virgin Game icon | [/graphics/tests/icon_virgin.jpg](https://cdn.okccdn.com/graphics/tests/icon_virgin.jpg) | 60 × 60 |
| Gaydar Test icon | [/graphics/tests/icon_gaydar.jpg](https://cdn.okccdn.com/graphics/tests/icon_gaydar.jpg) | 60 × 60 |
| Politics chart | [/graphics/politics/chart_political.gif](https://cdn.okccdn.com/graphics/politics/chart_political.gif) | 375 × 375 |
| Basic politics chart | [/graphics/politics/chart_basic.jpg](https://cdn.okccdn.com/graphics/politics/chart_basic.jpg) | 375 × 375 |
| Match-confidence table | [/graphics/schart.gif](https://cdn.okccdn.com/graphics/schart.gif) | 347 × 241 |
| Next Page button | [/_img/layout2/tests/btn_tests_nextpage.png](https://cdn.okccdn.com/_img/layout2/tests/btn_tests_nextpage.png) | 110 × 34 |

Source for staff-test artwork: https://web.archive.org/web/20080121175253/http://www.okcupid.com/tests/list?staff=1
This catalog identifies six original staff tests and gives the actual artwork filenames. The Nurse illustration accompanies the Dating Persona Test.

Politics image paths also appear in historical result embeds: https://puritanboard.com/threads/fun-test.13556/page-2
The matching chart path is quoted in this 2004 discussion: https://www.ilxor.com/ILX/ThreadSelectedControllerServlet?action=showall&boardid=40&threadid=29797

## Personality badge artwork: 112 image references accounted for

Source: https://web.archive.org/web/20090214045533/http://www.okcupid.com/profile_glossary.html

The top-level glossary contains 112 badge image references: 56 filename families, each with a positive file and a not_ counterpart. 106 loaded at natural size 70 × 70 in the archived page during this pass. The remaining six were individually verified on the live CDN at 70 × 70:
- freedom_economic.png
- goodness.png
- not_old_fashioned.png
- purity.png
- romantic.png
- spontaneity.png

ambition.png was also individually verified on the CDN. The other 105 archived images were NOT individually tested on the live CDN in this pass. Thus all 112 are available across the two sources; this is not a claim that all 112 were downloaded or checked on the live CDN.

Original source host: http://is-test.okcimg.com/
Path prefix: /_img/layout2/profile/personality_icons/
Live CDN prefix: https://cdn.okccdn.com/_img/layout2/profile/personality_icons/

The filename families below are extracted from the actual glossary, not guessed. Append .png to each name; each also has a not_ prefixed counterpart.

- adventurous
- aggressive
- ambition
- artistic
- athleticism
- attractiveness
- charisma
- cockiness
- compassion
- competitive
- coolness
- creativity
- dominant
- dorkiness
- drugs
- energy
- freedom_economic
- freedom_social
- friendliness
- giving
- goodness
- greed
- independence
- indie
- intelligence_math
- intelligence_verbal
- introversion
- kinkiness
- lawfulness
- life_experience
- litsiness
- loneliness
- love_experience
- love_want
- old_fashioned
- optimism
- planning
- political
- purity
- radcliffy
- republican
- romantic
- scientific
- self_confidence
- seriousness
- sex_want
- sex_experience
- sloppiness
- spirituality
- spontaneity
- thinking_not_feeling
- thriftiness
- trusting
- violence
- wealth
- well_mannered

The glossary provides the historical labels and explanations. Some labels differ from filenames, e.g. not_introversion is More Extroverted, not_dominant is More Submissive, and not_thinking_not_feeling is More Emotional.

## Matching evidence

The CDN image schart.gif visibly contains columns Size of S, Margin of Error, and Highest Possible Match.
Selected rows: S=10 → 0.32 → 68%; S=100 → 0.10 → 90%; S=1000 → 0.03 → 97%.
The values are consistent with a 1/sqrt(S) margin (inference from the table), but the image alone does not establish the entire matching algorithm or any persona-test scoring weights.

## Questionnaire and script investigation

- Inspected the January 2008 landing page and its form metadata. It still uses a POST-based questionnaire flow.
- Followed the 2009 glossary's actual Dating Test link to the capture at https://web.archive.org/web/20090215004905/http://www.okcupid.com/online.dating.persona.test
- Clicking Start the Test on this 2009 capture returned the introduction again. No questionnaire items or scoring weights recovered.
- The 2009 page references general scripts including Oryx/Cookies.js, Oryx/HotKeys.js, Oryx/Utilities.js, Oryx/DateTime.js, browser_detect.js, OkLocation.js and OkLoginJoin.js. Its inspected inline scripts concern login/signup, presentation and tracking, not a recovered questionnaire.
- The 2008 super.js URL resolves to a June 2011 archived 404. That error reports /okcontent/js/super.js as the missing file; it is a path clue, not recovered source code.
- Attempt to open the linked archived Oryx/Utilities.js was blocked by the browser client. No claim about its contents.
- A CDX graphics-prefix inventory request remained inaccessible through the web retrieval tool.
- Direct shell HTTP access was unavailable in this environment; browser image loads worked.

## Next focused leads

- Preserve the badge images and map glossary labels to the planned personality-award system.
- Follow the original staff-test pages for additional illustration paths.
- Look for independently archived question pages or questionnaire exports, including the multilingual editions and HelloQuizzy-era links. No complete questionnaire or scoring weights were found in this pass.
