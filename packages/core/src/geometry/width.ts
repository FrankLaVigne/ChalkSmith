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

/** Brute-force nearest-edge index for one point (squared distance), or -1 when there are no edges. */
function nearestEdgeBrute(px: number, py: number, edges: number[]): number {
  let best = Infinity, bi = -1;
  for (let i = 0; i < edges.length; i += 4) {
    const d = segDist2(px, py, edges[i], edges[i + 1], edges[i + 2], edges[i + 3]);
    if (d < best) { best = d; bi = i; }
  }
  return bi;
}

function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
  const ex = px - ax - t * dx, ey = py - ay - t * dy;
  return ex * ex + ey * ey;
}

const MAX_CELLS_PER_EDGE = 4;

/**
 * Distance from each point to the nearest outline edge (Infinity when there are none).
 * Edges are bucketed into a uniform grid and searched ring by ring outward from each
 * point's cell until the best distance found is no larger than the ring radius.
 */
function distancesToEdges(points: number[], edges: number[], cellHint: number): number[] {
  const ne = edges.length / 4;
  const out: number[] = [];
  const dist = (k: number, i: number) =>
    i < 0 ? Infinity : segDist(points[k], points[k + 1], edges[i], edges[i + 1], edges[i + 2], edges[i + 3]);
  if (ne < 16) {
    for (let k = 0; k + 1 < points.length; k += 2) out.push(dist(k, nearestEdgeBrute(points[k], points[k + 1], edges)));
    return out;
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0;
  for (let i = 0; i < edges.length; i += 4) {
    const ax = edges[i], ay = edges[i + 1], bx = edges[i + 2], by = edges[i + 3];
    x0 = Math.min(x0, ax, bx); x1 = Math.max(x1, ax, bx);
    y0 = Math.min(y0, ay, by); y1 = Math.max(y1, ay, by);
    len += Math.hypot(bx - ax, by - ay);
  }
  const W = x1 - x0, H = y1 - y0;
  let cell = Math.max(cellHint > 0 ? cellHint : 0, len / ne, (W + H) * 1e-6, 1e-9);
  // Keep the grid at most ~MAX_CELLS_PER_EDGE cells per edge.
  const maxCells = MAX_CELLS_PER_EDGE * ne + 64;
  if ((W / cell + 1) * (H / cell + 1) > maxCells) cell = Math.max(cell, Math.sqrt((W * H) / maxCells), (W + H) / maxCells);
  const cols = Math.floor(W / cell) + 1, rows = Math.floor(H / cell) + 1;
  const cx = (x: number) => Math.floor((x - x0) / cell);
  const cy = (y: number) => Math.floor((y - y0) / cell);
  // CSR buckets: count, prefix-sum, fill.
  const start = new Int32Array(cols * rows + 1);
  const span = (i: number) => {
    const ax = edges[i], ay = edges[i + 1], bx = edges[i + 2], by = edges[i + 3];
    return [cx(Math.min(ax, bx)), cy(Math.min(ay, by)), cx(Math.max(ax, bx)), cy(Math.max(ay, by))];
  };
  for (let i = 0; i < edges.length; i += 4) {
    const [c0, r0, c1, r1] = span(i);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) start[r * cols + c + 1]++;
  }
  for (let j = 0; j < cols * rows; j++) start[j + 1] += start[j];
  const fill = start.slice(0, cols * rows);
  const items = new Int32Array(start[cols * rows]);
  for (let i = 0; i < edges.length; i += 4) {
    const [c0, r0, c1, r1] = span(i);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) items[fill[r * cols + c]++] = i;
  }
  const seen = new Int32Array(ne).fill(-1);

  for (let k = 0; k + 1 < points.length; k += 2) {
    const px = points[k], py = points[k + 1];
    const pc = cx(px), pr = cy(py);
    // Beyond this ring every grid cell has been visited.
    const maxRing = Math.max(Math.abs(pc), Math.abs(pc - (cols - 1)), Math.abs(pr), Math.abs(pr - (rows - 1)));
    let best = Infinity, bi = -1;
    const visit = (c: number, r: number) => {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      const j = r * cols + c;
      for (let q = start[j]; q < start[j + 1]; q++) {
        const i = items[q];
        if (seen[i >> 2] === k) continue;
        seen[i >> 2] = k;
        const d = segDist2(px, py, edges[i], edges[i + 1], edges[i + 2], edges[i + 3]);
        if (d < best || (d === best && i < bi)) { best = d; bi = i; }
      }
    };
    // Rings closer than this contain no grid cells.
    const minRing = Math.max(0, -pc, pc - (cols - 1), -pr, pr - (rows - 1));
    for (let ring = minRing; ring <= maxRing; ring++) {
      const cLo = Math.max(0, pc - ring), cHi = Math.min(cols - 1, pc + ring);
      const rLo = Math.max(0, pr - ring + 1), rHi = Math.min(rows - 1, pr + ring - 1);
      for (let c = cLo; c <= cHi; c++) { visit(c, pr - ring); if (ring > 0) visit(c, pr + ring); }
      for (let r = rLo; r <= rHi; r++) { visit(pc - ring, r); visit(pc + ring, r); }
      // Unvisited edges lie in rings > ring: at least ring × cell away from the point.
      const reach = ring * cell;
      if (bi >= 0 && best <= reach * reach) break;
    }
    out.push(dist(k, bi));
  }
  return out;
}

export function maxArcRadius(segs: Seg[]): number {
  let r = 0;
  for (const s of segs) if (s.c === 'A') r = Math.max(r, (s.rx + s.ry) / 2);
  return r;
}

function maxCenterDistance(points: number[], segs: Seg[]): number {
  let best = 0;
  for (const d of distancesToEdges(points, polygonEdges(pathPolygons(segs)), 0)) {
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
  const ds = distancesToEdges(points, polygonEdges(pathPolygons(segs)), nominal);
  return ds.map((d) => round4(Math.min(nominal, Math.max(0.1 * nominal, Number.isFinite(d) ? 2 * d : nominal))));
}
