import { describe, expect, it, vi } from 'vitest';
import { rescueWhiteboardZip, seqIds, ChalkError, applyAffine, type ExportLimits, type Group } from '../src/index';
import { FIXTURES } from '../fixtures/catalog';

const rescue = (name: string, limits?: ExportLimits) =>
  rescueWhiteboardZip(FIXTURES[name](), { idGen: seqIds(), limits });
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ChalkError).code; } return 'none'; };

describe('ink import', () => {
  it('imports a pen group with correct placement and width', () => {
    const r = rescue('pen-basic');
    expect(r.report.counts).toMatchObject({ groups: 1, strokes: 1, points: 3, images: 0 });
    const g = r.board.objects[0] as Group;
    expect(g.kind).toBe('group');
    expect(g.source).toEqual({ system: 'ms-whiteboard', id: 'pen1' });
    // Fixture anchors the group at canvas (100, 50); e,f equal the viewBox origin.
    expect(applyAffine(g.transform, 0, 0)).toEqual([100, 50]);
    const s = g.children[0];
    expect(s.points).toEqual([0, 0, 10, 0, 20, 0]);
    expect(s.width).toBe(4); // from arc radius, NOT the 8140.93 hit-test width
    expect(s.color).toEqual({ r: 31, g: 31, b: 31, a: 1 });
    expect(s.tool).toBe('pen');
    expect(s.sourceOutline!.startsWith('M0,2')).toBe(true);
  });
  it('recovers per-point widths within 5% for interior points', () => {
    const s = (rescue('pen-variable-width').board.objects[0] as Group).children[0];
    expect(s.width).toBe(8);
    for (let i = 1; i < 10; i++) {
      const expected = (2 * (128 + (384 * i) / 10)) / 128;
      expect(Math.abs(s.widths![i] - expected) / expected).toBeLessThan(0.05);
    }
  });
  it('imports highlighters using the long side of the tip, without per-point widths', () => {
    const s = (rescue('highlighter').board.objects[0] as Group).children[0];
    expect(s.tool).toBe('highlighter');
    expect(s.width).toBe(9.2969);
    expect(s.color.a).toBe(0.4);
    expect(s.widths).toBeUndefined();
  });
  it('maps textured pens to a ChalkSmith texture and reports the substitution', () => {
    const r = rescue('texture-galaxy');
    const s = (r.board.objects[0] as Group).children[0];
    expect(s.brush).toEqual({ kind: 'texture', name: 'galaxy', origin: [0, 0], scale: 0.5 });
    expect(s.color).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(r.report.substitutions).toEqual([{ texture: 'galaxy', strokes: 1 }]);
  });
  it('reads background and view', () => {
    const r = rescue('pen-basic');
    expect(r.board.background.color).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(r.board.view).toEqual({ x: -100, y: -40, zoom: 0.5 });
  });
  it('skips malformed strokes but keeps the rest of the group', () => {
    const r = rescue('malformed-stroke');
    expect(r.report.counts.strokes).toBe(1);
    expect(r.report.skipped).toHaveLength(1);
    expect(r.report.skipped[0].sourceId).toBe('bads1');
  });
  it('warns about rotated groups', () => {
    expect(rescue('rotated-group').report.warnings.some((w) => w.includes('rotated or scaled'))).toBe(true);
  });
  it('never contacts the network', () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('network used'); });
    try { rescue('texture-galaxy'); } finally { spy.mockRestore(); }
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('whole-file errors', () => {
  it('rejects non-zips, missing html, missing canvas', () => {
    expect(code(() => rescue('not-a-zip'))).toBe('NotAZip');
    expect(code(() => rescue('no-html'))).toBe('NoBoardHtml');
    expect(code(() => rescue('no-canvas'))).toBe('NoBoardHtml');
  });
  it('enforces size limits', () => {
    expect(code(() => rescue('pen-basic', { maxEntries: 64, maxTotalBytes: 1024 ** 3, maxEntryBytes: 100 }))).toBe('TooLarge');
    expect(code(() => rescue('pen-basic', { maxEntries: 1, maxTotalBytes: 1024 ** 3, maxEntryBytes: 1024 ** 3 }))).toBe('TooLarge');
    expect(code(() => rescue('pen-basic', { maxEntries: 64, maxTotalBytes: 100, maxEntryBytes: 1024 ** 3 }))).toBe('TooLarge');
  });
  it('does not modify the input bytes', () => {
    const bytes = FIXTURES['pen-basic']();
    const copy = bytes.slice();
    rescueWhiteboardZip(bytes);
    expect(bytes).toEqual(copy);
  });
});
