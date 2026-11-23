import React from "react";
import {NavLink} from "react-router-dom";
import {
  PAGE_PROMOTIONS,PAGE_REFINEMENT,promotionDestination,refinementDestination
} from "./classic-editorial.mjs";
import {useMemberSession} from "./MemberSessionProvider.jsx";

function reactRoute(destination){
  if(destination==="/account/persona.html")return "/persona";
  if(destination==="/account/")return "/account";
  return destination?.replace(/\/$/,"") || null;
}
function Tile({title,body,destination,editorKey}) {
  const inner=<><strong data-ogc-edit-text={editorKey?editorKey+".title":undefined}>{title}</strong><span data-ogc-edit-text={editorKey?editorKey+".body":undefined}>{body}</span></>;
  if(!destination)return <div data-ogc-card={editorKey} className="ogcl-editorial-card ogcl-inert">{inner}</div>;
  return <NavLink data-ogc-card={editorKey} className="ogcl-editorial-card" to={reactRoute(destination)}>{inner}</NavLink>;
}

export function SidebarPromos({side}) {
  const {kind,profile} = useMemberSession();
  const index=side==="right"?3:0;
  const tiles=PAGE_PROMOTIONS.slice(index,index+3);
  return <div className="ogcl-editorial-stack" aria-label={side==="right"?"More OG Cupid":"Explore OG Cupid"}>
    {tiles.map((tile,n)=>{
      const url=kind==="member"?promotionDestination(tile.destination,profile?.slug):null;
      return <Tile key={tile.title} title={tile.title} body={tile.body}
        editorKey={"shell.promo."+side+"."+n} destination={url}/>;
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
    <Tile title={tile.title} body={tile.body} destination={url} editorKey="shell.refinement"/>
  </section>;
}
