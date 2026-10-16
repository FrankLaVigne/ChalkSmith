import { round4 } from '../util/round';
import type { RGBA } from './types';

export const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };

const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)));

export function parseCssColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase();
  let m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) {
    const r = clamp255(Number(m[1]));
    const g = clamp255(Number(m[2]));
    const b = clamp255(Number(m[3]));
    const a = m[4] === undefined ? 1 : round4(Math.min(1, Math.max(0, Number(m[4]))));
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return { r, g, b, a };
  }
  m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  return null;
}

export function rgbaToCss(c: RGBA): string {
  return `rgba(${c.r},${c.g},${c.b},${c.a})`;
}
