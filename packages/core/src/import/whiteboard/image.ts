import type { ImageObj } from '../../model/types';
import { base64ToBytes } from '../../util/base64';
import { imageSize, sniffImage } from '../../util/image';
import { round4 } from '../../util/round';
import { sha256Hex } from '../../util/sha256';
import { skip, type ImportCtx } from './context';
import { isIdentityLinear, parseMatrix, parseStyle, px } from './css';
import { attr, findFirst, hasClass, tag, type Element } from './dom';

export function importImage(anchor: Element, ctx: ImportCtx, assets: Map<string, Uint8Array>): ImageObj | null {
  const sourceId = attr(anchor, 'data-apikey');
  const img = findFirst(anchor, tag('img'));
  if (!img) { skip(ctx, sourceId, 'image element is missing'); return null; }
  const m = (attr(img, 'src') ?? '').match(/^data:([^,]*?),(.*)$/s);
  if (!m) { skip(ctx, sourceId, 'image is not embedded in the export (external images are never downloaded)'); return null; }
  if (!/;base64$/i.test(m[1])) { skip(ctx, sourceId, 'embedded image is not base64-encoded'); return null; }
  let bytes: Uint8Array;
  try { bytes = base64ToBytes(m[2]); } catch { skip(ctx, sourceId, 'embedded image data is corrupt'); return null; }
  const kind = sniffImage(bytes);
  if (!kind) { skip(ctx, sourceId, 'embedded image format is not recognised'); return null; }
  const intrinsic = imageSize(bytes, kind);

  const box = findFirst(anchor, (e) => hasClass(e, 'imageComponent'));
  const bs = parseStyle(box ? attr(box, 'style') : null);
  const is = parseStyle(attr(img, 'style'));
  const w = px(bs.width) ?? px(is['max-width']) ?? intrinsic?.w ?? null;
  const h = px(bs.height) ?? px(is['max-height']) ?? intrinsic?.h ?? null;
  if (!w || !h) { skip(ctx, sourceId, 'image size is unknown'); return null; }

  const st = parseStyle(attr(anchor, 'style'));
  const L = px(st.left) ?? 0;
  const T = px(st.top) ?? 0;
  const mtx = parseMatrix(st.transform);
  if (!isIdentityLinear(mtx)) ctx.transformed++;
  const centered = hasClass(anchor, 'center');
  const asset = `assets/${sha256Hex(bytes)}.${kind.ext}`;
  assets.set(asset, bytes);
  if (!intrinsic) ctx.warnings.add('Some images have an unreadable size header; their display size was used.');
  return {
    kind: 'image',
    id: ctx.idGen(),
    ...(sourceId ? { source: { system: 'ms-whiteboard' as const, id: sourceId } } : {}),
    asset,
    x: round4(L + mtx[4] - (centered ? w / 2 : 0)),
    y: round4(T + mtx[5] - (centered ? h / 2 : 0)),
    w: round4(w),
    h: round4(h),
    intrinsic: intrinsic ?? { w: round4(w), h: round4(h) },
  };
}
