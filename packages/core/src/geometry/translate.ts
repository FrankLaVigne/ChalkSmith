import type { BoardObject, Stroke } from '../model/types';
import { round4 } from '../util/round';
import { formatPath, mapPath, parsePath } from './path';

export function translateStroke(s: Stroke, dx: number, dy: number): Stroke {
  const out: Stroke = {
    ...s,
    points: s.points.map((v, i) => round4(v + (i % 2 === 0 ? dx : dy))),
  };
  if (s.sourceOutline) out.sourceOutline = formatPath(mapPath(parsePath(s.sourceOutline), 1, dx, dy));
  if (s.brush.kind === 'texture') {
    out.brush = { ...s.brush, origin: [round4(s.brush.origin[0] + dx), round4(s.brush.origin[1] + dy)] };
  }
  return out;
}

export function translateObject(o: BoardObject, dx: number, dy: number): BoardObject {
  switch (o.kind) {
    case 'stroke':
      return translateStroke(o, dx, dy);
    case 'group': {
      const [a, b, c, d, e, f] = o.transform;
      return { ...o, transform: [a, b, c, d, round4(e + dx), round4(f + dy)] };
    }
    case 'image':
      return { ...o, x: round4(o.x + dx), y: round4(o.y + dy) };
    case 'unsupported':
      return o.bbox ? { ...o, bbox: { ...o.bbox, x: round4(o.bbox.x + dx), y: round4(o.bbox.y + dy) } } : o;
  }
}
