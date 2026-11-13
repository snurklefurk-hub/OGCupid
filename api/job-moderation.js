// Deliberately narrow moderation rule. It normalizes harmless punctuation and
// whitespace but requires the explicit job phrase; it does not fuzzy-match or
// inspect existing accounts.
export function isKrustyKrabCookJob(value) {
  if (typeof value !== "string") return false;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return /\bcook\s+at\s+(?:the\s+)?krusty\s+krab\b/.test(normalized);
}
