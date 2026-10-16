import { strToU8, zipSync, zlibSync, type Zippable } from 'fflate';
import { bytesToBase64 } from '../src/index';

export type Pt = [number, number];

/** A stroke in 1/128-px units, group-local. */
export interface FxStroke {
  fill: string;
  points: Pt[];
  outline: string;
  texture?: 'galaxy' | 'rainbow';
  rawPoints?: string; // overrides `points` text verbatim (for malformed fixtures)
}
export interface FxInk {
  kind: 'ink';
  id: string;
  left: number;
  top: number;
  /** Anchor matrix translation; defaults to the viewBox origin, as real exports do. */
  e?: number;
  f?: number;
  matrix?: [number, number, number, number];
  viewBox: [number, number, number, number];
  tool: 'PenStroke' | 'Highlighter';
  strokes: FxStroke[];
}
export interface FxImage { kind: 'image'; id: string; left: number; top: number; w: number; h: number; src: string }
export interface FxRaw { kind: 'raw'; html: string }
export type FxObject = FxInk | FxImage | FxRaw;
export interface FxBoard {
  background?: string;
  view?: { tx: number; ty: number; scale: number };
  objects: FxObject[];
}

const HIT_WIDTH = '8140.929356707803'; // a hit-test width: must never be read as a pen width

function strokeHtml(s: FxStroke, id: string, i: number): string {
  const pts = s.rawPoints ?? s.points.map(([x, y]) => `${x},${y}`).join(' ');
  const [sx, sy] = s.points[0] ?? [0, 0];
  const tex = s.texture
    ? `<defs><pattern id="-${i}" width="540" height="540" x="0" y="0" patternUnits="userSpaceOnUse" patternTransform="translate(${sx} ${sy}) scale(0.5 0.5) matrix(128, 0, 0, 128, 0, 0)"><use href="#${s.texture}-pen"></use></pattern></defs>`
    : '';
  const fill = s.texture ? `url(#-${i})` : s.fill;
  return `<g class="inkStroke interactive" id="${id}" transform="matrix(0.0078125, 0, 0, 0.0078125, 0, 0)" data-apikey="__x_${id}"><path d="${s.outline}" fill="${fill}" opacity="${s.texture ? '1' : ''}"></path>${tex}<polyline class="inkHitTestOverlay" stroke-linecap="round" stroke-width="${HIT_WIDTH}" points="${pts} "></polyline></g>`;
}

function inkHtml(o: FxInk): string {
  const [a, b, c, d] = o.matrix ?? [1, 0, 0, 1];
  const [vx, vy, vw, vh] = o.viewBox;
  const strokes = o.strokes.map((s, i) => strokeHtml(s, `${o.id}s${i}`, i)).join('');
  return `<div class="anchor includedInExportedPdf align topLeft" data-prevent-drag="false" data-whiteboard-type="InkGroup" data-apikey="${o.id}" style="left: ${o.left}px; top: ${o.top}px; transform: matrix(${a}, ${b}, ${c}, ${d}, ${o.e ?? vx}, ${o.f ?? vy});"><div id="id${o.id}c" data-content-blueprint-type="BpInkGroup" data-blueprint-type="CanvasChild" data-identity-key="${o.id}" class="canvasChild canvasChildElement"><svg class="inkGroup ink ${o.tool}" viewBox="${vx} ${vy} ${vw} ${vh}" overflow="visible" width="${vw}" height="${vh}" tabindex="0">${strokes}</svg></div></div>`;
}

function imageHtml(o: FxImage): string {
  return `<div class="anchor includedInExportedPdf align center" data-prevent-drag="false" data-whiteboard-type="AzureImage" data-apikey="${o.id}" style="left: ${o.left}px; top: ${o.top}px; transform: matrix(1, 0, 0, 1, 0, 0);"><div id="id${o.id}c" data-content-blueprint-type="Image" data-blueprint-type="CanvasChild" class="canvasChild canvasChildElement"><div class="content imageComponent interactive" role="img" tabindex="0" style="height: ${o.h}px; width: ${o.w}px;"><div class="ms-Image"><img draggable="false" src="${o.src}" class="ms-Image-image" style="max-height: ${o.h}px; max-width: ${o.w}px;"></div></div></div></div>`;
}

export function dataUri(bytes: Uint8Array): string {
  return `data:image/*;base64,${bytesToBase64(bytes)}`;
}

