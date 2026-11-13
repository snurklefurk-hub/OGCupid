/**
 * The profile editor is a focused, three-part view. All sections remain in a
 * single HTML form so saving any step persists the existing whole profile.
 */
export const PROFILE_EDITOR_STEPS = Object.freeze({
  basics: Object.freeze({hash:"#profile-title",heading:"Let's start with the basics.",button:"Save basics & continue",next:"details"}),
  details: Object.freeze({hash:"#profile-details-title",heading:"The little details.",button:"Save details & continue",next:"essays"}),
  essays: Object.freeze({hash:"#profile-essays-title",heading:"Now tell your story.",button:"Save my profile",next:null}),
});
export function profileStepFromHash(hash){
  if(hash===PROFILE_EDITOR_STEPS.details.hash) return "details";
  if(hash===PROFILE_EDITOR_STEPS.essays.hash) return "essays";
  return "basics";
}
export function profileDestination(step){
  return (PROFILE_EDITOR_STEPS[step]||PROFILE_EDITOR_STEPS.basics).hash;
}
