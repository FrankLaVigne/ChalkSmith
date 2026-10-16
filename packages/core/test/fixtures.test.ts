import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { imageSize, sniffImage, parsePath, maxArcRadius } from '../src/index';
import { buildExportHtml, buildExportZip, makePng, penOutline } from '../fixtures/build';
import { FIXTURES } from '../fixtures/catalog';

describe('fixture builder', () => {
  it('builds a ZIP with board HTML and comments', () => {
    const z = unzipSync(buildExportZip(buildExportHtml({ objects: [] }), { name: 'Board' }));
    expect(Object.keys(z).sort()).toEqual(['Board-comments.json', 'Board.html']);
    expect(strFromU8(z['Board.html'])).toContain('id="canvasContent"');
  });
  it('makes real PNGs', () => {
    const p = makePng(80, 40);
    const k = sniffImage(p)!;
    expect(imageSize(p, k)).toEqual({ w: 80, h: 40 });
  });
  it('emits arcs that carry the half-width', () => {
    const d = penOutline([[0, 0], [1280, 0], [2560, 0]], [128, 512, 256]);
    expect(maxArcRadius(parsePath(d))).toBe(512);
    expect(penOutline([[0, 0]], [256])).toMatch(/^M-256,0A256,256/);
  });
  it('builds every catalog entry', () => {
    for (const [name, make] of Object.entries(FIXTURES)) expect(make().length, name).toBeGreaterThan(0);
  });
});
