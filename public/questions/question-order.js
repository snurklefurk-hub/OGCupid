/* Pure question sequencing, shared by the page and regression tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OGCQuestionOrder = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TIERS = [10, 50, 100, 250];
  function stage(questions, answered) {
    return TIERS.find(tier => questions.some(q => q.tier === tier && !answered.has(q.id))) || null;
  }
  function pickNext(questions, answered, random = Math.random, excludeId = null) {
    const tier = stage(questions, answered);
    if (tier === null) return null;
    const remaining = questions.filter(q => !answered.has(q.id));
    let main = remaining.filter(q => q.tier === tier && q.id !== excludeId);
    if (!main.length) main = remaining.filter(q => q.tier === tier);
    const other = remaining.filter(q => q.tier > tier && q.id !== excludeId);
    const detour = (tier === 50 || tier === 100) && other.length > 0 && random() < 0.1;
    const pool = detour ? other : main;
    return { question: pool[Math.floor(random() * pool.length)], stage: tier, detour };
  }
  return { TIERS, stage, pickNext };
});
