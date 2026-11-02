# OG Cupid — Match Questions & Personality Awards

**Status (2026-11-02): interactive browser-only prototype is live at `/questions/`.**

## What exists now

- 48 independently written match questions covering 16 personality dimensions, three questions per dimension.
- Each response has the member's own option, an arbitrary set of acceptable partner options, the importance weight, a public/private setting, and an optional 400-character explanation.
- Importance weights: irrelevant = 0; a little = 1; somewhat = 10; very = 50; mandatory = 250.
- Bidirectional compatibility with fictional profiles Alex, Morgan, and Taylor. Calculated over shared answered questions only.
- Provisional `More [trait]`/`Less [trait]` personality labels computed from at least 3 answered questions per trait. Answers are scored on a -1 to +1 scale and averaged. An absolute score of at least 0.34 triggers a label.
- Local-browser answer storage plus JSON export/import and erase.

The public page is deliberately candid: **no real user accounts, server-side persistence, real matching, cohort norming, or scientific validation exists yet**. Sample profiles are fictional. The 48 questions and award scoring are ORIGINAL OG Cupid preview material, not recovered original OkCupid questions/scoring rules.

## Matching mathematics (prototype)

For every question that **both** profiles answered:

- Compute the points that A receives from B: A's question importance if B's selected answer is in A's acceptable answers, otherwise 0.
- Compute B's points from A independently.
- Sum each person's earned points and divide by that person's total importance weight over shared answered questions.
- The displayed Match percentage is the geometric mean of the two directional success rates, rounded to the nearest integer.
- If one direction assigns zero importance to every shared question, that direction is treated as neutral (100%), rather than secretly using answers it declared irrelevant. If both directions have zero weight, Match is unavailable.
- `Friend` is the percentage of shared questions on which the two people chose the same answer. `Conflict` is the percentage of shared questions on which at least one person's acceptable-answer set rejects the other's selected answer.
- Unanswered questions are not scored as rejections. The number of shared questions is always displayed. The preview does not implement a Bayesian confidence adjustment or minimum-match threshold.

A setting marked **Mandatory** carries a high weight in this prototype but is **not** an absolute exclusion. Hard exclusions need their own explicit and transparent settings.

## Personality award rules (prototype)

Traits are currently:

`Ambitious`, `Adventurous`, `Compassionate`, `Romantic`, `Trusting`, `Scientific`, `Artsy`, `Polite`, `Laid-Back`, `Organized`, `Independent`, `Literary`, `Optimistic`, `Spontaneous`, `Political`, `Spiritual`.

Each of its three question options are ordered 0–3 (lower-to-higher self-reported trait expression), scored as `(answerIndex - 1.5) / 1.5`. When all three are answered, a mean of `>= +0.34` produces `More [trait]`; a mean `<= -0.34` produces `Less [trait]`. Neutral scores or missing answers produce no award.

Crucially, these labels are **NOT relative to the user population**. Eventually, profile awards should use controlled norms: enough eligible members, question coverage, optional demographic cohort selection where justified, confidence intervals, and explicit explanations. Don't infer absence of a trait from skipped questions, or infer someone's private values from missing answers.

## Historical inspiration

The February 14, 2009 archived profile glossary supplied by the project owner:
https://web.archive.org/web/20090214045533/http://www.okcupid.com/profile_glossary.html#ambition

The archive site was not reliably accessible from the development environment. The page is preserved here as a research source, not represented as reviewed line by line. The original matching-question pattern and personality award displays are independently documented in period descriptions and screenshots.

- https://kitoconnell.com/2011/11/04/okcupid-questions/
- https://www.salon.com/2014/03/15/you_are_more_than_a_sexual_fetish_-_but_online_dating_sites_might_not_think_so/
- https://camillec.com/WWW2017_OnlineDating.pdf

## Production roadmap

1. **Accounts and answers:** authenticated member identity; PostgreSQL schema for versioned question definitions/option IDs, `member_answer`, acceptable-option set, importance, visibility, explanation, timestamps, and audit trails. Explicit controls for data deletion and portability.
2. **Authoring and moderation:** submission queue for user-authored questions; prompt editing/versioning, duplicates, abusive questions, sexually explicit content classification, underage safety and harassment reporting.
3. **Matching as a service:** versioned, tested symmetric compatibility engine; exclude unanswered items; weigh preferences with sensible missing-data confidence; measure overlap and disagreement; allow hard dealbreakers separately.
4. **Personality awards:** multiple independent questions per trait; reverse-coded items to limit acquiescence; validated trait schemas; coverage thresholds, uncertainty, and cohort norms before showing claims about relative standing.
5. **Profiles:** member-facing question answers with per-answer visibility; match explanations and transparent shared-answer comparisons; profile personality panel; permission-consistent privacy in all API responses.
6. **Quality assurance:** integration and accessibility testing on mobile and desktop; security controls, spam defenses, rate limits, consent, privacy and accessibility review.

### Candidate data model

```text
match_question(id, version, prompt, category, author_id, state, published_at)
match_option(id, question_id, question_version, label, trait_vector)
member_match_answer(member_id, question_id, version, own_option_id, importance, visibility, explanation, updated_at)
member_accepted_option(member_id, question_id, option_id)
personality_trait(id, name, definition, normalization_method, min_evidence)
member_personality_award(member_id, trait_id, score, cohort_version, evidence_count, computed_at)
```

Do **not** trust the client to supply another member's private answers or any award score. Server side should calculate match percentages and awards with privacy and moderation policies.

## Smoke test checklist

- Page `/questions/` loads, homepage has three links to it; existing standalone `/quiz` remains unchanged.
- Answer a question, check/uncheck accepted answers, adjust importance to 0 or 250, set private, enter a note; reload and verify local persistence.
- Use filters for answered / unanswered and different topics; next and previous should honor the filter.
- Answer three in a topic with high or low positions and inspect personality award; middle position pattern should give no award.
- Switch among Alex/Morgan/Taylor to see reciprocal match, friend, conflict and overlap recompute; private answers display as private in the sample comparison but still count.
- Export answers, erase, import: round-trip within the same browser.
- On another browser or device, the answers should **not** appear (they aren't shared accounts).
