# OG Cupid personality-answer grading — active research

**Current graders:** DeepSeek, Arya, and **Ablitseek** (user's name for their abliterated DeepSeek model).

**Status (2026-11-20):** DeepSeek and Arya each assessed 1,193 answers across 410 questions. The third Ablitseek column now contains **146 imported assessments** (113 scored, 33 empty; 1,047 awaiting later batches). The first batch's header says `model: "Astra 6.2"` because the owner reused the same prompt; the owner explicitly identified this as **Ablitseek** output, and it was imported without altering grades. Previous **Codex** and **Astra 6.2** grading are **excluded** from active comparison; their results must not be used as tie-breakers, fallback defaults, or production scoring. Old historical GitHub commits may still contain obsolete grading files, but these are not active source data.

## Working files

- `ogc-deepseek-arya-ablitseek-worksheet.json` — canonical joined dataset, with original question text, option text and IDs, unchanged DeepSeek/Arya scores/reasons/confidence, and editable `ablitseek` third-grader records.
- `ogc-three-agent-grading-workstation.html` — self-contained offline side-by-side review, browser-local edits and JSON export/import. Only the above three graders are shown.

## Incoming Ablitseek grading import (pasted batches)

Treat a batch as a *partial candidate*, not a complete export. For every incoming answer, use the original `questionId` + `optionId` composite key; never renumber or infer missing IDs. Preserve the model's `scores` (0–3 distinct allowed traits, integers -3..-1 or +1..+3), `reason`, and `confidence` (0..1) verbatim. Validate against the canonical question bank and compare duplicate entries with existing imports; do not silently overwrite conflicting assessments. Record successfully validated entries by setting `ablitseek.status="graded"`, leaving unseen records `ungraded`. Report imported, remaining, duplicate, and rejected counts after each batch.

Source records are *proposals*, not owner-approved scoring. No changes to live site, production `main`, database or deployment are authorized by this research.
