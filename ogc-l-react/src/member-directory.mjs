// Directory operations on *real, already authenticated* discovery results.
// The backend alone decides who is eligible. No invented profile fields, scores,
// locations or answers are added here.
export const DIRECTORY_PAGE_SIZE = 24;

export function filterAndSortMembers(profiles, {search = "", sort = "match"} = {}) {
  const query = String(search).trim().toLocaleLowerCase().slice(0, 80);
  const candidates = (Array.isArray(profiles) ? profiles : [])
    .filter(p => p && typeof p.displayName === "string" &&
      (!query || p.displayName.toLocaleLowerCase().includes(query)));
  if (sort === "name") {
    return candidates.sort((a,b) =>
      a.displayName.localeCompare(b.displayName, undefined, {sensitivity:"base"}) ||
      a.userId.localeCompare(b.userId));
  }
  // Null is "not calculated", not 0%. Preserve real result order on ties.
  return candidates.sort((a,b) =>
    (b.matchPercent ?? -1) - (a.matchPercent ?? -1));
}

export function pageMembers(profiles, requestedPage = 1, size = DIRECTORY_PAGE_SIZE) {
  const count = Array.isArray(profiles) ? profiles.length : 0;
  const safeSize = Number.isInteger(size) && size > 0 ? size : DIRECTORY_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(count / safeSize));
  const page = Math.min(totalPages, Math.max(1, Number.isInteger(requestedPage) ? requestedPage : 1));
  return {page, totalPages, total:count,
    items: (profiles || []).slice((page-1)*safeSize, page*safeSize)};
}

export function shuffledMembers(profiles, rng = Math.random) {
  const candidates = [...(Array.isArray(profiles) ? profiles : [])];
  for (let i=candidates.length-1;i>0;i--) {
    const j = Math.floor(Math.min(0.999999999, Math.max(0, rng())) * (i+1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates;
}
