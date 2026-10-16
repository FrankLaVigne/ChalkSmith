import { strFromU8 } from 'fflate';
import { ChalkError } from '../../errors';
import { WHITE, parseCssColor } from '../../model/color';
import { randomId, type Board, type BoardObject, type IdGen } from '../../model/types';
import { round4 } from '../../util/round';
import { buildReport, newCtx, skip, type RescueReport } from './context';
import { parseStyle, parseTranslateScale } from './css';
import { attr, childElements, findFirst, hasClass, parseHtml, tag } from './dom';
import { importInkGroup } from './ink';
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
      if (type === 'InkGroup') {
        const g = importInkGroup(anchor, ctx);
        if (g) objects.push(g);
      } else {
        skip(ctx, sourceId, `${type}: not imported yet`);
      }
    } catch (err) {
      skip(ctx, sourceId, `object could not be read: ${(err as Error).message}`);
    }
  }

  const bgRect = findFirst(doc, (e) => tag('rect')(e) && hasClass(e, 'canvasBackgroundColor'));
  const color = (bgRect && parseCssColor(attr(bgRect, 'fill') ?? '')) || { ...WHITE };
  const tc = findFirst(doc, (e) => hasClass(e, 'transformComponent'));
  const ts = tc ? parseTranslateScale(parseStyle(attr(tc, 'style')).transform) : null;
  const view = ts && ts.scale > 0 ? { x: round4(-ts.tx / ts.scale), y: round4(-ts.ty / ts.scale), zoom: round4(ts.scale) } : undefined;

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

  const board: Board = { id: boardId, background: { color }, ...(view ? { view } : {}), objects };
  return { board, assets, extensions, report: buildReport(ctx, objects) };
}