export function buildExportHtml(b: FxBoard): string {
  const v = b.view ?? { tx: 0, ty: 0, scale: 1 };
  const objs = b.objects.map((o) => (o.kind === 'ink' ? inkHtml(o) : o.kind === 'image' ? imageHtml(o) : o.html)).join('');
  return `<html><head><meta charSet="utf-8" /><meta httpEquiv="Content-Type" content="text/html; charset=utf-8" /><style>.anchor { position: absolute; } .synthetic { color: red; }</style></head><body style="overflow: auto;"><div class="transformComponent" style="transform: translate(${v.tx}px, ${v.ty}px) scale(${v.scale});"><svg class="canvasBackground" version="1.1" xmlns="http://www.w3.org/2000/svg"><defs class="canvasBackgroundGrid"><pattern id="Neutral"></pattern></defs><rect class="canvasBackgroundColor" width="100%" height="100%" fill="${b.background ?? '#FFFFFF'}"></rect><rect width="100%" height="100%" fill="url(#Neutral)"></rect></svg><div id="canvasContent" class="contentOrigin" data-blueprint-type="Canvas" data-identity-key="c0">${objs}</div><svg id="effect-resources"><defs><image id="rainbow-pen" href="https://example.invalid/rainbow.jpg"></image><image id="galaxy-pen" href="https://example.invalid/galaxy.jpg"></image></defs></svg></div></body></html>`;
}

const EMPTY_COMMENTS = '{\n  "description": "The comment thread IDs in this file correspond to the IDs presented in the HTML file.",\n  "commentThreads": []\n}';

export function buildExportZip(
  html: string,
  opts: { name?: string; comments?: string | null; extra?: Record<string, Uint8Array> } = {},
): Uint8Array {
  const name = opts.name ?? 'Board';
  const files: Zippable = { [`${name}.html`]: [strToU8(html), { level: 0 }] };
  const comments = opts.comments === undefined ? EMPTY_COMMENTS : opts.comments;
  if (comments !== null) files[`${name}-comments.json`] = [strToU8(comments), { level: 0 }];
  for (const [k, v] of Object.entries(opts.extra ?? {})) files[k] = v;
  return zipSync(files);
}

/**
 * Round-capped pen outline in 1/128 units: a left offset edge with a zero-length arc at each
 * vertex (carrying that vertex's half-width, as Whiteboard emits at joins), then the right edge.
 */
export function penOutline(points: Pt[], half: number[]): string {
  const n = points.length;
  if (n === 1) {
    const [x, y] = points[0];
    const r = half[0];
    return `M${x - r},${y}A${r},${r} 0 0 0 ${x + r},${y}A${r},${r} 0 0 0 ${x - r},${y}`;
  }
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[Math.min(n - 1, i + 1)];
    let dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const nx = -dy, ny = dx;
    left.push([Math.round(points[i][0] + nx * half[i]), Math.round(points[i][1] + ny * half[i])]);
    right.push([Math.round(points[i][0] - nx * half[i]), Math.round(points[i][1] - ny * half[i])]);
  }
  let d = `M${left[0][0]},${left[0][1]}`;
  for (let i = 1; i < n; i++) d += `L${left[i][0]},${left[i][1]}A${half[i]},${half[i]} 0 0 0 ${left[i][0]},${left[i][1]}`;
  for (let i = n - 1; i >= 0; i--) d += `L${right[i][0]},${right[i][1]}`;
  return d;
}

/** Chisel highlighter in 1/128 units: tip rectangle subpath, then a swept body (horizontal strokes). */
export function highlighterOutline(points: Pt[], tipW: number, tipH: number): string {
  const [x0, y0] = points[0];
  const [xn, yn] = points[points.length - 1];
  const hw = tipW / 2, hh = tipH / 2;
  const tip = `M${x0 - hw},${y0 - hh}L${x0 + hw},${y0 - hh}L${x0 + hw},${y0 + hh}L${x0 - hw},${y0 + hh}L${x0 - hw},${y0 - hh}`;
  const body = `M${x0},${y0 - hh}L${xn},${yn - hh}L${xn},${yn + hh}L${x0},${y0 + hh}`;
  return tip + body;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A real, valid RGB PNG. */
export function makePng(w: number, h: number, color: (x: number, y: number) => [number, number, number] = () => [200, 40, 40]): Uint8Array {
  const row = w * 3 + 1;
  const raw = new Uint8Array(row * h);
  for (let y = 0; y < h; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < w; x++) raw.set(color(x, y), y * row + 1 + x * 3);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
