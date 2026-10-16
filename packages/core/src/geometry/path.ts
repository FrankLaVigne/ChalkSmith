import { round4 } from '../util/round';

export type Seg =
  | { c: 'M'; x: number; y: number }
  | { c: 'L'; x: number; y: number }
  | { c: 'A'; rx: number; ry: number; rot: number; large: 0 | 1; sweep: 0 | 1; x: number; y: number }
  | { c: 'Z' };

const TOKEN = /[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/** Parse absolute M/L/A/Z path data (the subset Whiteboard emits). */
export function parsePath(d: string): Seg[] {
  const tokens = d.match(TOKEN) ?? [];
  const segs: Seg[] = [];
  let i = 0;
  let cmd: string | null = null;
  const num = (): number => {
    const t = tokens[i++];
    const v = Number(t);
    if (t === undefined || /^[A-Za-z]$/.test(t) || Number.isNaN(v)) throw new Error(`bad number in path near token ${i}`);
    return v;
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) {
      i++;
      if (t === 'Z' || t === 'z') { segs.push({ c: 'Z' }); cmd = null; continue; }
      if (t !== 'M' && t !== 'L' && t !== 'A') throw new Error(`unsupported path command "${t}"`);
      cmd = t;
      continue;
    }
    if (cmd === 'M') { segs.push({ c: 'M', x: num(), y: num() }); cmd = 'L'; }
    else if (cmd === 'L') segs.push({ c: 'L', x: num(), y: num() });
    else if (cmd === 'A') {
      const rx = num(), ry = num(), rot = num();
      const large = num() ? 1 : 0, sweep = num() ? 1 : 0;
      segs.push({ c: 'A', rx, ry, rot, large, sweep, x: num(), y: num() });
    } else throw new Error('path data must start with a command');
  }
  return segs;
}

const f = (n: number) => String(round4(n));

export function formatPath(segs: Seg[]): string {
  return segs
    .map((s) => {
      if (s.c === 'Z') return 'Z';
      if (s.c === 'A') return `A${f(s.rx)},${f(s.ry)} ${f(s.rot)} ${s.large} ${s.sweep} ${f(s.x)},${f(s.y)}`;
      return `${s.c}${f(s.x)},${f(s.y)}`;
    })
    .join('');
}

/** Scale every coordinate and radius by k, then translate by (dx, dy). */
export function mapPath(segs: Seg[], k: number, dx: number, dy: number): Seg[] {
  return segs.map((s): Seg => {
    if (s.c === 'Z') return s;
    if (s.c === 'A') return { ...s, rx: s.rx * k, ry: s.ry * k, x: s.x * k + dx, y: s.y * k + dy };
    return { ...s, x: s.x * k + dx, y: s.y * k + dy };
  });
}

/** Interior sample points of a circular SVG arc (endpoints excluded). */
export function flattenArc(
  x1: number, y1: number, r: number, large: 0 | 1, sweep: 0 | 1, x2: number, y2: number, steps: number,
): [number, number][] {
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const d2 = dx * dx + dy * dy;
  if (d2 === 0 || r <= 0) return [];
  const rr = Math.max(r * r, d2);
  const sign = large !== sweep ? 1 : -1;
  const coef = sign * Math.sqrt(Math.max(0, (rr - d2) / d2));
  const cx = coef * dy + (x1 + x2) / 2;
  const cy = -coef * dx + (y1 + y2) / 2;
  const R = Math.sqrt(rr);
  const t1 = Math.atan2(y1 - cy, x1 - cx);
  let dt = Math.atan2(y2 - cy, x2 - cx) - t1;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  const out: [number, number][] = [];
  for (let i = 1; i < steps; i++) {
    const t = t1 + (dt * i) / steps;
    out.push([cx + R * Math.cos(t), cy + R * Math.sin(t)]);
  }
  return out;
}

/** Flatten a path to one flat vertex list per subpath (arcs sampled). */
export function pathPolygons(segs: Seg[], arcSteps = 8): number[][] {
  const polys: number[][] = [];
  let cur: number[] | null = null;
  let sx = 0, sy = 0, px = 0, py = 0;
  for (const s of segs) {
    if (s.c === 'M') {
      cur = [s.x, s.y];
      polys.push(cur);
      sx = px = s.x;
      sy = py = s.y;
    } else if (s.c === 'Z') {
      px = sx;
      py = sy;
      cur = null;
    } else {
      if (!cur) { cur = [px, py]; polys.push(cur); }
      if (s.c === 'A') {
        for (const [x, y] of flattenArc(px, py, (s.rx + s.ry) / 2, s.large, s.sweep, s.x, s.y, arcSteps)) cur.push(x, y);
      }
      cur.push(s.x, s.y);
      px = s.x;
      py = s.y;
    }
  }
  return polys;
}
