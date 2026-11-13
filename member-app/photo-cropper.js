// Freeform uploaded photos; square thumbnails are presentation only.
// The server still validates JPEG bytes and strips metadata.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function cropRect(width, height, selection = { x: 0, y: 0, width, height }) {
  if (![width, height, selection.x, selection.y, selection.width, selection.height].every(Number.isFinite) ||
      width <= 0 || height <= 0 || selection.width <= 0 || selection.height <= 0) throw new Error('Invalid crop dimensions');
  const w = Math.min(width, selection.width), h = Math.min(height, selection.height);
  return { x: clamp(selection.x, 0, width - w), y: clamp(selection.y, 0, height - h), width: w, height: h };
}
export function resizeCrop(rect, handle, dx, dy, width, height) {
  if (handle === 'move') return cropRect(width, height, { ...rect, x: rect.x + dx, y: rect.y + dy });
  let left = rect.x, top = rect.y, right = left + rect.width, bottom = top + rect.height;
  const min = Math.min(40, width, height);
  if (handle.includes('w')) left = clamp(left + dx, 0, right - min);
  if (handle.includes('e')) right = clamp(right + dx, left + min, width);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - min);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + min, height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
export function exportSize(rect) {
  const scale = Math.max(Math.min(1, 1200 / Math.max(rect.width, rect.height)), 240 / Math.min(rect.width, rect.height));
  const width = Math.round(rect.width * scale), height = Math.round(rect.height * scale);
  if (Math.max(width, height) > 2000) throw new Error('This crop is too narrow. Include a little more of the photo.');
  return { width, height };
}
function exportAsJpeg(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob?.size
    ? resolve(blob) : reject(new Error("Couldn't prepare this photo")), 'image/jpeg', 0.85));
}
export class ProfilePhotoCropper {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('Photo preview is unavailable in this browser');
    this.bitmap = null; this.selection = null; this.drag = null;
    canvas.addEventListener('pointerdown', event => {
      if (!this.bitmap || (event.button !== undefined && event.button !== 0)) return;
      const point = this.point(event), handle = this.hit(point);
      if (!handle) return;
      event.preventDefault(); canvas.focus();
      this.drag = { id: event.pointerId, point, handle, rect: { ...this.selection } };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (!this.bitmap) return;
      const point = this.point(event);
      if (this.drag?.id === event.pointerId) {
        this.selection = resizeCrop(this.drag.rect, this.drag.handle, point.x - this.drag.point.x,
          point.y - this.drag.point.y, this.bitmap.width, this.bitmap.height);
        this.draw();
      }
      const handle = this.hit(point);
      canvas.style.cursor = handle === 'move' ? 'move' : handle ? `${handle}-resize` : 'default';
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { this.drag = null; });
    canvas.addEventListener('keydown', event => {
      if (!this.bitmap || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const step = Math.max(1, Math.round(Math.max(this.bitmap.width, this.bitmap.height) / 100));
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      this.selection = resizeCrop(this.selection, event.shiftKey ? 'se' : 'move', dx, dy, this.bitmap.width, this.bitmap.height);
      this.draw();
    });
  }
  point(event) {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * this.bitmap.width / bounds.width,
      y: (event.clientY - bounds.top) * this.bitmap.height / bounds.height };
  }
  hit(point) {
    const r = this.selection, bounds = this.canvas.getBoundingClientRect();
    const tx = 18 * this.bitmap.width / bounds.width, ty = 18 * this.bitmap.height / bounds.height;
    const x = point.x, y = point.y;
    if (x < r.x - tx || x > r.x + r.width + tx || y < r.y - ty || y > r.y + r.height + ty) return null;
    const vertical = Math.abs(y - r.y) < ty ? 'n' : Math.abs(y - r.y - r.height) < ty ? 's' : '';
    const horizontal = Math.abs(x - r.x) < tx ? 'w' : Math.abs(x - r.x - r.width) < tx ? 'e' : '';
    return vertical + horizontal || 'move';
  }
  async open(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Choose a JPEG, PNG or WebP picture');
    if (file.size > 15 * 1024 * 1024) throw new Error('Choose a picture under 15 MB');
    const decoded = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (decoded.width < 250 || decoded.height < 250 || decoded.width * decoded.height > 35_000_000) {
      decoded.close(); throw new Error('Choose a picture at least 250px wide and high, under 35 megapixels');
    }
    this.bitmap?.close(); this.bitmap = decoded;
    const scale = Math.min(600 / decoded.width, 500 / decoded.height);
    this.canvas.width = Math.round(decoded.width * scale); this.canvas.height = Math.round(decoded.height * scale);
    this.reset();
  }
  reset() {
    if (!this.bitmap) return;
    this.selection = cropRect(this.bitmap.width, this.bitmap.height); this.draw();
  }
  draw() {
    if (!this.bitmap) return;
    const ctx = this.ctx, canvas = this.canvas, r = this.selection;
    const sx = canvas.width / this.bitmap.width, sy = canvas.height / this.bitmap.height;
    const x = r.x * sx, y = r.y * sy, w = r.width * sx, h = r.height * sy;
    ctx.drawImage(this.bitmap, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(0, 0, canvas.width, y); ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h);
    ctx.fillRect(0, y, x, h); ctx.fillRect(x + w, y, canvas.width - x - w, h);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#fff';
    for (const [hx, hy] of [[x,y],[x+w/2,y],[x+w,y],[x,y+h/2],[x+w,y+h/2],[x,y+h],[x+w/2,y+h],[x+w,y+h]]) {
      ctx.fillRect(clamp(hx - 5, 0, canvas.width - 10), clamp(hy - 5, 0, canvas.height - 10), 10, 10);
    }
  }
  async exportJpeg() {
    if (!this.bitmap) throw new Error('Choose a photo first');
    const r = this.selection, size = exportSize(r), canvas = document.createElement('canvas');
    canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error("Couldn't prepare the cropped image");
    ctx.drawImage(this.bitmap, r.x, r.y, r.width, r.height, 0, 0, size.width, size.height);
    const blob = await exportAsJpeg(canvas);
    if (blob.size > 2 * 1024 * 1024) throw new Error('Cropped photo is too large; try another picture');
    return blob;
  }
  dispose() {
    this.bitmap?.close(); this.bitmap = null; this.selection = null; this.drag = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
