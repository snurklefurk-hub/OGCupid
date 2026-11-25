export const primaryNavigation = Object.freeze([
  Object.freeze({path:"/matches",label:"Matches",icon:"♥"}),
  Object.freeze({path:"/messages",label:"Messages",icon:"✉"}),
  Object.freeze({path:"/visitors",label:"Visitors",icon:"♟"}),
  Object.freeze({path:"/quickmatch",label:"Quickmatch",icon:"★"}),
  Object.freeze({path:"/community",label:"Community",icon:"☷"})
]);
export const defaultRoute="/home";
export const validRoutePaths=Object.freeze([...primaryNavigation.map(item=>item.path),"/questions","/home","/signup","/signup1","/signup2","/signup3","/signup4","/signup5","/signup6","/signup7","/signup8","/signup9","/signup10"]);
