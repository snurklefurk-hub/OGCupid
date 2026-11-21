# OG Cupid personality-answer grading — independent research

**Status (2026-11-21):** 410 canonical questions and **1,193** answer options. Two existing reference assessment sets remain intact and read-only in the comparison workstation. The previous third assessment pass was **discarded by owner instruction**; its scores and supporting explanations are no longer part of the active research data, not available as defaults or tie-breakers, and not approved for production. The new candidate column is completely blank. Historical Git commits may still contain removed files; this is not a Git-history purge.

## Current working files

- [Blind grading input](ogc-personality-blind-input.json) — question and answer text/IDs, taxonomy, output shape, no prior assessments or source identities.
- [Independent grading handoff](ogc-independent-grading-handoff.md) — copy-paste task for the next independent reviewer; no names or identities.
- [Comparison worksheet](ogc-grading-worksheet.json) — original question bank, unchanged two reference sets, blank candidate assessments.
- [HTML comparison workstation](ogc-grading-review-workstation.html) — two reference columns plus blank editable candidate column; browser-local saved candidate state uses a **new storage key** so discarded grades are not restored.
- Research provenance and output validation are documented in this README; the independent blind input must never contain previous scoring or reference identities.

## Trait-scoring semantics

The taxonomy `ogc-20-v1` has nine bipolar dimensions (with two named poles each) plus eleven standalone (unipolar) dimensions. Every answer gets 0–3 distinct trait names, each scored with a signed integer from -3 through -1 or +1 through +3. **Standalone traits are signed too**: positive means more of that trait, negative means less; negative standalone points are not inherently errors. Bipolar scores identify directional evidence between opposing poles. An empty `scores` array means no reliable trait evidence, not negative trait expression. Every record still needs a reason and confidence from 0 to 1.

## Independent intake and QA

Never renumber `optionId` or assume non-contiguous IDs follow a 0,1,2 sequence. Match both `questionId` and `optionId` to the canonical input bank and verify the explanation describes the actual question and answer. Expected totals: **410** unique questions and **1,193** unique question/option pairs, exactly once each, 0–3 distinct allowed trait scores per answer, nonzero integer signed scores, and a reason plus confidence for every answer including empty grades. Keep new independent pass separate from the reference scores until its entire submission has passed validation and owner review.

The earlier third pass is excluded; do not re-import it, reconstruct it from source messages, or use it as a comparison, fallback, or tie-breaker. The original reference scores remain unchanged. Nothing is owner-approved or used in live matching, and no changes to production, the live database or GitHub main are authorized.

## Discarded candidate batch — 2026-11-21

By owner request, the incomplete 375-assessment submission was discarded entirely from the active research. The candidate column is reset to **0/1,193**; there are no active candidate scores, explanations, or confidence values to compare. The batch-specific JSON file was deleted from the active research branch. The review workstation now uses a **new browser storage key** to prevent locally cached discarded assessments from reappearing. The blind input and independent grading handoff are unchanged and reusable.

The two read-only reference grading sets were preserved. Historical Git commits or old chat attachments may still retain the discarded submission; this operation is not a Git-history rewrite or deletion of old chat uploads. No discarded grading pass is owner-approved or eligible for production use.
