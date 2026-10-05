/**
 * تقدير مدة المقطع الصوتي من رأس الملف (بلا فك ترميز ولا اعتماد على أدوات خارجية)، لفرض سقف المدة في الخادم
 * لا في المتصفح وحده. يدعم ogg (Opus وVorbis) وmp4/m4a وwav وmp3 (تقدير CBR). غير المعروف ⟵ null،
 * ويبقى السقف الحجمي وقياس الخادم بعد التفريغ (توكنز الصوت ÷ 32 للثانية) خط دفاع ثانياً.
 */

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

function ogg(b: Uint8Array): number | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let rate = 0;
  const head = ascii(b, 0, Math.min(b.length, 400));
  if (head.includes("OpusHead")) rate = 48_000;
  else {
    const i = head.indexOf("\x01vorbis");
    if (i >= 0 && i + 16 <= b.length) rate = dv.getUint32(i + 12, true);
  }
  if (!rate) return null;
  let last = -1;
  for (let i = b.length - 14; i >= 0; i--) {
    if (b[i] === 0x4f && b[i + 1] === 0x67 && b[i + 2] === 0x67 && b[i + 3] === 0x53) { last = i; break; }
  }
  if (last < 0) return null;
  const lo = dv.getUint32(last + 6, true);
  const hi = dv.getUint32(last + 10, true);
  const granule = hi * 2 ** 32 + lo;
  return granule > 0 ? granule / rate : null;
}

function mp4(b: Uint8Array): number | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const walk = (from: number, to: number): number | null => {
    let p = from;
    while (p + 8 <= to) {
      let size = dv.getUint32(p);
      const type = ascii(b, p + 4, 4);
      let hdr = 8;
      if (size === 1 && p + 16 <= to) { size = dv.getUint32(p + 8) * 2 ** 32 + dv.getUint32(p + 12); hdr = 16; }
      if (size === 0) size = to - p;
      if (size < hdr) return null;
      if (type === "moov") { const r = walk(p + hdr, Math.min(to, p + size)); if (r !== null) return r; }
      if (type === "mvhd") {
        const v = b[p + hdr];
        const ts = v === 1 ? dv.getUint32(p + hdr + 20) : dv.getUint32(p + hdr + 12);
        const du = v === 1 ? dv.getUint32(p + hdr + 24) * 2 ** 32 + dv.getUint32(p + hdr + 28) : dv.getUint32(p + hdr + 16);
        return ts ? du / ts : null;
      }
      p += size;
    }
    return null;
  };
  return walk(0, b.length);
}

function wav(b: Uint8Array): number | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 12;
  let byteRate = 0;
  while (p + 8 <= b.length) {
    const id = ascii(b, p, 4);
    const size = dv.getUint32(p + 4, true);
    if (id === "fmt ") byteRate = dv.getUint32(p + 16, true);
    if (id === "data") return byteRate ? Math.min(size, b.length - p - 8) / byteRate : null;
    p += 8 + size + (size % 2);
  }
  return null;
}

const BR = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
function mp3(b: Uint8Array): number | null {
  let p = 0;
  if (ascii(b, 0, 3) === "ID3" && b.length > 10) p = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]);
  for (let i = p; i < Math.min(b.length - 4, p + 4096); i++) {
    if (b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0 && ((b[i + 1] >> 3) & 3) === 3 && ((b[i + 1] >> 1) & 3) === 1) {
      const kbps = BR[b[i + 2] >> 4];
      if (kbps) return ((b.length - p) * 8) / (kbps * 1000);
    }
  }
  return null;
}

export function estimateAudioSeconds(bytes: Uint8Array): number | null {
  try {
    const h4 = ascii(bytes, 0, 4);
    if (h4 === "OggS") return ogg(bytes);
    if (h4 === "RIFF") return wav(bytes);
    if (ascii(bytes, 4, 4) === "ftyp") return mp4(bytes);
    return mp3(bytes);
  } catch {
    return null;
  }
}
