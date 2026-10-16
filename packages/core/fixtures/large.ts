import { buildExportHtml, buildExportZip, penOutline, type FxInk, type Pt } from './build';

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A wiggly random-walk centerline in 1/128 units, with smoothly varying half-widths. */
export function randomWalk(n: number, rand: () => number, step = 256): { points: Pt[]; half: number[] } {
  const points: Pt[] = [];
  const half: number[] = [];
  let x = 0, y = 0, dir = rand() * 2 * Math.PI;
  for (let i = 0; i < n; i++) {
    points.push([Math.round(x), Math.round(y)]);
    half.push(Math.round(160 + 120 * Math.sin(i / 25) + 40 * rand()));
    dir += (rand() - 0.5) * 0.6;
    x += Math.cos(dir) * step;
    y += Math.sin(dir) * step;
  }
  return { points, half };
}

/** A synthetic Whiteboard export of `groups × strokesPerGroup` pen strokes of `points` points each. */
export function largeBoardZip(groups = 13, strokesPerGroup = 2, points = 1000, seed = 1): Uint8Array {
  const rand = rng(seed);
  const objects: FxInk[] = [];
  for (let g = 0; g < groups; g++) {
    const strokes = Array.from({ length: strokesPerGroup }, () => {
      const w = randomWalk(points, rand);
      return { fill: 'rgba(31,31,31,1)', points: w.points, outline: penOutline(w.points, w.half) };
    });
    objects.push({
      kind: 'ink', id: `g${g}`, left: (g % 5) * 1200, top: Math.floor(g / 5) * 1200,
      viewBox: [0, 0, 100, 100], e: 0, f: 0, tool: 'PenStroke', strokes,
    });
  }
  return buildExportZip(buildExportHtml({ objects }));
}
