import { describe, expect, it } from 'vitest';
import {
  parsePath, formatPath, mapPath, flattenArc, pathPolygons,
  pointsBbox, applyAffine, invertAffine, objectBounds, strokeBounds, boardBounds,
  maxArcRadius, penWidth, highlighterWidth, perPointWidths,
  type Affine, type Stroke, type Group,
} from '../src/index';

describe('parsePath', () => {
  it('parses observed Whiteboard syntax', () => {
    const s = parsePath('M1561,134L1498,226A149,149 0 0 0 1475,279L1416,555');
    expect(s).toEqual([
      { c: 'M', x: 1561, y: 134 },
      { c: 'L', x: 1498, y: 226 },
      { c: 'A', rx: 149, ry: 149, rot: 0, large: 0, sweep: 0, x: 1475, y: 279 },
      { c: 'L', x: 1416, y: 555 },
    ]);
  });
  it('treats extra pairs after M as L and parses Z', () => {
    expect(parsePath('M0,0 10,0 10,10Z').map((s) => s.c)).toEqual(['M', 'L', 'L', 'Z']);
  });
  it('rejects relative and unsupported commands', () => {
    expect(() => parsePath('m0,0l1,1')).toThrow();
    expect(() => parsePath('M0,0C1,1 2,2 3,3')).toThrow();
  });
  it('maps and formats', () => {
    const s = mapPath(parsePath('M128,256L-128,0A128,128 0 0 1 256,256'), 1 / 128, 0, 0);
    expect(formatPath(s)).toBe('M1,2L-1,0A1,1 0 0 1 2,2');
    expect(formatPath(mapPath(parsePath('M0,0L1,1Z'), 1, 10, 20))).toBe('M10,20L11,21Z');
  });
});

describe('flattenArc', () => {
  const dist = ([x, y]: [number, number], cx: number, cy: number) => Math.hypot(x - cx, y - cy);
  it('samples a semicircle on the side chosen by sweep', () => {
    const up = flattenArc(-1, 0, 1, 0, 1, 1, 0, 8);
    const down = flattenArc(-1, 0, 1, 0, 0, 1, 0, 8);
    expect(up).toHaveLength(7);
    for (const p of [...up, ...down]) expect(dist(p, 0, 0)).toBeCloseTo(1, 6);
    expect(up[3][1]).toBeCloseTo(-1, 6);
    expect(down[3][1]).toBeCloseTo(1, 6);
  });
  it('samples a quarter circle around the right centre', () => {
    const q = flattenArc(1, 0, 1, 0, 1, 0, 1, 2);
    expect(q).toHaveLength(1);
    expect(q[0][0]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(q[0][1]).toBeCloseTo(Math.SQRT1_2, 6);
  });
  it('returns nothing for zero-length arcs', () => {
    expect(flattenArc(5, 5, 3, 0, 0, 5, 5, 8)).toEqual([]);
  });
});

describe('pathPolygons', () => {
  it('splits subpaths', () => {
    const p = pathPolygons(parsePath('M0,0L10,0L10,10ZM20,20L30,20'));
    expect(p).toEqual([[0, 0, 10, 0, 10, 10], [20, 20, 30, 20]]);
  });
});

describe('bounds and affine', () => {
  it('computes point bboxes', () => {
    expect(pointsBbox([0, 0, 10, 5, -2, 3])).toEqual({ x: -2, y: 0, w: 12, h: 5 });
    expect(pointsBbox([])).toBeNull();
  });
  it('inverts affines', () => {
    const m: Affine = [2, 0, 0, 2, 10, 20];
    const inv = invertAffine(m)!;
    const [x, y] = applyAffine(m, 3, 4);
    const [bx, by] = applyAffine(inv, x, y);
    expect(bx).toBeCloseTo(3);
    expect(by).toBeCloseTo(4);
    expect(invertAffine([0, 0, 0, 0, 0, 0])).toBeNull();
  });
  const stroke: Stroke = {
    kind: 'stroke', id: 's', tool: 'pen', color: { r: 0, g: 0, b: 0, a: 1 }, width: 4,
    points: [0, 0, 10, 0], brush: { kind: 'solid' },
  };
  it('uses the outline when present and unedited', () => {
    expect(strokeBounds({ ...stroke, sourceOutline: 'M-1,-3L11,-3L11,3L-1,3Z' })).toEqual({ x: -1, y: -3, w: 12, h: 6 });
    expect(strokeBounds({ ...stroke, sourceOutline: 'M-1,-3L11,-3Z', editedAt: 'x' })).toEqual({ x: -2, y: -2, w: 14, h: 4 });
  });
  it('transforms group bounds', () => {
    const g: Group = { kind: 'group', id: 'g', transform: [1, 0, 0, 1, 100, 50], children: [stroke] };
    expect(objectBounds(g)).toEqual({ x: 98, y: 48, w: 14, h: 4 });
    expect(boardBounds([])).toBeNull();
  });
});

// A straight pen stroke along y=0: points (0,0) (10,0) (20,0), half-width 2,
// with zero-length arcs carrying the radius (as Whiteboard emits at joins).
const PEN = 'M0,2L10,2A2,2 0 0 0 10,2L20,2A2,2 0 0 0 20,2L20,-2L10,-2L0,-2';
const PEN_POINTS = [0, 0, 10, 0, 20, 0];

describe('width recovery', () => {
  it('reads nominal pen width from the largest arc radius', () => {
    expect(maxArcRadius(parsePath(PEN))).toBe(2);
    expect(penWidth(parsePath(PEN), PEN_POINTS)).toBe(4);
  });
  it('recovers per-point widths and clamps the end caps', () => {
    expect(perPointWidths(PEN_POINTS, parsePath(PEN), 4)).toEqual([0.4, 4, 0.4]);
  });
  it('uses the long side of the highlighter tip rectangle', () => {
    const d = 'M-2,-4L2,-4L2,4L-2,4L-2,-4M0,-4L20,-4L20,4L0,4';
    expect(highlighterWidth(parsePath(d), [0, 0, 20, 0])).toBe(8);
  });
  it('falls back to outline distance when there is no separate tip', () => {
    const d = 'M0,-4L20,-4L20,4L0,4';
    expect(highlighterWidth(parsePath(d), [0, 0, 10, 0, 20, 0])).toBe(8);
  });
});
