import { describe, expect, it } from 'vitest';
import {
  strokeOutline, generateOutline, translateStroke, translateObject, parsePath, pathPolygons, polysBbox,
  galaxyStars, mulberry32, TEXTURE_TILE, type Stroke, type Group, type Unsupported,
} from '../src/index';

const base: Stroke = {
  kind: 'stroke', id: 's', tool: 'pen', color: { r: 0, g: 0, b: 0, a: 1 }, width: 10,
  points: [0, 0, 50, 0, 100, 0], brush: { kind: 'solid' },
};
const bboxOf = (d: string) => polysBbox(pathPolygons(parsePath(d)))!;

describe('strokeOutline', () => {
  it('returns the source outline while unedited', () => {
    expect(strokeOutline({ ...base, sourceOutline: 'M0,0L1,1' })).toBe('M0,0L1,1');
  });
  it('regenerates once edited', () => {
    const d = strokeOutline({ ...base, sourceOutline: 'M0,0L1,1', editedAt: '2026-01-01T00:00:00Z' });
    expect(d).not.toBe('M0,0L1,1');
    expect(d.startsWith('M')).toBe(true);
  });
});

describe('generateOutline', () => {
  it('draws constant width when there are no per-point widths', () => {
    const b = bboxOf(generateOutline(base));
    expect(b.h).toBeGreaterThan(9);
    expect(b.h).toBeLessThan(11);
  });
  it('honours per-point widths up to the nominal width', () => {
    const b = bboxOf(generateOutline({ ...base, widths: [2, 10, 2] }));
    expect(b.h).toBeLessThan(11);
    expect(b.h).toBeGreaterThan(5);
  });
  it('never produces NaN for degenerate strokes', () => {
    for (const points of [[5, 5], [5, 5, 5, 5, 5, 5]]) {
      const d = generateOutline({ ...base, points, widths: points.map(() => 10).slice(0, points.length / 2) });
      expect(d).not.toContain('NaN');
      expect(d.length).toBeGreaterThan(0);
    }
    expect(generateOutline({ ...base, points: [] })).toBe('');
  });
});

describe('translate', () => {
  it('moves points, outline and texture origin without marking the stroke edited', () => {
    const s: Stroke = { ...base, sourceOutline: 'M0,0L10,0', brush: { kind: 'texture', name: 'galaxy', origin: [1, 2], scale: 0.5 } };
    const t = translateStroke(s, 3, 4);
    expect(t.points).toEqual([3, 4, 53, 4, 103, 4]);
    expect(t.sourceOutline).toBe('M3,4L13,4');
    expect(t.brush).toEqual({ kind: 'texture', name: 'galaxy', origin: [4, 6], scale: 0.5 });
    expect(t.editedAt).toBeUndefined();
    expect(s.points).toEqual([0, 0, 50, 0, 100, 0]);
  });
  it('moves groups by transform, and keeps null bboxes null', () => {
    const g: Group = { kind: 'group', id: 'g', transform: [1, 0, 0, 1, 10, 10], children: [base] };
    expect((translateObject(g, 5, -5) as Group).transform).toEqual([1, 0, 0, 1, 15, 5]);
    const u: Unsupported = { kind: 'unsupported', id: 'u', sourceType: 'X', bbox: null };
    expect(translateObject(u, 1, 1)).toEqual(u);
  });
});

describe('textures', () => {
  it('is deterministic and within the tile', () => {
    expect(mulberry32(1)()).toBe(mulberry32(1)());
    const a = galaxyStars();
    expect(a).toEqual(galaxyStars());
    for (const s of a) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(TEXTURE_TILE);
    }
  });
});
