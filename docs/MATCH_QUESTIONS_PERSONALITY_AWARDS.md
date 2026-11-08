# OG Cupid — Match questions

## Published collection

The November 8, 2026 release at /questions/ uses exactly 410 owner-selected questions:
10 essentials, then separate sets of 50, 100, and 250. The rest of the curation
workspace is not published. The 204 questions marked dogshit were retired from the
working review project. In the published selections, 29 marked answer choices
were omitted; the owner's edited question and answer wording is used as saved.

The bank is in public/questions/question-bank.js. Question IDs retain the review
source ID (vault-ID); option IDs retain their original position (option-N), even
when marked answers are omitted. Later publications must preserve those IDs.

## Question order

public/questions/question-order.js is the shared, pure scheduler.

- First 10: choose uniformly from unanswered essentials. No skipping or other-tier
  questions until all ten are answered.
- Next 50: choose uniformly from unanswered questions in this set, with a 10%
  chance per new question of drawing uniformly from unanswered later sets.
- Next 100: the same rule, with the remaining 250 set as the outside pool.
- Next 250: choose uniformly from unanswered questions in this set. No modifier.
- Stop when all 410 are answered. Do not serve unselected curation records.

An outside draw is credited to its own set and does not appear again later.
If the outside pool is exhausted, choose from the current set. Skipping after
the essentials leaves a question unanswered and eligible for a future draw.
Changing partner preferences, importance, or notes does not reroll a question.
Refreshing resumes the same pending question.

Topic and text filters apply to reviewing answered questions. They cannot bypass
the mandatory first ten or bias the automatic question scheduler. Clearing an
essential answer restores the first-ten gate.

## Answers and matching

Answers are still stored only in the visitor's browser, with no login or server
persistence. The new collection has its own storage key
ogcupid_curated_match_answers_v1; the old 48-question prototype's saved answers
remain under their previous key and are not applied to different questions.
Export/import schema 2 uses stable question IDs and option IDs, acceptable
partner option IDs, importance, a private flag, and an optional 400-character note.

Importance weights remain 0 / 1 / 10 / 50 / 250. Match is the geometric mean of
reciprocal weighted acceptable-answer rates on shared questions. A direction with
zero total weight is neutral; both directions with zero weight yield no match.
Friend measures identical answers; Conflict measures either preference rejecting
the other answer. Mandatory is a weight, not a hard exclusion.

Alex, Morgan, and Taylor remain explicitly fictional compatibility examples.
Samples now accommodate each question's actual number of choices. They do not
claim to represent particular personality traits.

The curated questions have no assigned personality scoring. The Personality tab
says so; it does not score arbitrary answer positions using the old synthetic
questions' trait scale.

## Verification

Run with Node:
node --test tests/question-order.test.cjs

Regression coverage includes exact bank size/tier counts, stable option IDs,
mandatory first-ten gating, the 10% boundary and measured frequency, randomization
of every set, exhaustion of future sets, no repeated answered questions, skipped
questions, and 60 complete 410-question sequences.

Browser smoke checks cover answer and preference persistence across reload,
ten distinct essentials before unlocking the 50 set, clean marked-answer removal,
answered-question filtering, fictional matching, JSON export/import, and completion
at 410 rather than continuing into the unpublished bank.
