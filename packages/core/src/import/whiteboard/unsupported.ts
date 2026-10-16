import type { Bbox, Unsupported } from '../../model/types';
import { round4 } from '../../util/round';
import type { ImportCtx } from './context';
import { parseMatrix, parseStyle, px } from './css';
import { attr, findFirst, hasClass, type Element } from './dom';

/** A placeholder: type and bounding box only. Inner content (e.g. note text) is never copied. */
export function importUnsupported(anchor: Element, type: string, ctx: ImportCtx): Unsupported {
  const sourceId = attr(anchor, 'data-apikey');
  const st = parseStyle(attr(anchor, 'style'));
  const L = px(st.left);
  const T = px(st.top);
  const [, , , , e, f] = parseMatrix(st.transform);
  let bbox: Bbox | null = null;
  if (L !== null && T !== null) {
    const sized = findFirst(anchor, (el) => {
      const s = parseStyle(attr(el, 'style'));
      return px(s.width) !== null && px(s.height) !== null;
    });
    if (sized) {
      const s = parseStyle(attr(sized, 'style'));
      const w = px(s.width)!, h = px(s.height)!;
      const centered = hasClass(anchor, 'center');
      bbox = { x: round4(L + e - (centered ? w / 2 : 0)), y: round4(T + f - (centered ? h / 2 : 0)), w: round4(w), h: round4(h) };
    } else {
      bbox = { x: round4(L + e), y: round4(T + f), w: 0, h: 0 };
    }
  }
  ctx.unsupported[type] = (ctx.unsupported[type] ?? 0) + 1;
  return {
    kind: 'unsupported',
    id: ctx.idGen(),
    ...(sourceId ? { source: { system: 'ms-whiteboard' as const, id: sourceId } } : {}),
    sourceType: type,
    bbox,
  };
}
