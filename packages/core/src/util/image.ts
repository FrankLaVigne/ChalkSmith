export type ImageKind =
  | { mime: 'image/png'; ext: 'png' }
  | { mime: 'image/jpeg'; ext: 'jpg' }
  | { mime: 'image/gif'; ext: 'gif' }
  | { mime: 'image/webp'; ext: 'webp' };

const ascii = (b: Uint8Array, at: number, s: string) =>
  s.split('').every((c, i) => b[at + i] === c.charCodeAt(0));

export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 'PNG')) return { mime: 'image/png', ext: 'png' };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 6 && ascii(b, 0, 'GIF8')) return { mime: 'image/gif', ext: 'gif' };
  if (b.length >= 12 && ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export function imageSize(b: Uint8Array, kind: ImageKind): { w: number; h: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  switch (kind.ext) {
    case 'png':
      return b.length >= 24 ? { w: dv.getUint32(16), h: dv.getUint32(20) } : null;
    case 'gif':
      return b.length >= 10 ? { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) } : null;
    case 'jpg': {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m === 0xff) { i++; continue; }
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        const len = (b[i + 2] << 8) | b[i + 3];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
        }
        i += 2 + len;
      }
      return null;
    }
    case 'webp': {
      if (b.length < 30) return null;
      if (ascii(b, 12, 'VP8X')) {
        return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
      }
      if (ascii(b, 12, 'VP8 ')) {
        return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
      }
      if (ascii(b, 12, 'VP8L')) {
        return {
          w: 1 + (((b[22] & 0x3f) << 8) | b[21]),
          h: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
        };
      }
      return null;
    }
  }
}

export function mimeForAsset(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return ({ png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' } as Record<string, string>)[ext]
    ?? 'application/octet-stream';
}
