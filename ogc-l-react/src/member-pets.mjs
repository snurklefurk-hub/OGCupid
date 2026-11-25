export const PET_CHOICES=Object.freeze(["Doesn’t have pets","Has cats","Has dogs","Has exotics","Likes dogs","Likes cats","Likes exotics"]);
export function selectedPets(value){
  if(!value)return [];
  const items=value.split(", ");
  if(!items.every(item=>PET_CHOICES.includes(item))||
    (items.includes(PET_CHOICES[0])&&items.length>1))return [];
  return items;
}
