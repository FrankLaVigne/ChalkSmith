import { describe, expect, it } from 'vitest';
import { readChalk } from '@chalksmith/core';
import { FIXTURES } from '../../../../packages/core/fixtures/catalog';
import { Editor } from '../engine/editor';
import type { Platform } from '../platform';
import { defaultChalkPath, exportSvg, openBoard, saveBoard, saveBoardAs } from './actions';

class FakePlatform implements Platform {
  files = new Map<string, Uint8Array>();
  writes: string[] = [];
  errors: string[] = [];
  openPath: string | null = null;
  savePaths: (string | null)[] = [];
  saveDefaults: string[] = [];
  confirmAnswer = true;
  async pickOpen() { return this.openPath; }
  async pickSave(def: string) { this.saveDefaults.push(def); return this.savePaths.shift() ?? null; }
  async readFile(p: string) { const b = this.files.get(p); if (!b) throw new Error('missing'); return b; }
  async writeFile(p: string, b: Uint8Array) { this.writes.push(p); this.files.set(p, b); }
  async error(_t: string, text: string) { this.errors.push(text); }
  async confirm() { return this.confirmAnswer; }
}

const ZIP = 'C:\\Users\\me\\Exports\\My.Board.zip';
const setup = () => {
  const pf = new FakePlatform();
  pf.files.set(ZIP, FIXTURES['multi-group-order']());
  pf.openPath = ZIP;
  const ed = new Editor();
  ed.setViewport(800, 600);
  return { pf, ed };
};

describe('default paths', () => {
  it('replaces only the final extension, for Windows and POSIX paths', () => {
    expect(defaultChalkPath(ZIP)).toBe('C:\\Users\\me\\Exports\\My.Board.chalk');
    expect(defaultChalkPath('/home/me/a.b/board')).toBe('/home/me/a.b/board.chalk');
  });
});

describe('rescue and save', () => {
  it('opens a ZIP as an unsaved rescued board with a report', async () => {
    const { pf, ed } = setup();
    const r = await openBoard(ed, pf);
    expect(r?.report?.counts.groups).toBe(2);
    expect(ed.doc.dirty).toBe(true);
    expect(ed.doc.source).toEqual({ kind: 'whiteboard-zip', path: ZIP });
  });
  it('Save after rescue acts as Save As with a .chalk default, and never writes the ZIP', async () => {
    const { pf, ed } = setup();
    await openBoard(ed, pf);
    pf.savePaths = ['C:\\Users\\me\\Exports\\My.Board.chalk'];
    expect(await saveBoard(ed, pf)).toBe(true);
    expect(pf.saveDefaults).toEqual(['C:\\Users\\me\\Exports\\My.Board.chalk']);
    expect(pf.writes).toEqual(['C:\\Users\\me\\Exports\\My.Board.chalk']);
    expect(ed.doc.dirty).toBe(false);
    expect(ed.doc.source).toEqual({ kind: 'chalk', path: 'C:\\Users\\me\\Exports\\My.Board.chalk' });
    const saved = readChalk(pf.files.get('C:\\Users\\me\\Exports\\My.Board.chalk')!);
    expect(saved.board.objects.map((o) => o.kind)).toEqual(['group', 'image', 'group', 'unsupported']);
  });
  it('refuses to save over the original export, whatever the extension case', async () => {
    const { pf, ed } = setup();
    await openBoard(ed, pf);
    pf.savePaths = ['c:/users/me/exports/my.board.zip'];
    expect(await saveBoardAs(ed, pf)).toBe(false);
    expect(pf.writes).toEqual([]);
    expect(pf.errors[0]).toMatch(/never overwrites the original export/);
  });
  it('appends .chalk when the user omits it', async () => {
    const { pf, ed } = setup();
    await openBoard(ed, pf);
    pf.savePaths = ['C:\\Users\\me\\Exports\\copy'];
    await saveBoardAs(ed, pf);
    expect(pf.writes).toEqual(['C:\\Users\\me\\Exports\\copy.chalk']);
  });
  it('saves a .chalk board in place and keeps createdAt', async () => {
    const { pf, ed } = setup();
    await openBoard(ed, pf);
    pf.savePaths = ['C:\\b.chalk'];
    await saveBoard(ed, pf);
    const first = readChalk(pf.files.get('C:\\b.chalk')!).manifest.createdAt;
    pf.openPath = 'C:\\b.chalk';
    await openBoard(ed, pf);
    ed.doc.dirty = true;
    await saveBoard(ed, pf);
    expect(pf.writes).toEqual(['C:\\b.chalk', 'C:\\b.chalk']);
    expect(readChalk(pf.files.get('C:\\b.chalk')!).manifest.createdAt).toBe(first);
  });
  it('asks before discarding unsaved changes', async () => {
    const { pf, ed } = setup();
    await openBoard(ed, pf);
    pf.confirmAnswer = false;
    expect(await openBoard(ed, pf)).toBeNull();
  });
  it('reports unreadable files without changing the open board', async () => {
    const { pf, ed } = setup();
    pf.files.set('C:\\bad.zip', new TextEncoder().encode('nope'));
    pf.openPath = 'C:\\bad.zip';
    expect(await openBoard(ed, pf)).toBeNull();
    expect(pf.errors[0]).toMatch(/not a valid Whiteboard export/);
    expect(ed.doc.source).toEqual({ kind: 'new' });
  });
  it('exports SVG next to the source', async () => {
    const { pf, ed } = setup();
    await openBoard(ed, pf);
    pf.savePaths = ['C:\\Users\\me\\Exports\\My.Board.svg'];
    expect(await exportSvg(ed, pf)).toBe(true);
    expect(pf.saveDefaults).toEqual(['C:\\Users\\me\\Exports\\My.Board.svg']);
    expect(new TextDecoder().decode(pf.files.get('C:\\Users\\me\\Exports\\My.Board.svg')!)).toContain('<svg');
  });
});
