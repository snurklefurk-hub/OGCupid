import {PROFILE_GENDERS,PROFILE_ORIENTATIONS,PROFILE_INTENTIONS} from "../ogc-l-react/src/profile-options.mjs";
// Server validation for newly introduced controlled fields. Existing values
// remain saveable verbatim so a legacy profile is never silently erased.
const habits = ['Never', 'Sometimes', 'Often', 'Just weed',
  'Just weed · Sometimes', 'Just weed · Often', 'Just weed · Never'];
const choices = {
  gender:PROFILE_GENDERS,
  orientation:PROFILE_ORIENTATIONS,
  bodyType: ['Thin', 'Athletic', 'Average', 'Jacked', 'Chubby', 'Overweight'],
  vaping: habits,
  drugs: habits,
  income: ['Broke', 'Pocket money', 'Fuck you money'],
  status: ['Single', 'Seeing someone', 'Married'],
  relationshipType: ['Monogamous', 'Polyamorous'],
};
const lookingForChoices={
  interestedIn:PROFILE_GENDERS,
  relationshipGoal:PROFILE_INTENTIONS.map(x=>x.value)
};
export function validProfileChoice(key, value, previous) {
  if(value === previous || value === '')return true;
  if(choices[key])return choices[key].includes(value);
  if(lookingForChoices[key]){
    const values=value.split(', ');
    return values.length<=lookingForChoices[key].length && values.length===new Set(values).size &&
      values.every(option=>lookingForChoices[key].includes(option));
  }
  return true;
}
