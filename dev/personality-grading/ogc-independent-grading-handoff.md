# Independent personality-answer grading handoff

Grade every answer option in the attached **blind question bank** independently against its personality taxonomy.

**Scope:** 410 questions, 1,193 answer options, version `ogc-20-v1`. Evaluate each answer in the context of its exact question text. Do not infer a missing answer, invent an option, substitute a question, or assume option IDs are contiguous. Preserve every `questionId` and `optionId` exactly, and keep the original order.

**Scoring:** Assign **0–3 distinct trait scores per answer**, using nonzero signed integers from **−3 to +3**. A score of 0 is forbidden; use an empty `scores` array when the answer supplies no meaningful evidence. The taxonomy has **nine bipolar dimensions** (each with two named poles) and **eleven standalone dimensions**. For bipolar dimensions, assess the direction and strength of the relevant pole; do not score both poles of one pair in the same answer. For standalone traits, **positive means more of that trait and negative means less**. Negative scores are valid for standalone traits too. Do not treat a blank `scores` array as negative evidence.

**Judgment:** Use your independent assessment of what the specific answer supports. Do not automatically equate sexual preferences, relationship structures, political or cultural opinions, identity, demographic characteristics, or arbitrary personal habits with unrelated personality traits. Avoid inventing explanations to force a score. Uncertain or weak signals can be left unscored. Strong signals can receive larger absolute scores, but reserve ±3 for unusually clear evidence.

**Every answer requires** a concise evidence-based `reason` and numeric `confidence` between 0 and 1, including answers with an empty `scores` array. Confidence indicates reliability of the inference, not the strength of the trait. A low-confidence score should be reconsidered rather than automatically retained.

**Output:** Return one valid UTF-8 JSON file named `ogc-personality-grades.json` matching the output shape specified in the input. Include exactly `schemaVersion: 1`, `taxonomyVersion: "ogc-20-v1"`, `bankVersion: 1`, and an `answers` array. Each element has exactly `questionId`, `optionId`, `scores` (0–3 objects containing `trait` and `score`), `reason` (nonempty string), and `confidence` (number from 0 to 1). No author or source identity field is needed.

**Validation:** Verify there are **1,193 unique question/option pairs across 410 questions**; every pair occurs once and exists in the input; no missing or additional entries; all scores are nonzero integers in ±1..3; traits use only the permitted names; all reasons are nonempty; all confidences are finite numeric values in [0,1]. Pay particular attention to non-contiguous option IDs and to whether your explanation describes the *actual* question and answer.

If one output is too large to produce safely, supply sequential, non-overlapping JSON batches that preserve exact IDs and the same entry structure, then deliver the complete validated merged JSON if possible. Never invent data to fill a gap, and state precisely which answers remain incomplete.

Do not change any website, deployment, live database, or repository branch. This is an offline independent research assessment, not approved production scoring.
