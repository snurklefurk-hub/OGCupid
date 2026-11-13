// Reusable member-profile photo presentation. Expects authenticated, private
// blob: URLs from the photo API, never S3 links or unsigned public storage.
export function orderedProfilePhotos(input) {
  if (!Array.isArray(input)) return [];
  const available = input.filter(photo =>
    photo && typeof photo.url === "string" && photo.url.startsWith("blob:"));
  // The main photo leads, with the remaining four in stored gallery order.
  return [
    ...available.filter(photo => photo.isPrimary === true).slice(0, 1),
    ...available.filter(photo => photo.isPrimary !== true),
  ].slice(0, 5);
}

export function createProfilePhotoGallery({
  primaryButton,
  thumbnailStrip,
  dialog,
  image,
  counter,
  previousButton,
  nextButton,
  closeButton,
}) {
  let photos = [];
  let index = 0;
  let returnFocus = null;

  function showImage() {
    if (!dialog.open || !photos.length) return;
    index = (index + photos.length) % photos.length;
    image.src = photos[index].url;
    image.alt = "Profile photo " + (index + 1) + " of " + photos.length;
    counter.textContent = (index + 1) + " of " + photos.length;
    const multiple = photos.length > 1;
    previousButton.hidden = !multiple;
    nextButton.hidden = !multiple;
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  function open(photoIndex, trigger) {
    if (!photos.length) return;
    index = photoIndex;
    returnFocus = trigger;
    if (!dialog.open) dialog.showModal();
    showImage();
    closeButton.focus();
  }

  function makeImage(photo, alt) {
    const img = document.createElement("img");
    img.src = photo.url;
    img.alt = alt;
    img.decoding = "async";
    return img;
  }

  function render() {
    if (dialog.open) close();
    image.removeAttribute("src");
    thumbnailStrip.replaceChildren();
    primaryButton.replaceChildren();
    const main = photos[0];
    primaryButton.disabled = !main;
    if (!main) {
      const placeholder = document.createElement("span");
      placeholder.className = "og-preview-photo-placeholder";
      placeholder.setAttribute("aria-hidden", "true");
      placeholder.textContent = "♥";
      primaryButton.appendChild(placeholder);
      primaryButton.setAttribute("aria-label", "No profile photos yet");
      return;
    }
    primaryButton.appendChild(makeImage(main, "Primary profile photo"));
    primaryButton.setAttribute("aria-label", "View primary profile photo, 1 of " + photos.length);
    for (let i = 1; i < photos.length; i++) {
      const photo = photos[i];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "og-preview-photo-thumb";
      button.setAttribute("aria-label", "View profile photo " + (i + 1) + " of " + photos.length);
      button.appendChild(makeImage(photo, ""));
      button.addEventListener("click", () => open(i, button));
      thumbnailStrip.appendChild(button);
    }
  }

  primaryButton.addEventListener("click", () => open(0, primaryButton));
  previousButton.addEventListener("click", () => {
    index--;
    showImage();
  });
  nextButton.addEventListener("click", () => {
    index++;
    showImage();
  });
  closeButton.addEventListener("click", close);
  dialog.addEventListener("keydown", event => {
    if (!dialog.open || !photos.length) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      index--;
      showImage();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      index++;
      showImage();
    }
  });
  dialog.addEventListener("close", () => {
    image.removeAttribute("src");
    const trigger = returnFocus;
    returnFocus = null;
    if (trigger?.isConnected) trigger.focus();
  });

  render();
  return {
    setPhotos(records) {
      photos = orderedProfilePhotos(records);
      index = 0;
      render();
    },
    reset() {
      photos = [];
      index = 0;
      render();
    },
  };
}
