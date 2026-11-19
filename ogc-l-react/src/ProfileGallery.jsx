import React,{useEffect,useRef,useState} from "react";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import {NavLink} from "react-router-dom";

function EnlargedPhoto({photo,onClose}) {
  const dialog=useRef(null);
  useEffect(()=>{
    const node=dialog.current;
    if(!node)return;
    node.showModal();
    return()=>{if(node.open)node.close();};
  },[]);
  return <dialog className="ogcl-photo-lightbox" ref={dialog} onClose={onClose}
      aria-label="Larger member photo">
    <button type="button" className="ogcl-photo-close"
      onClick={()=>dialog.current?.close()}>Close photo ×</button>
    <img src={photo.url} alt={"Member photo "+photo.position+" enlarged"}/>
  </dialog>;
}

export default function ProfileGallery({userId,isOwner}) {
  const {getMemberGallery}=useMemberSession();
  const [photos,setPhotos]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [selected,setSelected]=useState(null);

  useEffect(()=>{
    let active=true;
    const urls=[];
    setLoading(true);setError("");setPhotos(null);setSelected(null);
    void getMemberGallery(userId).then(images=>{
      if(!active)return;
      const entries=images.map((photo,index)=>{
        const url=URL.createObjectURL(photo.image);
        urls.push(url);
        return {id:photo.id,isPrimary:photo.isPrimary,sortOrder:photo.sortOrder,
          url,position:index+1};
      });
      setPhotos(entries);
      setLoading(false);
    }).catch(()=>{
      if(active){
        setError("Photos couldn't be loaded. Try reloading this profile.");
        setLoading(false);
      }
    });
    return()=>{
      active=false;
      urls.forEach(url=>URL.revokeObjectURL(url));
    };
  },[getMemberGallery,userId]);

  const primary=photos?.find(p=>p.isPrimary)||photos?.[0]||null;
  const additional=photos?.filter(p=>p.id!==primary?.id)||[];

  const zoom=photo=>setSelected(photo);
  return <section className="ogcl-gallery" aria-label="Member photos">
    <div className="ogcl-gallery-heading">
      <h2>Photos</h2>
      {isOwner&&<NavLink className="ogcl-profile-pencil"
        aria-label="Manage your photos" title="Manage your photos"
        to="/photos">✎</NavLink>}
    </div>
    {loading&&<p role="status">Loading photos…</p>}
    {error&&<p className="ogcl-error" role="alert">{error}</p>}
    {!loading&&!error&&!primary&&<p>This member hasn't uploaded any photos.</p>}
    {primary&&<div className="ogcl-gallery-main">
      <button type="button" onClick={()=>zoom(primary)}
        aria-label="View primary profile photo larger" title="View larger">
        <img src={primary.url} alt="Member's primary profile photo"/>
      </button>
    </div>}
    {additional.length>0&&<div className="ogcl-gallery-thumbs" aria-label="More member photos">
      {additional.map(photo=><button key={photo.id} type="button"
        onClick={()=>zoom(photo)} aria-label={"View photo "+photo.position+" larger"}>
        <img src={photo.url} alt={"Member profile photo "+photo.position}/>
      </button>)}
    </div>}
    {selected&&<EnlargedPhoto photo={selected} onClose={()=>setSelected(null)}/>}
  </section>;
}
