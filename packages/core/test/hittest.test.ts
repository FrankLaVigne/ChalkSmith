import { describe, expect, it } from 'vitest';
import { distToPolyline, GridIndex, hitTest, strokesUnderPath, type Stroke, type Group, type ImageObj } from '../src/index';

const stroke = (id: string, points: number[], width = 4): Stroke => ({
  kind: 'stroke', id, tool: 'pen', color: { r: 0, g: 0, b: 0, a: 1 }, width, points, brush: { kind: 'solid' },
});

describe('distToPolyline', () => {
  it('measures segments and single points', () => {
    expect(distToPolyline(5, 3, [0, 0, 10, 0])).toBe(3);
    expect(distToPolyline(3, 4, [0, 0])).toBe(5);
    expect(distToPolyline(0, 0, [])).toBe(Infinity);
  });
});

describe('GridIndex', () => {
  it('finds, removes and handles huge boxes', () => {
    const g = new GridIndex(256);
    g.insert('a', { x: 0, y: 0, w: 10, h: 10 });
    g.insert('b', { x: 1000, y: 1000, w: 10, h: 10 });
    g.insert('huge', { x: -1e6, y: -1e6, w: 2e6, h: 2e6 });
    expect([...g.query({ x: 5, y: 5, w: 1, h: 1 })].sort()).toEqual(['a', 'huge']);
    g.remove('a');
    expect([...g.query({ x: 5, y: 5, w: 1, h: 1 })]).toEqual(['huge']);
    g.clear();
    expect(g.query({ x: 0, y: 0, w: 1e6, h: 1e6 }).size).toBe(0);
  });
});

describe('hitTest', () => {
  const a = stroke('a', [0, 0, 100, 0]);
  const b = stroke('b', [0, 0, 0, 100]);
  const img: ImageObj = { kind: 'image', id: 'img', asset: 'assets/x.png', x: 200, y: 200, w: 50, h: 50, intrinsic: { w: 50, h: 50 } };
  const g: Group = { kind: 'group', id: 'g', transform: [1, 0, 0, 1, 500, 500], children: [stroke('c', [0, 0, 10, 0])] };
  const objs = [a, b, img, g];
  it('returns the topmost object', () => {
    expect(hitTest(objs, 0, 0, 2)).toBe('b');
    expect(hitTest(objs, 50, 1, 2)).toBe('a');
    expect(hitTest(objs, 220, 220, 2)).toBe('img');
    expect(hitTest(objs, 505, 501, 2)).toBe('g');
    expect(hitTest(objs, 400, 400, 2)).toBeNull();
  });
  it('respects candidate sets', () => {
    expect(hitTest(objs, 0, 0, 2, new Set(['a']))).toBe('a');
  });
  it('finds strokes and group children under an eraser path', () => {
    const refs = strokesUnderPath(objs, [50, -10, 50, 10, 500, 500, 510, 500], 2);
    expect(refs).toEqual([{ groupId: null, id: 'a' }, { groupId: 'g', id: 'c' }]);
  });
});
