# OG Cupid personality-answer grading — active research

**Current graders:** DeepSeek, Arya, and **Ablitseek** (user's name for their abliterated DeepSeek model).

**Status (2026-11-20):** DeepSeek and Arya each assessed 1,193 answers across 410 questions. The third Ablitseek column now contains **1,182 imported assessments** (831 with nonempty trait scores, 351 explicitly unscored; 11 awaiting later batches). The first batch's header says `model: "Astra 6.2"` because the owner reused the same prompt; the owner explicitly identified this as **Ablitseek** output, and it was imported without altering grades. Previous **Codex** and **Astra 6.2** grading are **excluded** from active comparison; their results must not be used as tie-breakers, fallback defaults, or production scoring. Old historical GitHub commits may still contain obsolete grading files, but these are not active source data.

## Working files

- `ogc-deepseek-arya-ablitseek-worksheet.json` — canonical joined dataset, with original question text, option text and IDs, unchanged DeepSeek/Arya scores/reasons/confidence, and editable `ablitseek` third-grader records.
- `ogc-three-agent-grading-workstation.html` — self-contained offline side-by-side review, browser-local edits and JSON export/import. Only the above three graders are shown.

## Incoming Ablitseek grading import (pasted batches)

Treat a batch as a *partial candidate*, not a complete export. For every incoming answer, use the original `questionId` + `optionId` composite key; never renumber or infer missing IDs. Preserve the model's `scores` (0–3 distinct allowed traits, integers -3..-1 or +1..+3), `reason`, and `confidence` (0..1) verbatim. Validate against the canonical question bank and compare duplicate entries with existing imports; do not silently overwrite conflicting assessments. Record successfully validated entries by setting `ablitseek.status="graded"`, leaving unseen records `ungraded`. Report imported, remaining, duplicate, and rejected counts after each batch.

Source records are *proposals*, not owner-approved scoring. No changes to live site, production `main`, database or deployment are authorized by this research.

## Batch 2 intake — 2026-11-20

Received 231 unique proposed Ablitseek answers. Imported 228 valid, original question/option ID matches without changing scores, reasons, or confidence. Rejected three unknown option pairs: `vault-175 / option-3`, `vault-261 / option-2`, and `vault-272 / option-3`. There were zero repeated or conflicting previously imported keys. The 228 accepted entries consist of 155 with scores and 73 with empty score arrays. Do not assign or infer replacements for rejected pairs. Combined total: 374/1,193; remaining 819. None is owner-approved or published.

## Batch 3 intake — 2026-11-20

Received 254 unique proposed Ablitseek answers. Imported 250 valid original question/option ID matches without changing scores, reasons, or confidence. Rejected four unknown option pairs: `vault-336 / option-1`, `vault-354 / option-2`, `vault-366 / option-1`, and `vault-378 / option-3`. There were zero repeated or conflicting previously imported keys. The 250 accepted entries consist of 167 with scores and 83 with empty score arrays. Do not assign or infer replacements for rejected pairs. Combined total: 624/1,193; remaining 569. None is owner-approved or published.

## Batch 4 intake — 2026-11-20

Received 262 unique proposed Ablitseek answers. Imported 257 valid original question/option ID matches without altering scores, reasons, or confidence. Rejected five unknown option pairs: `vault-448 / option-2`, `vault-469 / option-1`, `vault-565 / option-3`, `vault-573 / option-1`, `vault-578 / option-1`. There were zero duplicates or conflicts with previously imported keys. The 257 accepted entries consist of 183 with scores and 74 with empty score arrays. Do not guess replacements for rejected pairs. Combined: 881/1,193 (618 scored, 263 empty), 312 pending. All assessments remain unapproved research proposals, not production data.

## Batch 5 intake — 2026-11-20

Received 302 unique proposed Ablitseek answers. Imported 301 valid original question/option ID matches without changing scores, reasons, or confidence. Rejected one unknown option pair: `vault-646 / option-2`. There were zero duplicates or conflicts with previously imported keys. The 301 accepted entries consist of 213 with scores and 88 with empty score arrays. Do not assign or infer replacement for the rejected pair. Combined: 1,182/1,193 (831 scored, 351 empty), 11 pending. The remaining answer pairs are:
- `vault-272 / option-4`: Is it a requirement that you communicate every day with your significant other (via phone, text, in person, whatever)? — No, I’d prefer not to communicate daily
- `vault-336 / option-2`: Should wealthier people pay higher taxes? — No
- `vault-354 / option-3`: How do you take your coffee? — Put that coffee down! Coffee is for closers only.
- `vault-366 / option-2`: What’s worse on a first date? — Nothing to talk about
- `vault-378 / option-4`: How many books do you own? — 50+
- `vault-448 / option-3`: Which is scarier to reveal to a new partner? — Both equally
- `vault-469 / option-3`: Did you have a dysfunctional upbringing? — No, not at all.
- `vault-565 / option-4`: When it comes to right and wrong, which of the following do you think has the greatest impact on your belief system? — Self interest.
- `vault-573 / option-3`: Is global warming a serious problem? — I don’t know
- `vault-578 / option-2`: Orgasms are clearly the most important part of sex. — I disagree.
- `vault-646 / option-4`: Which is closest to your reaction to foul language? — It bothers me a lot.

All assessments remain unapproved research proposals, not production data.
