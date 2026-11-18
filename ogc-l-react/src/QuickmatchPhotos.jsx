import React,{useEffect,useState} from "react";
import {useMemberSession} from "./MemberSessionProvider.jsx";

// These are short-lived object URLs for the JWT-protected first 1–3 photos.
// Reuse the current protected member Photos API, rather than a second fetcher. The first 1–3 genuinely saved images use natural aspect ratio
// remains natural and never crops or stretches photos.
export default function QuickmatchPhotos({memberId}) {
  const {getMemberGallery}=useMemberSession();
  const [urls,setUrls]=useState([]);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    let current=true,created=[];
    setUrls([]);setFailed(false);
    if(!memberId)return;
    void getMemberGallery(memberId).then(photos=>{
      if(!current)return;
      created=photos.slice(0,3).map(photo=>URL.createObjectURL(photo.image));
      setUrls(created);
    }).catch(()=>{if(current)setFailed(true);});
    return ()=>{
      current=false;
      for(const url of created)URL.revokeObjectURL(url);
    };
  },[memberId,getMemberGallery]);
  if(!urls.length)return <div className="ogcl-quickmatch-no-photos" role="status">
    {failed?"Photos cannot be loaded right now.":"No photos available to display."}
  </div>;
  return <div className="ogcl-quickmatch-photo-container">
    <div className="ogcl-quickmatch-photo-row" aria-label="Member's saved photos">
      {urls.map((url,index)=><img key={url} src={url} alt={"Member photo "+(index+1)}
        loading={index===0?"eager":"lazy"} />)}
    </div>
  </div>;
}
