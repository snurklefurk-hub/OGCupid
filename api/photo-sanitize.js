// Enforce limits on the actual uploaded JPEG bytes, not browser declarations.
// Remove every APPn and COM segment (EXIF/GPS, ICC, comments, etc.) before
// storing. Canvas normally emits baseline JPEG; progressive and unusual marker
// sequences are rejected. Unmodified source uploads are never stored.
const MIN_DIMENSION=240;
const MAX_DIMENSION=2000;
const MAX_PIXELS=3_000_000;
const MAX_BYTES=2_500_000;
const appOrComment = marker => (marker >= 0xE0 && marker <= 0xEF) || marker === 0xFE;
export function sanitizeCroppedJpeg(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 80 || bytes.length > MAX_BYTES || bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
    throw new Error("Invalid or oversized JPEG");
  }
  const parts = [bytes.subarray(0,2)];
  let index=2, width=0, height=0, sawFrame=false, scanned=false, markerCount=0;
  while(index < bytes.length && ++markerCount < 100) {
    if(bytes[index] !== 0xFF) throw new Error("Invalid JPEG marker");
    const start=index;
    while(bytes[index] === 0xFF) index++;
    if(index >= bytes.length) throw new Error("Truncated JPEG");
    const marker=bytes[index++];
    if(marker === 0xD8 || marker === 0xD9 || marker === 0x00 ||
       marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
      throw new Error("Unsupported JPEG header");
    }
    if(index + 1 >= bytes.length) throw new Error("Truncated JPEG segment");
    const length=bytes[index]*256+bytes[index+1];
    if(length < 2 || index+length > bytes.length) throw new Error("Invalid JPEG segment size");
    const end=index+length;
    if(marker === 0xC0) {
      if(sawFrame || length < 11 || bytes[index+2]!==8 || bytes[index+7]!==3) {
        throw new Error("Unsupported JPEG frame");
      }
      height = bytes[index+3]*256+bytes[index+4];
      width = bytes[index+5]*256+bytes[index+6];
      if(width<MIN_DIMENSION || height<MIN_DIMENSION ||
         width>MAX_DIMENSION || height>MAX_DIMENSION || width*height>MAX_PIXELS) {
        throw new Error("Cropped picture dimensions are outside the allowed range");
      }
      sawFrame=true;
    } else if (marker===0xC2 || (marker >=0xC0 && marker<=0xCF && ![0xC0,0xC4].includes(marker))) {
      throw new Error("Unsupported JPEG compression");
    }
    if(marker === 0xDA) {
      if(!sawFrame || scanned) throw new Error("Invalid JPEG image data");
      scanned=true;
      parts.push(bytes.subarray(start,end));
      // Baseline JPEG contains one entropy-coded scan. Ensure the end marker
      // exists and reject trailing payloads and extraneous nested markers.
      let p=end;
      while(p<bytes.length-1) {
        if(bytes[p++]!==0xFF) continue;
        const follower=bytes[p++];
        if(follower===0x00 || (follower>=0xD0 && follower<=0xD7)) continue;
        if(follower===0xFF) { p--; continue; }
        if(follower!==0xD9 || p!==bytes.length) throw new Error("Invalid JPEG scan termination");
        parts.push(bytes.subarray(end,p));
        const total=parts.reduce((n,x)=>n+x.length,0);
        if(total>MAX_BYTES) throw new Error("JPEG too large");
        const result=new Uint8Array(total);let offset=0;
        for(const part of parts){result.set(part,offset);offset+=part.length;}
        return { bytes:result,width,height };
      }
      throw new Error("JPEG end marker missing");
    }
    if(!appOrComment(marker)) parts.push(bytes.subarray(start,end));
    index=end;
  }
  throw new Error("Incomplete JPEG");
}
