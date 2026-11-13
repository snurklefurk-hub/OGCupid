// OG Cupid profile photo cropper. Browser canvas outputs a new JPEG, not the
// original file. The server must validate the bytes and strip metadata again.
const RATIOS = Object.freeze({ square: 1, portrait: 4/5, landscape: 3/2 });
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function cropRect(width, height, ratio = "square", zoom = 1, panX = 0, panY = 0) {
  if (![width, height].every(v => Number.isFinite(v) && v > 0)) {
    throw new Error("Invalid image size");
  }
  const aspect = RATIOS[ratio];
  if (!aspect) throw new Error("Invalid crop ratio");
  const z = clamp(Number(zoom) || 1, 1, 3);
  const maxWidth = Math.min(width, height * aspect);
  const maxHeight = maxWidth / aspect;
  const w = maxWidth / z;
  const h = maxHeight / z;
  const x = clamp((width - w) / 2 + clamp(panX, -1, 1) * (width - w) / 2, 0, width - w);
  const y = clamp((height - h) / 2 + clamp(panY, -1, 1) * (height - h) / 2, 0, height - h);
  return { x, y, width: w, height: h, ratio: aspect };
}

function exportAsJpeg(canvas, quality = 0.85) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob && blob.size
      ? resolve(blob)
      : reject(new Error("Couldn't prepare this photo")), "image/jpeg", quality);
  });
}

export class ProfilePhotoCropper {
  constructor(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Crop preview canvas missing");
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    if (!this.ctx) throw new Error("Photo preview is unavailable in this browser");
    this.bitmap = null;
    this.ratio = "square";
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.lastPointer = null;
    this.canvas.style.touchAction = "none";
    this.canvas.addEventListener("pointerdown", e => {
      if (!this.bitmap) return;
      this.lastPointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", e => {
      if (!this.bitmap || !this.lastPointer || this.lastPointer.id !== e.pointerId) return;
      const rect = this.canvas.getBoundingClientRect();
      // Positive pointer movement shifts the photo in that direction.
      const normalizedDX = 2 * (e.clientX - this.lastPointer.x) / Math.max(1, rect.width);
      const normalizedDY = 2 * (e.clientY - this.lastPointer.y) / Math.max(1, rect.height);
      this.panX = clamp(this.panX - normalizedDX, -1, 1);
      this.panY = clamp(this.panY - normalizedDY, -1, 1);
      this.lastPointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.draw();
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
      this.canvas.addEventListener(name, () => { this.lastPointer = null; });
    }
  }
  async open(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) {
      throw new Error("Choose a JPEG, PNG or WebP picture");
    }
    if (file.size > 15 * 1024 * 1024) throw new Error("Choose a picture under 15 MB");
    const decoded = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (decoded.width < 250 || decoded.height < 250 ||
        decoded.width * decoded.height > 35_000_000) {
      decoded.close();
      throw new Error("Choose a picture at least 250px wide and high, under 35 megapixels");
    }
    this.bitmap?.close();
    this.bitmap = decoded;
    this.panX = this.panY = 0;
    this.zoom = 1;
    this.ratio = "square";
    this.draw();
  }
  setRatio(ratio) {
    if (!(ratio in RATIOS)) throw new Error("Invalid photo crop");
    this.ratio = ratio;
    this.panX = this.panY = 0;
    this.draw();
  }
  setZoom(zoom) {
    this.zoom = clamp(Number(zoom) || 1, 1, 3);
    this.draw();
  }
  draw() {
    if (!this.bitmap) return;
    const r = cropRect(this.bitmap.width, this.bitmap.height, this.ratio, this.zoom, this.panX, this.panY);
    const targetWidth = 600;
    const targetHeight = Math.round(targetWidth / r.ratio);
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }
    this.ctx.drawImage(this.bitmap, r.x, r.y, r.width, r.height, 0, 0, targetWidth, targetHeight);
  }
  async exportJpeg() {
    if (!this.bitmap) throw new Error("Choose a photo first");
    const r = cropRect(this.bitmap.width, this.bitmap.height, this.ratio, this.zoom, this.panX, this.panY);
    // Cap final dimensions to keep storage and upload bandwidth low.
    const width = this.ratio === "portrait" ? 960 : 1200;
    const height = Math.round(width / r.ratio);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Couldn't prepare the cropped image");
    ctx.drawImage(this.bitmap, r.x, r.y, r.width, r.height, 0, 0, width, height);
    const blob = await exportAsJpeg(canvas);
    if (blob.size > 2 * 1024 * 1024) throw new Error("Cropped photo is too large; try another picture");
    return blob;
  }
  dispose() {
    this.bitmap?.close();
    this.bitmap = null;
    this.lastPointer = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
