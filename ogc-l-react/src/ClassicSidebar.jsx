import React from "react";
import {NavLink} from "react-router-dom";
import {PAGE_PROMOTIONS,PAGE_REFINEMENT,promotionDestination,refinementDestination} from "./classic-editorial.mjs";
import {resolvePromoUrl} from "./promo-contract.mjs";
import {useMemberSession} from "./MemberSessionProvider.jsx";

function Tile({title,body,destination,editorKey}) {
  const inner=<><strong data-ogc-edit-text={editorKey?editorKey+".title":undefined}>{title}</strong>
    <span data-ogc-edit-text={editorKey?editorKey+".body":undefined}>{body}</span></>;
  if(!destination)return <div data-ogc-card={editorKey} className="ogcl-editorial-card ogcl-inert">{inner}</div>;
  return destination.external?
    <a data-ogc-card={editorKey} className="ogcl-editorial-card" href={destination.to}
      target="_blank" rel="noopener noreferrer">{inner}</a>:
    <NavLink data-ogc-card={editorKey} className="ogcl-editorial-card" to={destination.to}>{inner}</NavLink>;
}
const fallbackLink=(destination,slug,kind)=>
  resolvePromoUrl(kind==="refinement"?refinementDestination(destination,slug)||"":
    promotionDestination(destination,slug)||"",slug);

export function SidebarPromos({side,selection}) {
  const {kind,profile}=useMemberSession();
  const index=side==="right"?3:0;
  const fallback=PAGE_PROMOTIONS.slice(index,index+3);
  const tiles=selection?selection[side]:fallback;
  return <div className="ogcl-editorial-stack" aria-label={side==="right"?"More OG Cupid":"Explore OG Cupid"}>
    {tiles.map((tile,n)=>{
      const url=selection?resolvePromoUrl(tile.url||"",profile?.slug):
        kind==="member"?fallbackLink(tile.destination,profile?.slug,"editorial"):null;
      return <Tile key={tile.id||"fallback-"+side+"-"+n}
        title={tile.title} body={tile.body}
        editorKey={"shell.promo."+side+"."+n} destination={url}/>;
    })}
  </div>;
}

// Completed members get only their real circular primary photograph in this
// floating navy tile; profile prompts remain separate cards in the right rail.
export function ProfileFloater({Photo}) {
  const {kind,user,profile}=useMemberSession();
  if(kind!=="member"||!user?.id)return null;
  return <NavLink to={profile?.slug?"/profiles/"+profile.slug:"/settings"}
    className="ogcl-profile-floater" aria-label="Open your profile">
    <Photo member={{userId:user.id}} />
  </NavLink>;
}
export function ProfileRefinement({selection}) {
  const {kind,profile}=useMemberSession();
  if(kind!=="member")return null;
  const tile=selection?selection.refinement:PAGE_REFINEMENT;
  if(!tile)return null;
  const destination=selection?resolvePromoUrl(tile.url||"",profile?.slug):
    fallbackLink(tile.destination,profile?.slug,"refinement");
  return <section className="ogcl-refinement-slot" aria-label="Improve your profile">
    <Tile title={tile.title} body={tile.body} destination={destination} editorKey="shell.refinement"/>
  </section>;
}
