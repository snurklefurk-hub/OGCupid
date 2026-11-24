export const SIGNUP_ORIENTATIONS=Object.freeze(["Straight","Gay","Bi","Something else"]);
export const SIGNUP_GENDERS=Object.freeze(["Man","Woman","Something else"]);
// Only the confirmed, allowlisted selection is passed into the existing
// onboarding identity form. Do not use URLs, browser storage or auth metadata.
export function signupIdentity(orientation,gender){
  return SIGNUP_ORIENTATIONS.includes(orientation)&&SIGNUP_GENDERS.includes(gender)
    ?{orientation,gender}:null;
}
export function homeDestination(kind){
  if(kind==="guest")return "/signup";
  if(kind==="onboarding")return "/onboarding";
  return null;
}
export function signupDestination(kind){
  if(kind==="member")return "/home";
  if(kind==="onboarding")return "/onboarding";
  return null;
}
