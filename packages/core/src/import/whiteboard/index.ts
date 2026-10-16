import { strFromU8 } from 'fflate';
import { ChalkError } from '../../errors';
import { WHITE, parseCssColor } from '../../model/color';
import { randomId, type Board, type BoardObject, type IdGen } from '../../model/types';
import { round4 } from '../../util/round';
import { objectProblem } from './check';
import { buildReport, newCtx, skip, type RescueReport } from './context';
import { parseStyle, parseTranslateScale } from './css';
import { attr, childElements, findFirst, hasClass, parseHtml, tag } from './dom';
import { importImage } from './image';
import { importInkGroup } from './ink';
import { importUnsupported } from './unsupported';
import { DEFAULT_LIMITS, readExportZip, type ExportLimits } from './unzip';

export type { RescueReport } from './context';
export { DEFAULT_LIMITS, type ExportLimits } from './unzip';

export interface RescueResult {
  board: Board;
  assets: Map<string, Uint8Array>;
  extensions: Map<string, Uint8Array>;
  report: RescueReport;
}

export interface RescueOptions { idGen?: IdGen; limits?: ExportLimits }

export const COMMENTS_EXTENSION = 'extensions/ms-whiteboard/comments.json';

/** Convert a Whiteboard Full Export ZIP into a ChalkSmith board. Pure: no I/O, no network. */
export function rescueWhiteboardZip(bytes: Uint8Array, opts: RescueOptions = {}): RescueResult {
  const entries = readExportZip(bytes, opts.limits ?? DEFAULT_LIMITS);
  const doc = parseHtml(entries.html);
  const canvas = findFirst(doc, (e) => attr(e, 'id') === 'canvasContent');
  if (!canvas) throw new ChalkError('NoBoardHtml', 'The .html file in this ZIP is not a Whiteboard board (no canvas found).');

  const ctx = newCtx(opts.idGen ?? randomId);
  const boardId = ctx.idGen();
  const assets = new Map<string, Uint8Array>();
  const objects: BoardObject[] = [];

  for (const anchor of childElements(canvas)) {
    if (!hasClass(anchor, 'anchor')) continue;
    const type = attr(anchor, 'data-whiteboard-type') ?? 'unknown';
    const sourceId = attr(anchor, 'data-apikey');
    try {
      let o: BoardObject | null;
      if (type === 'InkGroup') o = importInkGroup(anchor, ctx);
      else if (type === 'AzureImage' || type === 'Image') o = importImage(anchor, ctx, assets);
      else o = importUnsupported(anchor, type, ctx);
      if (!o) continue;
      // Per-object validation: anything writeChalk would reject is skipped and reported here.
      const problem = objectProblem(o);
      if (problem) {
        if (o.kind === 'unsupported' && --ctx.unsupported[type] === 0) delete ctx.unsupported[type];
        skip(ctx, sourceId, `object has invalid data (${problem})`);
        continue;
      }
      objects.push(o);
    } catch (err) {
      skip(ctx, sourceId, `object could not be read: ${(err as Error).message}`);
    }
  }

  const bgRect = findFirst(doc, (e) => tag('rect')(e) && hasClass(e, 'canvasBackgroundColor'));
  const color = (bgRect && parseCssColor(attr(bgRect, 'fill') ?? '')) || { ...WHITE };
  const tc = findFirst(doc, (e) => hasClass(e, 'transformComponent'));
  const ts = tc ? parseTranslateScale(parseStyle(attr(tc, 'style')).transform) : null;
  let view = ts && ts.scale > 0 ? { x: round4(-ts.tx / ts.scale), y: round4(-ts.ty / ts.scale), zoom: round4(ts.scale) } : undefined;
  if (view && !(Number.isFinite(view.x) && Number.isFinite(view.y) && Number.isFinite(view.zoom) && view.zoom > 0)) {
    view = undefined;
    ctx.warnings.add('The saved view position is out of range and was reset.');
  }

  const extensions = new Map<string, Uint8Array>();
  if (entries.comments) {
    try {
      JSON.parse(strFromU8(entries.comments));
      extensions.set(COMMENTS_EXTENSION, entries.comments);
    } catch {
      ctx.warnings.add('The comments file is not valid JSON and was not kept.');
    }
  } else {
    ctx.warnings.add('The export has no comments file.');
  }

  // Keep only the bytes of images that made it onto the board.
  const used = new Set(objects.flatMap((o) => (o.kind === 'image' ? [o.asset] : [])));
  for (const k of [...assets.keys()]) if (!used.has(k)) assets.delete(k);

  const board: Board = { id: boardId, background: { color }, ...(view ? { view } : {}), objects };
  return { board, assets, extensions, report: buildReport(ctx, objects) };
}
