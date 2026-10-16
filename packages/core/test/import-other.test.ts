import { strFromU8 } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { rescueWhiteboardZip, seqIds, sha256Hex, COMMENTS_EXTENSION, type ImageObj, type Unsupported } from '../src/index';
import { FIXTURES, PNG_80x40 } from '../fixtures/catalog';

const rescue = (name: string) => rescueWhiteboardZip(FIXTURES[name](), { idGen: seqIds() });

describe('images', () => {
  it('places centre-anchored images and stores bytes by hash', () => {
    const r = rescue('image-centered');
    const im = r.board.objects[0] as ImageObj;
    expect(im).toMatchObject({ kind: 'image', x: 280, y: 190, w: 40, h: 20, intrinsic: { w: 80, h: 40 } });
    expect(im.asset).toBe(`assets/${sha256Hex(PNG_80x40)}.png`);
    expect(r.assets.get(im.asset)).toEqual(PNG_80x40);
    expect(r.report.counts.images).toBe(1);
  });
  it('never downloads external images', () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('network used'); });
    let r;
    try { r = rescue('external-image'); } finally { spy.mockRestore(); }
    expect(spy).not.toHaveBeenCalled();
    expect(r!.board.objects).toHaveLength(0);
    expect(r!.report.skipped[0].reason).toMatch(/not embedded/);
    expect(JSON.stringify(r!.board)).not.toContain('example.invalid');
  });
});

describe('unknown objects', () => {
  it('become placeholders with a bbox and no copied content', () => {
    const r = rescue('unknown-type');
    const u = r.board.objects[0] as Unsupported;
    expect(u).toMatchObject({ kind: 'unsupported', sourceType: 'StickyNote', bbox: { x: 10, y: 20, w: 100, h: 80 } });
    expect(r.report.counts.unsupported).toEqual({ StickyNote: 1 });
    expect(JSON.stringify(r.board)).not.toContain('secret text');
  });
  it('keeps document order across types', () => {
    const kinds = rescue('multi-group-order').board.objects.map((o) => o.kind);
    expect(kinds).toEqual(['group', 'image', 'group', 'unsupported']);
  });
});

describe('degenerate strokes', () => {
  it('import a single-point stroke without NaN', () => {
    const r = rescue('single-point');
    expect(r.report.counts.strokes).toBe(1);
    expect(JSON.stringify(r.board)).not.toContain('null');
    expect(JSON.stringify(r.board)).not.toMatch(/NaN|Infinity/);
  });
});

describe('comments', () => {
  it('keeps valid comments verbatim', () => {
    const r = rescue('with-comments');
    expect(strFromU8(r.extensions.get(COMMENTS_EXTENSION)!)).toContain('"t1"');
  });
  it('warns on invalid or missing comments', () => {
    expect(rescue('bad-comments').report.warnings).toContain('The comments file is not valid JSON and was not kept.');
    expect(rescue('no-comments').report.warnings).toContain('The export has no comments file.');
    expect(rescue('bad-comments').extensions.size).toBe(0);
  });
});
