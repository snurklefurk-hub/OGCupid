import React,{useCallback,useEffect,useState} from "react";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import "./account.css";

// Export browser-rendered baseline JPEG without original EXIF, GPS or metadata.
// The server independently validates and strips ancillary JPEG segments.
export async function preparePhoto(file){
  if(!(file instanceof Blob)||file.size>20_000_000||file.size<80)
    throw Error("Choose an image under 20 MB.");
  const bitmap=await createImageBitmap(file);
  try{
    if(bitmap.width<240||bitmap.height<240)throw Error("Photo must be at least 240 pixels on each side.");
    const scale=Math.min(1,1900/bitmap.width,1900/bitmap.height,
      Math.sqrt(2_850_000/(bitmap.width*bitmap.height)));
    const w=Math.floor(bitmap.width*scale),h=Math.floor(bitmap.height*scale);
    if(w<240||h<240)throw Error("This image is too narrow after resizing.");
    const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d");
    if(!ctx)throw Error("Your browser cannot prepare this photo.");
    ctx.drawImage(bitmap,0,0,w,h);
    for(const quality of [0.86,0.7,0.55]){
      const output=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
      if(output?.type==="image/jpeg"&&output.size>80&&output.size<=2_500_000)return output;
    }
    throw Error("Image is too large to upload. Try a smaller photo.");
  }finally{bitmap.close();}
}
function usePhotoAlbum(userId){
  const {getMemberGallery,accountRequest}=useMemberSession();
  const [photos,setPhotos]=useState([]),[loading,setLoading]=useState(true);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    if(!userId)return;
    setLoading(true);setError("");
    try{
      const gallery=await getMemberGallery(userId);
      const urls=gallery.map(photo=>({...photo,url:URL.createObjectURL(photo.image)}));
      setPhotos(prev=>{for(const p of prev)URL.revokeObjectURL(p.url);return urls;});
    }catch{setError("Couldn't load your photos. Try refreshing.");}
    finally{setLoading(false);}
  },[userId,getMemberGallery]);
  useEffect(()=>{
    void load();
    return()=>setPhotos(prev=>{prev.forEach(x=>URL.revokeObjectURL(x.url));return [];});
  },[load]);
  async function perform(work){
    if(busy)return;
    setBusy(true);setError("");
    try{await work();await load();}
    catch(e){setError(e?.message||"Couldn't update your photos.");}
    finally{setBusy(false);}
  }
  async function upload(file){
    await perform(async()=>{
      const jpeg=await preparePhoto(file);
      const result=await accountRequest("/photos","POST",jpeg);
      if(!result?.photo?.id)throw Error("The upload wasn't confirmed.");
    });
  }
  async function makePrimary(id){await perform(async()=>{
    const result=await accountRequest("/photos/"+id+"/primary","POST");
    if(result.updated!==true)throw Error("Couldn't change the main photo.");
  });}
  async function remove(id){
    if(!window.confirm("Remove this photo from your profile?"))return;
    await perform(async()=>{
      const result=await accountRequest("/photos/"+id,"DELETE");
      if(result.deleted!==true)throw Error("Photo wasn't removed.");
    });
  }
  return {photos,loading,error,busy,upload,makePrimary,remove,load};
}
export default function PhotoManager({onCompleted=null,onboarding=false}){
  const {user,kind,accountRequest}=useMemberSession();
  const album=usePhotoAlbum(user?.id);
  const [confirmed,setConfirmed]=useState(false),[saving,setSaving]=useState(false);
  const [message,setMessage]=useState(""),[error,setError]=useState("");
  async function finish(event){
    event.preventDefault();
    if(!confirmed||!album.photos.some(p=>p.isPrimary)||saving)return;
    setSaving(true);setError("");setMessage("");
    try{
      const result=await accountRequest("/onboarding","PUT",{step:"self-photo",confirmed:true});
      if(result.saved!==true)throw Error("Photo confirmation wasn't saved.");
      setMessage("Your main profile photo has been confirmed.");
      await onCompleted?.();
    }catch(e){setError(e?.message||"Photo confirmation failed.");}
    finally{setSaving(false);}
  }
  if(kind!=="member"&&kind!=="onboarding")return null;
  return <section className={onboarding?"ogcl-photo-manager":"ogcl-view ogcl-photo-manager"}>
    {!onboarding&&<header className="ogcl-view-head"><h1>Your Photos</h1>
      <p>Up to five private photos, visible only to signed-in OG Cupid members.</p></header>}
    <div className={onboarding?"":"ogcl-content-panel"}>
      <h2>{onboarding?"Pick a photo of yourself":"Manage your photos"}</h2>
      <p>Photos are processed in your browser to remove metadata. The server verifies and protects them.</p>
      <label className="ogcl-photo-picker">Add photo
        <input type="file" accept="image/*" disabled={album.busy||album.photos.length>=5}
          onChange={e=>{const file=e.target.files?.[0];e.target.value="";
            if(file)void album.upload(file);}}/>
      </label>
      <p>{album.photos.length} of 5 photos</p>
      {album.loading&&<p role="status">Loading your photos…</p>}
      {album.error&&<p role="alert" className="ogcl-error">{album.error}</p>}
      {album.photos.length>0&&<div className="ogcl-photo-grid">
        {album.photos.map((photo,i)=><article key={photo.id} className="ogcl-photo-card">
          <img src={photo.url} alt={photo.isPrimary?"Main profile photo":"Profile photo "+(i+1)}/>
          <strong>{photo.isPrimary?"Main profile picture":"Photo "+(i+1)}</strong>
          <div className="ogcl-photo-actions">
            {!photo.isPrimary&&<button type="button" disabled={album.busy} onClick={()=>void album.makePrimary(photo.id)}>Make primary</button>}
            <button type="button" disabled={album.busy} onClick={()=>void album.remove(photo.id)}>Remove</button>
          </div>
        </article>)}
      </div>}
      {onboarding&&<form className="ogcl-account-form" onSubmit={finish}>
        <label className="ogcl-account-check">
          <input type="checkbox" checked={confirmed}
            onChange={e=>setConfirmed(e.target.checked)}/>
          I confirm my main profile picture is a genuine photo of me.
        </label>
        <button type="submit" disabled={!confirmed||!album.photos.some(p=>p.isPrimary)||saving||album.busy}>
          {saving?"Confirming…":"Confirm photo & continue"}
        </button>
      </form>}
      {error&&<p role="alert" className="ogcl-error">{error}</p>}
      {message&&<p role="status" className="ogcl-save-confirmation">{message}</p>}
    </div>
  </section>;
}