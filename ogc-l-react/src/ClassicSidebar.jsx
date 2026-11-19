import React from "react";
import {NavLink} from "react-router-dom";
import {legacyHref} from "./legacy-links.mjs";
import {
  PAGE_PROMOTIONS,PAGE_REFINEMENT,promotionDestination,refinementDestination
} from "./classic-editorial.mjs";
import {useMemberSession} from "./MemberSessionProvider.jsx";

function Tile({title,body,destination,external=false,refinement=false}) {
  const inner=<><strong>{title}</strong><span>{body}</span></>;
  const cls=refinement?"ogcl-editorial-card ogcl-editorial-refinement":"ogcl-editorial-card";
  if(!destination)return <div className={cls+" ogcl-inert"}>{inner}</div>;
  if(external)return <a className={cls} href={legacyHref(destination)}>{inner}</a>;
  return <NavLink className={cls} to={destination}>{inner}</NavLink>;
}

export function SidebarPromos({side}) {
  const {kind,profile} = useMemberSession();
  const index=side==="right"?3:0;
  const tiles=PAGE_PROMOTIONS.slice(index,index+3);
  return <div className="ogcl-editorial-stack" aria-label={side==="right"?"More OG Cupid":"Explore OG Cupid"}>
    {tiles.map(tile=>{
      const url=kind==="member"?promotionDestination(tile.destination,profile?.slug):null;
      const external=false;
      return <Tile key={tile.title} title={tile.title} body={tile.body}
        destination={url} external={external}/>;
    })}
  </div>;
}

// Completed members get only their real circular primary photograph in this
// floating navy tile; the five separate refinement cards live below in the rail.
export function ProfileFloater({Photo}) {
  const {kind,user,profile}=useMemberSession();
  if(kind!=="member"||!user?.id)return null;
  return <NavLink to={profile?.slug?"/profiles/"+profile.slug:"/settings"}
    className="ogcl-profile-floater" aria-label="Open your profile">
    <Photo member={{userId:user.id}} />
  </NavLink>;
}

export function ProfileRefinement() {
  const {kind,profile}=useMemberSession();
  if(kind!=="member")return null;
  const tile=PAGE_REFINEMENT;
  const url=refinementDestination(tile.destination,profile?.slug);
  return <section className="ogcl-refinement-slot" aria-label="Improve your profile">
    <Tile title={tile.title} body={tile.body} destination={url} refinement/>
  </section>;
}
