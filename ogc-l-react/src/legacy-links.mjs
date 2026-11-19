// Only paths that have NOT been migrated to React are handed off to the
// existing live site. On a separate Render staging origin those paths cannot
// be relative, because staging intentionally does not publish legacy pages.
export function legacyHref(path, origin = import.meta.env?.VITE_OGCL_LEGACY_ORIGIN || "") {
  if (typeof path !== "string" || !/^\/(?!\/)[^?#]*[?#]?.*$/.test(path)) {
    throw new Error("Invalid legacy page path");
  }
  if (!origin) return path;
  const target = new URL(origin);
  if (target.protocol !== "https:" || target.username || target.password ||
      target.pathname !== "/" || target.search || target.hash) {
    throw new Error("Legacy fallback must be an HTTPS site origin");
  }
  return new URL(path, target).href;
}
