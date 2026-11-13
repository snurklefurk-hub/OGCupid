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
export function validProfileChoice(key, value, previous) {
  return !choices[key] || value === '' || value === previous || choices[key].includes(value);
}
