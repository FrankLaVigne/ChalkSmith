import type { Bbox, BoardObject, Stroke } from '../model/types';
import { applyAffine, inflate, intersects, invertAffine, objectBounds, strokeBounds } from './bounds';

export function distToPolyline(px: number, py: number, points: number[]): number {
  const n = Math.floor(points.length / 2);
  if (n === 0) return Infinity;
  if (n === 1) return Math.hypot(px - points[0], py - points[1]);
  let best = Infinity;
  for (let i = 0; i < n - 1; i++) {
    const ax = points[2 * i], ay = points[2 * i + 1], bx = points[2 * i + 2], by = points[2 * i + 3];
    const dx = bx - ax, dy = by - ay;
    const L = dx * dx + dy * dy;
    const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
    const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
    if (d < best) best = d;
  }
  return best;
}

const MAX_CELLS = 4096;

export class GridIndex {
  private readonly cells = new Map<string, Set<string>>();
  private readonly boxes = new Map<string, Bbox>();
  private readonly big = new Set<string>();
  constructor(private readonly cell = 256) {}

  private range(b: Bbox): [number, number, number, number] {
    return [
      Math.floor(b.x / this.cell), Math.floor(b.y / this.cell),
      Math.floor((b.x + b.w) / this.cell), Math.floor((b.y + b.h) / this.cell),
    ];
  }

  insert(id: string, b: Bbox): void {
    this.remove(id);
    this.boxes.set(id, b);
    const [x0, y0, x1, y1] = this.range(b);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELLS) { this.big.add(id); return; }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = `${x},${y}`;
      let s = this.cells.get(k);
      if (!s) { s = new Set(); this.cells.set(k, s); }
      s.add(id);
    }
  }

  remove(id: string): void {
    const b = this.boxes.get(id);
    if (!b) return;
    this.boxes.delete(id);
    if (this.big.delete(id)) return;
    const [x0, y0, x1, y1] = this.range(b);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) this.cells.get(`${x},${y}`)?.delete(id);
  }

  query(b: Bbox): Set<string> {
    const out = new Set<string>();
    for (const id of this.big) if (intersects(this.boxes.get(id)!, b)) out.add(id);
    const [x0, y0, x1, y1] = this.range(b);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELLS) {
      for (const [id, box] of this.boxes) if (intersects(box, b)) out.add(id);
      return out;
    }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      for (const id of this.cells.get(`${x},${y}`) ?? []) if (intersects(this.boxes.get(id)!, b)) out.add(id);
    }
    return out;
  }

  clear(): void {
    this.cells.clear();
    this.boxes.clear();
    this.big.clear();
  }
}

function strokeHit(s: Stroke, x: number, y: number, tol: number): boolean {
  const b = strokeBounds(s);
  if (!b || !intersects(inflate(b, tol), { x, y, w: 0, h: 0 })) return false;
  return distToPolyline(x, y, s.points) <= Math.max(s.width / 2, tol);
}

function inBox(b: Bbox | null, x: number, y: number, tol: number): boolean {
  return !!b && intersects(inflate(b, tol), { x, y, w: 0, h: 0 });
}

function hitObject(o: BoardObject, x: number, y: number, tol: number): boolean {
  switch (o.kind) {
    case 'stroke':
      return strokeHit(o, x, y, tol);
    case 'group': {
      const inv = invertAffine(o.transform);
      if (!inv) return false;
      const [lx, ly] = applyAffine(inv, x, y);
      const scale = Math.sqrt(Math.abs(o.transform[0] * o.transform[3] - o.transform[1] * o.transform[2])) || 1;
      return o.children.some((c) => strokeHit(c, lx, ly, tol / scale));
    }
    case 'image':
    case 'unsupported':
      return inBox(objectBounds(o), x, y, tol);
  }
}

/** Topmost top-level object under (x, y), or null. */
export function hitTest(objects: BoardObject[], x: number, y: number, tol: number, candidates?: Set<string>): string | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (candidates && !candidates.has(o.id)) continue;
    if (hitObject(o, x, y, tol)) return o.id;
  }
  return null;
}

export type ItemRef = { groupId: string | null; id: string };

function densify(path: number[], step: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < path.length; i += 2) {
    if (i >= 2) {
      const ax = path[i - 2], ay = path[i - 1], bx = path[i], by = path[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) / step);
      for (let k = 1; k < n; k++) out.push(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
    }
    out.push(path[i], path[i + 1]);
  }
  return out;
}

/** Strokes (top-level, or children of groups) touched by an eraser path. */
export function strokesUnderPath(objects: BoardObject[], path: number[], tol: number): ItemRef[] {
  const pts = densify(path, Math.max(tol, 0.5));
  const refs: ItemRef[] = [];
  const touches = (s: Stroke, xs: number[], t: number) => {
    for (let i = 0; i + 1 < xs.length; i += 2) if (strokeHit(s, xs[i], xs[i + 1], t)) return true;
    return false;
  };
  for (const o of objects) {
    if (o.kind === 'stroke' && touches(o, pts, tol)) refs.push({ groupId: null, id: o.id });
    if (o.kind === 'group') {
      const inv = invertAffine(o.transform);
      if (!inv) continue;
      const local: number[] = [];
      for (let i = 0; i + 1 < pts.length; i += 2) local.push(...applyAffine(inv, pts[i], pts[i + 1]));
      const scale = Math.sqrt(Math.abs(o.transform[0] * o.transform[3] - o.transform[1] * o.transform[2])) || 1;
      for (const c of o.children) if (touches(c, local, tol / scale)) refs.push({ groupId: o.id, id: c.id });
    }
  }
  return refs;
}
