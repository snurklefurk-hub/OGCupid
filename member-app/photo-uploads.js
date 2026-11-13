import { ProfilePhotoCropper } from "./photo-cropper.js";

// Owner-facing photo album. Downloaded photo bytes only become ephemeral blob:
// URLs in the signed-in browser session; no public S3 URLs are used.
export function createPhotoUI({ requestJson, requestImage, uploadJpeg, onPhotosChanged }) {
  const el = id => document.getElementById(id);
  const chooser = el("photo-file");
  const cropDialog = el("photo-crop-dialog");
  const cropper = new ProfilePhotoCropper(el("photo-crop-canvas"));
  const ratio = el("photo-crop-ratio");
  const zoom = el("photo-crop-zoom");
  const save = el("photo-crop-save");
  const gallery = el("photo-gallery");
  const status = el("photo-status");
  let photos = [];
  let urls = [];
  let generation = 0;
  let activeUser = null;
  let pending = false;
  let profileReady = false;

  function setStatus(text, isError=false) {
    status.textContent = text;
    status.classList.toggle("photo-error", isError);
  }
  function clearUrls() { urls.forEach(url => URL.revokeObjectURL(url)); urls=[]; }
  function reportChanged(){ onPhotosChanged?.(photos.length); }
  async function load(userId) {
    const loadId = ++generation;
    activeUser = userId;
    clearUrls();
    gallery.replaceChildren();
    if (!userId) { photos=[]; reportChanged(); setStatus(""); return; }
    setStatus("Loading your photos…");
    const tempUrls=[];
    try {
      const data = await requestJson("GET", "/photos");
      if (loadId !== generation) return;
      const records = Array.isArray(data.photos) ? data.photos : [];
      const rendered=[];
      for(const photo of records){
        const blob = await requestImage("/photos/" + encodeURIComponent(photo.id) + "/bytes");
        if(loadId !== generation) return;
        const url=URL.createObjectURL(blob);
        tempUrls.push(url);
        rendered.push({...photo,url});
      }
      clearUrls();
      photos = rendered;
      urls = [...tempUrls];
      tempUrls.length=0;
      render();
      reportChanged();
      setStatus("");
    } catch {
      if (loadId === generation) {
        photos=[];
        render();
        reportChanged();
        setStatus("Couldn't load your photos. Please try refreshing the page.",true);
      }
    } finally {
      tempUrls.forEach(url=>URL.revokeObjectURL(url));
    }
  }
  function render() {
    gallery.replaceChildren();
    el("photo-count").textContent = photos.length + " of 5 photos";
    chooser.disabled = !profileReady || photos.length >= 5;
    for (const [index,photo] of photos.entries()) {
      const card = document.createElement("article");
      card.className = "photo-gallery-item";
      const img = document.createElement("img");
      img.src = photo.url;
      img.alt = photo.isPrimary ? "Your primary profile photo" : "Your profile photo " + (index+1);
      img.loading = "lazy";
      const caption = document.createElement("div");
      caption.className = "photo-gallery-caption";
      const label = document.createElement("strong");
      label.textContent = photo.isPrimary ? "Main profile picture" : "Photo " + (index + 1);
      caption.appendChild(label);
      const actions = document.createElement("div");
      actions.className = "photo-gallery-actions";
      const addButton = (title,action,disabled=false) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = title;
        button.disabled = disabled || pending;
        button.addEventListener("click", async () => {
          if (pending) return;
          pending = true;
          setStatus("Updating your album…");
          try {
            await action();
            await load(activeUser);
          } catch(err) {
            setStatus(err instanceof Error ? err.message : "Couldn't update your photos",true);
          } finally { pending=false; }
        });
        actions.appendChild(button);
      };
      if (!photo.isPrimary) {
        addButton("Make primary", () => requestJson("POST","/photos/"+photo.id+"/primary"));
      }
      addButton("Move left", async()=> {
        const order=photos.map(p=>p.id);
        [order[index],order[index-1]]=[order[index-1],order[index]];
        await requestJson("PUT","/photos/order",{order});
      },index===0);
      addButton("Move right", async()=> {
        const order=photos.map(p=>p.id);
        [order[index],order[index+1]]=[order[index+1],order[index]];
        await requestJson("PUT","/photos/order",{order});
      },index===photos.length-1);
      addButton("Delete", async()=> {
        if (!window.confirm("Remove this photo from your profile?")) return;
        await requestJson("DELETE","/photos/"+photo.id);
      });
      caption.appendChild(actions);
      card.append(img,caption);
      gallery.appendChild(card);
    }
    if (!photos.length) {
      const empty=document.createElement("p");
      empty.className="photo-gallery-empty";
      empty.textContent="No pictures yet. Start by picking a photo above.";
      gallery.appendChild(empty);
    }
  }

  function close() {
    if (cropDialog.open) cropDialog.close();
    cropper.dispose();
    chooser.value = "";
  }
  chooser.addEventListener("change", async()=> {
    const file=chooser.files?.[0];
    if (!file) return;
    if(!profileReady) { setStatus("Save your written profile before adding pictures.",true); chooser.value=""; return; }
    if (photos.length>=5) { setStatus("Five photos is the limit for now.",true); chooser.value=""; return; }
    try {
      await cropper.open(file);
      ratio.value="square";
      zoom.value="1";
      cropDialog.showModal();
      setStatus("");
    } catch(err) {
      setStatus(err instanceof Error ? err.message : "Couldn't open that image",true);
      chooser.value="";
    }
  });
  ratio.addEventListener("change",()=>cropper.setRatio(ratio.value));
  zoom.addEventListener("input",()=>cropper.setZoom(zoom.value));
  el("photo-crop-close").addEventListener("click",close);
  el("photo-crop-cancel").addEventListener("click",close);
  cropDialog.addEventListener("close",()=>{cropper.dispose();chooser.value="";});
  save.addEventListener("click",async()=>{
    if (pending || !activeUser || photos.length>=5) return;
    pending=true;
    save.disabled=true;
    setStatus("Saving your cropped photo…");
    try {
      const jpeg=await cropper.exportJpeg();
      await uploadJpeg(jpeg);
      close();
      await load(activeUser);
      setStatus("Photo saved to your album.");
    } catch(err) {
      setStatus(err instanceof Error ? err.message : "Couldn't save photo",true);
    } finally { pending=false; save.disabled=false; }
  });

  function reset() {
    ++generation;
    activeUser=null;
    cropper.dispose();
    if (cropDialog.open) cropDialog.close();
    chooser.value="";
    clearUrls();
    photos=[];
    profileReady=false;
    chooser.disabled=true;
    gallery.replaceChildren();
    setStatus("");
    reportChanged();
  }
  function setProfileReady(value) {
    profileReady = value === true;
    chooser.disabled = !profileReady || photos.length >= 5;
    el("photo-file-hint").textContent = profileReady
      ? "JPEG, PNG or WebP; up to 15 MB before cropping. Your final picture will be a JPEG."
      : "Save your written profile first, then come back to add photos.";
  }
  return { load, reset, setProfileReady, get count(){return photos.length;},
    get primaryUrl(){return photos.find(photo=>photo.isPrimary)?.url || null;} };
}
