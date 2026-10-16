import { ChalkError, boardToSvg, readChalk, rescueWhiteboardZip, writeChalk, type RescueReport } from '@chalksmith/core';
import { EditorDoc, type DocSource } from '../engine/document';
import type { Editor } from '../engine/editor';
import type { Platform } from '../platform';

export const APP_VERSION = '0.1.0';

const stripExt = (p: string) => p.replace(/\.[^./\\]*$/, '');
export const defaultChalkPath = (p: string) => `${stripExt(p)}.chalk`;
export const defaultSvgPath = (p: string | null) => (p ? `${stripExt(p)}.svg` : 'board.svg');
const normPath = (p: string) =>
  p.replace(/\\/g, '/').toLowerCase().split('/').map((seg) => (seg === '.' || seg === '..' ? seg : seg.replace(/[. ]+$/, ''))).join('/');
export const samePath = (a: string, b: string) => normPath(a) === normPath(b);
export const displayName = (s: DocSource) => (s.kind === 'new' ? 'Untitled' : s.path.split(/[\\/]/).pop() ?? s.path);

export function errorText(e: unknown): string {
  if (e instanceof ChalkError || e instanceof Error) return e.message;
  return String(e);
}

export interface OpenResult { report?: RescueReport; warnings: string[] }

export async function confirmDiscard(ed: Editor, pf: Platform): Promise<boolean> {
  if (!ed.doc.dirty) return true;
  return pf.confirm('Unsaved changes', 'This board has unsaved changes. Discard them?');
}

export async function openBoard(ed: Editor, pf: Platform): Promise<OpenResult | null> {
  if (!(await confirmDiscard(ed, pf))) return null;
  const path = await pf.pickOpen();
  if (!path) return null;
  try {
    const bytes = await pf.readFile(path);
    if (path.toLowerCase().endsWith('.chalk')) {
      const f = readChalk(bytes);
      ed.load(new EditorDoc({ board: f.board, assets: f.assets, extensions: f.extensions, createdAt: f.createdAt, source: { kind: 'chalk', path } }));
      return { warnings: f.warnings };
    }
    const r = rescueWhiteboardZip(bytes);
    const doc = new EditorDoc({ board: r.board, assets: r.assets, extensions: r.extensions, source: { kind: 'whiteboard-zip', path } });
    doc.dirty = true;
    doc.rescuedFrom = path;
    ed.load(doc);
    return { report: r.report, warnings: [] };
  } catch (e) {
    await pf.error('Could not open file', errorText(e));
    return null;
  }
}

/** Refuses any path that is the original Whiteboard export. */
async function guardOriginal(ed: Editor, pf: Platform, path: string): Promise<boolean> {
  const s = ed.doc.source;
  const orig = [ed.doc.rescuedFrom, s.kind === 'whiteboard-zip' ? s.path : undefined];
  if (orig.some((o) => o && samePath(path, o))) {
    await pf.error('Choose another name', 'ChalkSmith never overwrites the original export. Please choose a different file name.');
    return false;
  }
  return true;
}

async function writeTo(ed: Editor, pf: Platform, path: string): Promise<boolean> {
  ed.captureView();
  const now = new Date();
  try {
    const bytes = writeChalk(
      { board: ed.doc.board, assets: ed.doc.assets, extensions: ed.doc.extensions, createdAt: ed.doc.createdAt },
      { appVersion: APP_VERSION, now },
    );
    await pf.writeFile(path, bytes);
    ed.doc.createdAt ??= now.toISOString();
    ed.markSaved({ kind: 'chalk', path });
    return true;
  } catch (e) {
    await pf.error('Could not save', errorText(e));
    return false;
  }
}

export async function saveBoard(ed: Editor, pf: Platform): Promise<boolean> {
  const s = ed.doc.source;
  return s.kind === 'chalk' ? writeTo(ed, pf, s.path) : saveBoardAs(ed, pf);
}

export async function saveBoardAs(ed: Editor, pf: Platform): Promise<boolean> {
  const s = ed.doc.source;
  let path = await pf.pickSave(s.kind === 'new' ? 'Untitled.chalk' : defaultChalkPath(s.path), 'chalk');
  if (!path) return false;
  if (!(await guardOriginal(ed, pf, path))) return false; // check the name the user picked, before adding .chalk
  if (!path.toLowerCase().endsWith('.chalk')) path += '.chalk';
  return writeTo(ed, pf, path);
}

export async function exportSvg(ed: Editor, pf: Platform): Promise<boolean> {
  const s = ed.doc.source;
  let path = await pf.pickSave(defaultSvgPath(s.kind === 'new' ? null : s.path), 'svg');
  if (!path || !(await guardOriginal(ed, pf, path))) return false;
  if (!path.toLowerCase().endsWith('.svg')) path += '.svg';
  try {
    await pf.writeFile(path, new TextEncoder().encode(boardToSvg(ed.doc.board, ed.doc.assets)));
    return true;
  } catch (e) {
    await pf.error('Could not export', errorText(e));
    return false;
  }
}
