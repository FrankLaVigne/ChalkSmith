import { round4 } from '../util/round';
import { pathPolygons, type Seg } from './path';

/** Flat list of edges [ax, ay, bx, by, …]; each subpath is treated as closed. */
function polygonEdges(polys: number[][]): number[] {
  const edges: number[] = [];
  for (const p of polys) {
    const n = p.length / 2;
    if (n < 2) continue;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      edges.push(p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1]);
    }
  }
  return edges;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function distToEdges(px: number, py: number, edges: number[]): number {
  let best = Infinity;
  for (let i = 0; i < edges.length; i += 4) {
    const d = segDist(px, py, edges[i], edges[i + 1], edges[i + 2], edges[i + 3]);
    if (d < best) best = d;
  }
  return best;
}

export function maxArcRadius(segs: Seg[]): number {
  let r = 0;
  for (const s of segs) if (s.c === 'A') r = Math.max(r, (s.rx + s.ry) / 2);
  return r;
}

function maxCenterDistance(points: number[], segs: Seg[]): number {
  const edges = polygonEdges(pathPolygons(segs));
  let best = 0;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const d = distToEdges(points[i], points[i + 1], edges);
    if (Number.isFinite(d) && d > best) best = d;
  }
  return best;
}

/** Nominal pen width: 2 × the largest arc radius; falls back to outline distance. */
export function penWidth(segs: Seg[], points: number[]): number {
  const r = maxArcRadius(segs);
  return r > 0 ? 2 * r : 2 * maxCenterDistance(points, segs);
}

function firstSubpathRect(segs: Seg[]): { w: number; h: number } | null {
  const polys = pathPolygons(segs);
  if (polys.length < 2) return null;
  const p = polys[0];
  const v: [number, number][] = [];
  for (let i = 0; i + 1 < p.length; i += 2) {
    const q: [number, number] = [p[i], p[i + 1]];
    const last = v[v.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) v.push(q);
  }
  if (v.length === 5 && v[0][0] === v[4][0] && v[0][1] === v[4][1]) v.pop();
  if (v.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const a = v[i], b = v[(i + 1) % 4];
    if (a[0] !== b[0] && a[1] !== b[1]) return null;
  }
  const xs = v.map((q) => q[0]), ys = v.map((q) => q[1]);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Highlighter width: the long side of the chisel-tip rectangle, else outline distance. */
export function highlighterWidth(segs: Seg[], points: number[]): number {
  const rect = firstSubpathRect(segs);
  if (rect) return Math.max(rect.w, rect.h);
  return 2 * maxCenterDistance(points, segs);
}

/** Per-point width = 2 × distance from each centerline point to the outline, clamped to [0.1·n, n]. */
export function perPointWidths(points: number[], segs: Seg[], nominal: number): number[] {
  const edges = polygonEdges(pathPolygons(segs));
  const out: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const d = distToEdges(points[i], points[i + 1], edges);
    const w = Number.isFinite(d) ? 2 * d : nominal;
    out.push(round4(Math.min(nominal, Math.max(0.1 * nominal, w))));
  }
  return out;
}
