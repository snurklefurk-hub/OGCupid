// Server validation for newly introduced controlled fields. Existing values
// remain saveable verbatim so a legacy profile is never silently erased.
const habits = ['Never', 'Sometimes', 'Often', 'Just weed',
  'Just weed · Sometimes', 'Just weed · Often', 'Just weed · Never'];
const choices = {
  bodyType: ['Thin', 'Athletic', 'Average', 'Jacked', 'Chubby', 'Overweight'],
  vaping: habits,
  drugs: habits,
  income: ['Broke', 'Pocket money', 'Fuck you money'],
  status: ['Single', 'Seeing someone', 'Married'],
  relationshipType: ['Monogamous', 'Polyamorous'],
};
const lookingForChoices={
  interestedIn:['Man','Woman','Transman','Transwoman','Something else'],
  relationshipGoal:['new friends','short-term dating','long-term dating','casual sex','activity partners']
};
export function validProfileChoice(key, value, previous) {
  if(value === previous || value === '')return true;
  if(choices[key])return choices[key].includes(value);
  if(lookingForChoices[key]){
    const values=value.split(', ');
    return values.length<=5 && values.length===new Set(values).size &&
      values.every(option=>lookingForChoices[key].includes(option));
  }
  return true;
}
