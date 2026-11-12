/**
 * OG Cupid compatibility-question sequencing.
 *
 * Pure logic: no database access, browser storage, account writes, or
 * dependency on the current UI. Answers remain owned by the future
 * persisted-answer service; callers pass IDs of questions already answered.
 *
 * Required tier labels: "first10", "next50", "next100", "next250", "other".
 * Legacy numeric labels 10, 50, 100, 250 map to those same categories.
 *
 * The first 10 are mandatory, in random order. While focused on Next 50
 * or Next 100, a 10% roll draws from any *other* unanswered eligible tier.
 * Next 250 is presented randomly without the 10% spillover. All other
 * unanswered questions can be served after the explicitly staged tiers.
 */
export const QUESTION_TIERS = Object.freeze([
  "first10",
  "next50",
  "next100",
  "next250",
  "other",
]);

const tierLabels = new Map([
  ["first10", "first10"], ["first 10", "first10"],
  ["next50", "next50"], ["next 50", "next50"],
  ["next100", "next100"], ["next 100", "next100"],
  ["next250", "next250"], ["next 250", "next250"],
  ["other", "other"], ["rest", "other"], ["unranked", "other"],
  [10, "first10"], [50, "next50"], [100, "next100"], [250, "next250"],
]);

function normalizeTier(tier) {
  const key = typeof tier === "string" ? tier.toLowerCase().trim() : tier;
  return tierLabels.get(key) ?? "other";
}

function sample(items, random) {
  if (!items.length) return null;
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("Random source must return a number in [0,1)");
  }
  return items[Math.floor(value * items.length)];
}

/**
 * @param {Array<{id:string|number,tier:string|number,dismissed?:boolean,dogshit?:boolean,hidden?:boolean}>} questions
 * @param {Iterable<string|number>} answeredIds
 * @param {() => number} random - Optional injectable RNG for deterministic tests.
 * @returns {{question:object,focusTier:string,servedFromOutsideTier:boolean}|null}
 */
export function nextCompatibilityQuestion(questions, answeredIds, random = Math.random) {
  if (!Array.isArray(questions)) throw new TypeError("questions must be an array");
  if (typeof random !== "function") throw new TypeError("random must be a function");
  const answered = new Set(Array.from(answeredIds ?? [], id => String(id)));
  const seen = new Set();
  const available = [];
  for (const question of questions) {
    if (!question || question.id == null ||
        question.hidden || question.dismissed || question.dogshit ||
        question.answers?.every?.(answer => answer?.junk === true) ||
        answered.has(String(question.id)) || seen.has(String(question.id))) continue;
    seen.add(String(question.id));
    available.push({ question, tier: normalizeTier(question.tier) });
  }

  for (const focusTier of QUESTION_TIERS.slice(0, 4)) {
    const focus = available.filter(item => item.tier === focusTier);
    if (!focus.length) continue;

    // No spillovers before all mandatory First 10 questions are answered.
    // A completed or dismissed lower-tier item never blocks progression.
    if (focusTier === "next50" || focusTier === "next100") {
      const roll = random();
      if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
        throw new RangeError("Random source must return a number in [0,1)");
      }
      if (roll < 0.10) {
        const others = available.filter(item => item.tier !== focusTier);
        const outside = sample(others, random);
        if (outside) {
          return {
            question: outside.question,
            focusTier,
            servedFromOutsideTier: true,
          };
        }
      }
    }

    const selected = sample(focus, random);
    return {
      question: selected.question,
      focusTier,
      servedFromOutsideTier: false,
    };
  }

  const afterStaged = sample(available, random);
  return afterStaged
    ? { question: afterStaged.question, focusTier: "other", servedFromOutsideTier: false }
    : null;
}
