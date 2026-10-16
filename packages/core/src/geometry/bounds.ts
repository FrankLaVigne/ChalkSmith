import type { Affine, Bbox, BoardObject, Stroke } from '../model/types';
import { parsePath, pathPolygons } from './path';

export function pointsBbox(points: number[]): Bbox | null {
  if (points.length < 2) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i], y = points[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function polysBbox(polys: number[][]): Bbox | null {
  return pointsBbox(polys.flat());
}

export function unionBbox(a: Bbox | null, b: Bbox | null): Bbox | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function inflate(b: Bbox, d: number): Bbox {
  return { x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d };
}

export function intersects(a: Bbox, b: Bbox): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export function applyAffine(m: Affine, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function invertAffine(m: Affine): Affine | null {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (det === 0 || !Number.isFinite(det)) return null;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

function transformBbox(m: Affine, b: Bbox): Bbox {
  const pts = [
    ...applyAffine(m, b.x, b.y), ...applyAffine(m, b.x + b.w, b.y),
    ...applyAffine(m, b.x, b.y + b.h), ...applyAffine(m, b.x + b.w, b.y + b.h),
  ];
  return pointsBbox(pts)!;
}

/**
 * Bounds cache keyed by object identity. Board objects are treated as immutable: every edit
 * replaces the object (see translateObject and the editor's commands), so entries never go stale.
 * Cached boxes are frozen so a caller cannot corrupt them.
 */
const boundsCache = new WeakMap<object, Bbox | null>();

function cached(o: object, compute: () => Bbox | null): Bbox | null {
  const hit = boundsCache.get(o);
  if (hit !== undefined) return hit;
  const b = compute();
  if (b) Object.freeze(b);
  boundsCache.set(o, b);
  return b;
}

export function strokeBounds(s: Stroke): Bbox | null {
  return cached(s, () => computeStrokeBounds(s));
}

function computeStrokeBounds(s: Stroke): Bbox | null {
  if (s.sourceOutline && !s.editedAt) {
    try {
      const b = polysBbox(pathPolygons(parsePath(s.sourceOutline)));
      if (b) return b;
    } catch {
      // fall through to points
    }
  }
  const b = pointsBbox(s.points);
  return b ? inflate(b, s.width / 2) : null;
}

export function objectBounds(o: BoardObject): Bbox | null {
  switch (o.kind) {
    case 'stroke':
      return strokeBounds(o);
    case 'group':
      return cached(o, () => {
        let b: Bbox | null = null;
        for (const c of o.children) b = unionBbox(b, strokeBounds(c));
        return b ? transformBbox(o.transform, b) : null;
      });
    case 'image':
      return { x: o.x, y: o.y, w: o.w, h: o.h };
    case 'unsupported':
      return o.bbox;
  }
}

export function boardBounds(objects: BoardObject[]): Bbox | null {
  let b: Bbox | null = null;
  for (const o of objects) b = unionBbox(b, objectBounds(o));
  return b;
}
