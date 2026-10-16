import { getStroke } from 'perfect-freehand';
import type { Stroke } from '../model/types';
import { round4 } from '../util/round';

/** Outline used for rendering: the imported source outline while unedited, else generated. */
export function strokeOutline(s: Stroke): string {
  if (s.sourceOutline && !s.editedAt) return s.sourceOutline;
  return generateOutline(s);
}

/**
 * Variable-width outline from centerline points.
 * With thinning 1, perfect-freehand's radius is size·pressure, so size = width/2 and
 * pressure = widths[i]/width gives a local diameter of widths[i]. Without widths,
 * thinning 0 gives a constant diameter equal to size = width.
 */
export function generateOutline(s: Stroke): string {
  const n = Math.floor(s.points.length / 2);
  if (n === 0) return '';
  const variable = s.tool === 'pen' && !!s.widths && s.widths.length === n && s.width > 0;
  const input: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p = variable ? Math.min(1, Math.max(0.05, s.widths![i] / s.width)) : 1;
    input.push([s.points[2 * i], s.points[2 * i + 1], p]);
  }
  const poly = getStroke(input, {
    size: variable ? s.width / 2 : s.width,
    thinning: variable ? 1 : 0,
    smoothing: 0.5,
    streamline: 0.2,
    simulatePressure: false,
    last: true,
  });
  const pts = poly.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pts.length === 0) {
    // Fallback dot for degenerate input: a circle of the nominal width at the first point.
    const r = round4(Math.max(s.width, 0.1) / 2);
    const x = round4(s.points[0]), y = round4(s.points[1]);
    return `M${round4(x - r)},${y}A${r},${r} 0 1 0 ${round4(x + r)},${y}A${r},${r} 0 1 0 ${round4(x - r)},${y}Z`;
  }
  return 'M' + pts.map(([x, y]) => `${round4(x)},${round4(y)}`).join('L') + 'Z';
}
