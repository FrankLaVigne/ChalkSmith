import { boardBounds } from '../geometry/bounds';
import { strokeOutline } from '../geometry/outline';
import { rgbaToCss } from '../model/color';
import type { Bbox, Board, BoardObject, Stroke, TextureName } from '../model/types';
import { GALAXY_BASE, RAINBOW_STOPS, TEXTURE_TILE, galaxyStars } from '../textures';
import { bytesToBase64 } from '../util/base64';
import { mimeForAsset } from '../util/image';
import { round4 } from '../util/round';

const n = (v: number) => String(round4(v));
const stripInvalidXml = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1');
const esc = (s: string) =>
  stripInvalidXml(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function textureDef(name: TextureName): string {
  const T = TEXTURE_TILE;
  if (name === 'galaxy') {
    const stars = galaxyStars().map((s) => `<circle cx="${n(s.x)}" cy="${n(s.y)}" r="${n(s.r)}" fill="#ffffff" fill-opacity="${n(s.alpha)}"/>`).join('');
    return `<pattern id="chalksmith-galaxy" patternUnits="userSpaceOnUse" width="${T}" height="${T}"><rect width="${T}" height="${T}" fill="${GALAXY_BASE}"/>${stars}</pattern>`;
  }
  const stops = RAINBOW_STOPS.map((c, i) => `<stop offset="${n(i / (RAINBOW_STOPS.length - 1))}" stop-color="${c}"/>`).join('');
  return `<linearGradient id="chalksmith-rainbow" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${T}" y2="0" spreadMethod="repeat">${stops}</linearGradient>`;
}

function placeholder(b: Bbox | null, label: string): string {
  const x = b?.x ?? 0, y = b?.y ?? 0, w = Math.max(b?.w ?? 0, 24), h = Math.max(b?.h ?? 0, 24);
  return `<g><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="none" stroke="#888888" stroke-dasharray="4 3"/><text x="${n(x + 4)}" y="${n(y + 14)}" font-family="sans-serif" font-size="10" fill="#666666">${esc(label)}</text></g>`;
}

function strokeSvg(s: Stroke, defs: Set<TextureName>): string {
  const d = strokeOutline(s);
  if (!d) return '';
  let fill = rgbaToCss(s.color);
  if (s.brush.kind === 'texture') {
    defs.add(s.brush.name);
    fill = `url(#chalksmith-${s.brush.name})`;
  }
  return `<path d="${esc(d)}" fill="${fill}"/>`;
}

function objectSvg(o: BoardObject, assets: Map<string, Uint8Array>, defs: Set<TextureName>): string {
  switch (o.kind) {
    case 'stroke':
      return strokeSvg(o, defs);
    case 'group':
      return `<g transform="matrix(${o.transform.map(n).join(' ')})">${o.children.map((c) => strokeSvg(c, defs)).join('')}</g>`;
    case 'image': {
      const bytes = assets.get(o.asset);
      if (!bytes) return placeholder({ x: o.x, y: o.y, w: o.w, h: o.h }, 'missing image');
      return `<image href="data:${mimeForAsset(o.asset)};base64,${bytesToBase64(bytes)}" x="${n(o.x)}" y="${n(o.y)}" width="${n(o.w)}" height="${n(o.h)}" preserveAspectRatio="none"/>`;
    }
    case 'unsupported':
      return placeholder(o.bbox, o.sourceType);
  }
}

export function boardToSvg(board: Board, assets: Map<string, Uint8Array>): string {
  const b = boardBounds(board.objects);
  const m = 16;
  const vb = b ? { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m } : { x: 0, y: 0, w: 100, h: 100 };
  const defs = new Set<TextureName>();
  const body = board.objects.map((o) => objectSvg(o, assets, defs)).filter(Boolean).join('\n');
  const defsXml = defs.size ? `<defs>${[...defs].map(textureDef).join('')}</defs>\n` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(vb.x)} ${n(vb.y)} ${n(vb.w)} ${n(vb.h)}" width="${n(vb.w)}" height="${n(vb.h)}">
${defsXml}<rect x="${n(vb.x)}" y="${n(vb.y)}" width="${n(vb.w)}" height="${n(vb.h)}" fill="${rgbaToCss(board.background.color)}"/>
${body}
</svg>
`;
}
