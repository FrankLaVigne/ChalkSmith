import { describe, expect, it } from 'vitest';
import {
  highlighterWidth, mapPath, parsePath, pathPolygons, penWidth, perPointWidths, rescueWhiteboardZip, round4,
  type BoardObject, type Seg, type Stroke,
} from '../src/index';
import { penOutline } from '../fixtures/build';
import { FIXTURES } from '../fixtures/catalog';
import { randomWalk, rng } from '../fixtures/large';

// Straightforward O(points × edges) reference: the original implementation.
function refDistances(points: number[], segs: Seg[]): number[] {
  const edges: number[] = [];
  for (const p of pathPolygons(segs)) {
    const n = p.length / 2;
    if (n < 2) continue;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      edges.push(p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1]);
    }
  }
  const out: number[] = [];
  for (let k = 0; k + 1 < points.length; k += 2) {
    const px = points[k], py = points[k + 1];
    let best = Infinity;
    for (let i = 0; i < edges.length; i += 4) {
      const ax = edges[i], ay = edges[i + 1], dx = edges[i + 2] - ax, dy = edges[i + 3] - ay;
      const L = dx * dx + dy * dy;
      const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
      best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    }
    out.push(best);
  }
  return out;
}

const refPerPoint = (points: number[], segs: Seg[], nominal: number) =>
  refDistances(points, segs).map((d) => round4(Math.min(nominal, Math.max(0.1 * nominal, Number.isFinite(d) ? 2 * d : nominal))));

const refMaxCenter = (points: number[], segs: Seg[]) =>
  refDistances(points, segs).reduce((m, d) => (Number.isFinite(d) && d > m ? d : m), 0);

function expectClose(a: number[], b: number[]): void {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i]), `index ${i}`).toBeLessThanOrEqual(1e-4 + 1e-9);
}

function strokesOf(objects: BoardObject[]): Stroke[] {
  return objects.flatMap((o) => (o.kind === 'group' ? o.children : o.kind === 'stroke' ? [o] : []));
}

describe('grid-accelerated outline distances match the brute-force reference', () => {
  it('on every catalog fixture', () => {
    let checked = 0;
    for (const [name, make] of Object.entries(FIXTURES)) {
      let strokes: Stroke[];
      try { strokes = strokesOf(rescueWhiteboardZip(make()).board.objects); } catch { continue; }
      for (const s of strokes) {
        const segs = parsePath(s.sourceOutline!);
        expectClose(perPointWidths(s.points, segs, s.width), refPerPoint(s.points, segs, s.width));
        // Pen outlines have no tip rectangle, so highlighterWidth takes the outline-distance fallback.
        if (s.tool === 'pen') expect(Math.abs(highlighterWidth(segs, s.points) - 2 * refMaxCenter(s.points, segs)), name).toBeLessThanOrEqual(1e-9);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('on random-walk synthetic strokes', () => {
    const rand = rng(42);
    for (let k = 0; k < 4; k++) {
      const w = randomWalk(400 + 150 * k, rand, 100 + 120 * k);
      const segs = mapPath(parsePath(penOutline(w.points, w.half)), 1 / 128, 0, 0);
      const points = w.points.flatMap(([x, y]) => [round4(x / 128), round4(y / 128)]);
      const nominal = penWidth(segs, points);
      expectClose(perPointWidths(points, segs, nominal), refPerPoint(points, segs, nominal));
      // Pen outlines have no tip rectangle, so this exercises the outline-distance fallback.
      expect(Math.abs(highlighterWidth(segs, points) - 2 * refMaxCenter(points, segs))).toBeLessThanOrEqual(1e-9);
      // Points far outside the outline and an empty outline.
      const far = [1e4, -1e4, ...points.slice(0, 6), -5e3, 7e3];
      expectClose(perPointWidths(far, segs, nominal), refPerPoint(far, segs, nominal));
      expect(perPointWidths(points.slice(0, 4), [], 3)).toEqual([3, 3]);
    }
  });
});
