// The four primary navigation items are a product requirement.
// Routing is isolated here so React and future native wrappers can share
// the same stable destinations without hard-coded URL manipulation.
export const primaryNavigation = Object.freeze([
  Object.freeze({ path: "/matches", label: "MATCHES", icon: "♥" }),
  Object.freeze({ path: "/messages", label: "MESSAGES", icon: "✉" }),
  Object.freeze({ path: "/visitors", label: "VISITORS", icon: "♙" }),
  Object.freeze({ path: "/quickmatch", label: "QUICKMATCH", icon: "✦" }),
]);
export const defaultRoute = "/matches";
export const validRoutePaths = Object.freeze([
  ...primaryNavigation.map(item => item.path),
  "/questions"
]);
