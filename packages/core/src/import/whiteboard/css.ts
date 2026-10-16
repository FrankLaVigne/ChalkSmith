import type { Affine } from '../../model/types';

const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;

export function parseStyle(style: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!style) return out;
  for (const part of style.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

export function px(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.match(new RegExp(String.raw`^(${NUM})px$`));
  return m ? Number(m[1]) : null;
}

export function parseMatrix(t: string | undefined): Affine {
  const m = t?.match(new RegExp(String.raw`matrix\(\s*(${NUM})\s*,\s*(${NUM})\s*,\s*(${NUM})\s*,\s*(${NUM})\s*,\s*(${NUM})\s*,\s*(${NUM})\s*\)`));
  return m ? [1, 2, 3, 4, 5, 6].map((i) => Number(m[i])) as Affine : [1, 0, 0, 1, 0, 0];
}

export function parseTranslateScale(t: string | undefined): { tx: number; ty: number; scale: number } | null {
  const m = t?.match(new RegExp(String.raw`translate\(\s*(${NUM})px\s*,\s*(${NUM})px\s*\)\s*scale\(\s*(${NUM})\s*\)`));
  return m ? { tx: Number(m[1]), ty: Number(m[2]), scale: Number(m[3]) } : null;
}

export function parsePatternTransform(t: string | null): { tx: number; ty: number; scale: number } | null {
  const m = t?.match(new RegExp(String.raw`translate\(\s*(${NUM})[\s,]+(${NUM})\s*\)\s*scale\(\s*(${NUM})`));
  return m ? { tx: Number(m[1]), ty: Number(m[2]), scale: Number(m[3]) } : null;
}

export const isIdentityLinear = (m: Affine) => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1;
