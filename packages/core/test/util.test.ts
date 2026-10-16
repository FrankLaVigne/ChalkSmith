import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  round4, parseCssColor, rgbaToCss, sha256Hex, base64ToBytes, bytesToBase64,
  sniffImage, imageSize, mimeForAsset, ChalkError, seqIds,
} from '../src/index';

describe('round4', () => {
  it('rounds to 4 decimals and never returns -0', () => {
    expect(round4(0.4000000059604645)).toBe(0.4);
    expect(round4(1.23456)).toBe(1.2346);
    expect(Object.is(round4(-0.00001), 0)).toBe(true);
  });
});

describe('colours', () => {
  it('parses rgba, rgb and hex', () => {
    expect(parseCssColor('rgba(31,31,31,1)')).toEqual({ r: 31, g: 31, b: 31, a: 1 });
    expect(parseCssColor('rgba(253, 132, 45, 0.4000000059604645)')).toEqual({ r: 253, g: 132, b: 45, a: 0.4 });
    expect(parseCssColor('rgb(300, 0, 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseCssColor('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor('#abc')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
  });
  it('rejects non-colours', () => {
    expect(parseCssColor('url(#-0)')).toBeNull();
    expect(parseCssColor('')).toBeNull();
  });
  it('formats rgba', () => {
    expect(rgbaToCss({ r: 1, g: 2, b: 3, a: 0.4 })).toBe('rgba(1,2,3,0.4)');
  });
});

describe('sha256', () => {
  it('matches known vectors', () => {
    expect(sha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('matches node:crypto across block boundaries', () => {
    for (const n of [1, 55, 56, 63, 64, 65, 1000, 100_000]) {
      const b = new Uint8Array(randomBytes(n));
      expect(sha256Hex(b)).toBe(createHash('sha256').update(b).digest('hex'));
    }
  });
});

describe('base64', () => {
  it('round-trips and matches Buffer', () => {
    const b = new Uint8Array(randomBytes(100_003));
    const s = bytesToBase64(b);
    expect(s).toBe(Buffer.from(b).toString('base64'));
    expect(base64ToBytes(s)).toEqual(b);
  });
});

function pngHeader(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
}

describe('images', () => {
  it('sniffs and sizes PNG', () => {
    const b = pngHeader(1706, 1006);
    const k = sniffImage(b)!;
    expect(k).toEqual({ mime: 'image/png', ext: 'png' });
    expect(imageSize(b, k)).toEqual({ w: 1706, h: 1006 });
  });
  it('sniffs and sizes JPEG via SOF0', () => {
    const b = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x40, 0x03, 0, 0, 0, 0, 0, 0,
    ]);
    const k = sniffImage(b)!;
    expect(k.ext).toBe('jpg');
    expect(imageSize(b, k)).toEqual({ w: 64, h: 32 });
  });
  it('sniffs and sizes GIF', () => {
    const b = new Uint8Array([71, 73, 70, 56, 57, 97, 10, 0, 20, 0, 0, 0]);
    const k = sniffImage(b)!;
    expect(k.ext).toBe('gif');
    expect(imageSize(b, k)).toEqual({ w: 10, h: 20 });
  });
  it('sniffs and sizes WebP VP8X', () => {
    const b = new Uint8Array(30);
    b.set([82, 73, 70, 70], 0); b.set([87, 69, 66, 80], 8); b.set([86, 80, 56, 88], 12);
    b.set([99, 0, 0], 24); b.set([49, 0, 0], 27); // w-1 = 99, h-1 = 49
    const k = sniffImage(b)!;
    expect(k.ext).toBe('webp');
    expect(imageSize(b, k)).toEqual({ w: 100, h: 50 });
  });
  it('rejects unknown bytes and maps asset paths to MIME types', () => {
    expect(sniffImage(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(mimeForAsset('assets/ab.jpg')).toBe('image/jpeg');
    expect(mimeForAsset('assets/ab.png')).toBe('image/png');
  });
});

describe('errors and ids', () => {
  it('carries a code', () => {
    const e = new ChalkError('NotAZip', 'nope');
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('NotAZip');
    expect(e.message).toBe('nope');
  });
  it('generates sequential ids', () => {
    const g = seqIds();
    expect([g(), g()]).toEqual(['id-1', 'id-2']);
  });
});
