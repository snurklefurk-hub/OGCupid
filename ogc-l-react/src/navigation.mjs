// Approved November 18, 2026: five compact classic member tabs.
// Counts appear only when real member activity can be proven by the backend.
export const primaryNavigation = Object.freeze([
  Object.freeze({path:"/matches",label:"MATCHES",icon:"♡"}),
  Object.freeze({path:"/messages",label:"MESSAGES",icon:"✉"}),
  Object.freeze({path:"/visitors",label:"VISITORS",icon:"◉"}),
  Object.freeze({path:"/quickmatch",label:"QUICKMATCH",icon:"♥"}),
  Object.freeze({path:"/community",label:"COMMUNITY",icon:"☷"})
]);
export const defaultRoute="/matches";
export const validRoutePaths=Object.freeze([...primaryNavigation.map(item=>item.path),"/questions"]);
