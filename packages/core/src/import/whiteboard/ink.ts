import { WHITE, parseCssColor } from '../../model/color';
import type { Affine, Brush, Group, RGBA, Stroke, TextureName } from '../../model/types';
import { formatPath, mapPath, parsePath } from '../../geometry/path';
import { highlighterWidth, penWidth, perPointWidths } from '../../geometry/width';
import { round4 } from '../../util/round';
import { isIdentityLinear, parseMatrix, parsePatternTransform, parseStyle, px } from './css';
import { attr, findAll, findFirst, hasClass, tag, type Element } from './dom';
import { objectProblem } from './check';
import { skip, type ImportCtx } from './context';

const TEXTURES: Record<string, TextureName> = { '#galaxy-pen': 'galaxy', '#rainbow-pen': 'rainbow' };
const source = (id: string | null) => (id ? { source: { system: 'ms-whiteboard' as const, id } } : {});

function readTexture(g: Element): Brush | null {
  const pattern = findFirst(g, tag('pattern'));
  const use = pattern && findFirst(pattern, tag('use'));
  const href = use && (attr(use, 'href') ?? attr(use, 'xlink:href'));
  const name = href ? TEXTURES[href] : undefined;
  if (!pattern || !name) return null;
  const pt = parsePatternTransform(attr(pattern, 'patternTransform'));
  return {
    kind: 'texture', name,
    origin: pt ? [round4(pt.tx / 128), round4(pt.ty / 128)] : [0, 0],
    scale: pt && pt.scale > 0 ? round4(pt.scale) : 1,
  };
}

export function importStroke(g: Element, tool: 'pen' | 'highlighter', ctx: ImportCtx): Stroke {
  const path = findFirst(g, tag('path'));
  const poly = findFirst(g, (e) => tag('polyline')(e) && hasClass(e, 'inkHitTestOverlay')) ?? findFirst(g, tag('polyline'));
  if (!path || !poly) throw new Error('missing outline path or centerline polyline');
  const segs = mapPath(parsePath(attr(path, 'd') ?? ''), 1 / 128, 0, 0);
  if (segs.length === 0) throw new Error('empty outline');
  const raw = (attr(poly, 'points') ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (raw.length < 2 || raw.length % 2 !== 0 || raw.some((n) => !Number.isFinite(n))) throw new Error('invalid centerline points');
  const points = raw.map((v) => round4(v / 128));

  const fill = (attr(path, 'fill') ?? '').trim();
  let color: RGBA;
  let brush: Brush;
  if (/^url\(/i.test(fill)) {
    const tex = readTexture(g);
    if (tex && tex.kind === 'texture') {
      brush = tex;
      color = { ...WHITE };
      ctx.substitutions.set(tex.name, (ctx.substitutions.get(tex.name) ?? 0) + 1);
    } else {
      brush = { kind: 'solid' };
      color = { r: 128, g: 128, b: 128, a: 1 };
      ctx.warnings.add('Some strokes use an unknown texture and were imported in grey.');
    }
  } else {
    const c = parseCssColor(fill);
    if (!c) throw new Error(`unrecognised colour "${fill}"`);
    color = c;
    brush = { kind: 'solid' };
  }

  const width = round4(tool === 'pen' ? penWidth(segs, points) : highlighterWidth(segs, points));
  if (!(width > 0)) throw new Error('could not determine stroke width');
  const s: Stroke = {
    kind: 'stroke', id: ctx.idGen(), ...source(attr(g, 'id')),
    tool, color, width, points, brush, sourceOutline: formatPath(segs),
  };
  if (tool === 'pen') s.widths = perPointWidths(points, segs, width);
  const problem = objectProblem(s);
  if (problem) throw new Error(`invalid data (${problem})`);
  return s;
}

export function importInkGroup(anchor: Element, ctx: ImportCtx): Group | null {
  const sourceId = attr(anchor, 'data-apikey');
  const svg = findFirst(anchor, (e) => tag('svg')(e) && hasClass(e, 'inkGroup'));
  if (!svg) { skip(ctx, sourceId, 'ink group has no drawing'); return null; }
  const vb = (attr(svg, 'viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) { skip(ctx, sourceId, 'ink group has an invalid viewBox'); return null; }
  const st = parseStyle(attr(anchor, 'style'));
  const L = px(st.left) ?? 0;
  const T = px(st.top) ?? 0;
  const m = parseMatrix(st.transform);
  const [a, b, c, d, e, f] = m;
  const [vx, vy] = vb;
  const transform = [a, b, c, d, L + e - (a * vx + c * vy), T + f - (b * vx + d * vy)].map(round4) as Affine;
  if (!isIdentityLinear(m)) ctx.transformed++;

  const tool = hasClass(svg, 'Highlighter') ? 'highlighter' : 'pen';
  const children: Stroke[] = [];
  for (const g of findAll(svg, (el) => tag('g')(el) && hasClass(el, 'inkStroke'))) {
    try {
      children.push(importStroke(g, tool, ctx));
    } catch (err) {
      skip(ctx, attr(g, 'id'), `stroke could not be read: ${(err as Error).message}`);
    }
  }
  if (children.length === 0) { skip(ctx, sourceId, 'ink group contains no readable strokes'); return null; }
  return { kind: 'group', id: ctx.idGen(), ...source(sourceId), transform, children };
}
