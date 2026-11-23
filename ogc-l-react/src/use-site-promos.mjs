import {useEffect,useMemo,useState} from "react";
import {choosePromoCards,validPromoUrl} from "./promo-contract.mjs";

// One fetch per mounted site shell, shared by both rails. The module-level
// legacy selection is shown only while loading or if the public API fails.
// Once loaded, an empty admin-controlled catalogue means NO promo cards.
export function useSitePromos(){
  const [cards,setCards]=useState(null);
  useEffect(()=>{
    let active=true;
    let url;
    try{
      const configured=import.meta.env.VITE_OGC_MEMBER_API_URL;
      if(!configured)return;
      url=new URL("/promos",configured).href;
    }catch{return;}
    const load=async()=>{
      try{
        const response=await fetch(url,{method:"GET",credentials:"omit",
          cache:"no-store",headers:{Accept:"application/json"}});
        if(!response.ok)throw Error("Promo catalogue unavailable");
        const data=(await response.json())?.data;
        if(!Array.isArray(data))throw Error("Invalid promo catalogue");
        const clean=data.filter(card=>card&&Number.isSafeInteger(card.id)&&
          card.id>0&&typeof card.title==="string"&&
          typeof card.body==="string"&&validPromoUrl(card.url||"")&&
          ["editorial","refinement"].includes(card.category)&&
          ["left","right","both"].includes(card.side));
        if(active)setCards(clean);
      }catch{/* Existing hardcoded cards remain available if the network fails. */}
    };
    void load();
    window.addEventListener("ogc-promos-updated",load);
    return()=>{active=false;window.removeEventListener("ogc-promos-updated",load);};
  },[]);
  return useMemo(()=>cards===null?null:choosePromoCards(cards),[cards]);
}
