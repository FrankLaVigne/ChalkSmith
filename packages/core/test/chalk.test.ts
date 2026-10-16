import { generateValidatorSource } from '../scripts/validator-source';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readChalk, writeChalk, chalkBoardSchema, ChalkError, rescueWhiteboardZip, seqIds, type Board } from '../src/index';
import { FIXTURES } from '../fixtures/catalog';

const asset = 'assets/' + 'a'.repeat(64) + '.png';
const board: Board = {
  id: 'b1',
  background: { color: { r: 255, g: 255, b: 255, a: 1 } },
  view: { x: -10.5, y: 3, zoom: 0.25 },
  objects: [
    { kind: 'stroke', id: 's1', tool: 'pen', color: { r: 31, g: 31, b: 31, a: 1 }, width: 3.5,
      points: [0, 0, 1.2345, 2], widths: [1, 3.5], brush: { kind: 'solid' }, sourceOutline: 'M0,0L1,1',
      source: { system: 'ms-whiteboard', id: 'abc' } },
    { kind: 'group', id: 'g1', transform: [1, 0, 0, 1, 10, 20], children: [
      { kind: 'stroke', id: 's2', tool: 'highlighter', color: { r: 253, g: 132, b: 45, a: 0.4 }, width: 9.3,
        points: [0, 0], brush: { kind: 'texture', name: 'galaxy', origin: [0, 0], scale: 0.5 } },
    ] },
    { kind: 'image', id: 'i1', asset, x: 1, y: 2, w: 30, h: 20, intrinsic: { w: 60, h: 40 } },
    { kind: 'unsupported', id: 'u1', sourceType: 'StickyNote', bbox: null },
  ],
};
const contents = () => ({
  board: structuredClone(board),
  assets: new Map([[asset, new Uint8Array([1, 2, 3])]]),
  extensions: new Map([['extensions/ms-whiteboard/comments.json', strToU8('{"commentThreads":[]}')]]),
});

describe('.chalk round trip', () => {
  it('writes and reads back identical content', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    const f = readChalk(writeChalk(contents(), { appVersion: '0.1.0', now }));
    expect(f.board).toEqual(board);
    expect([...f.assets.keys()]).toEqual([asset]);
    expect(f.assets.get(asset)).toEqual(new Uint8Array([1, 2, 3]));
    expect(f.extensions.size).toBe(1);
    expect(f.manifest).toEqual({ format: 'chalk', version: 0, createdBy: 'ChalkSmith 0.1.0',
      createdAt: '2026-10-16T12:00:00.000Z', modifiedAt: '2026-10-16T12:00:00.000Z' });
    expect(f.warnings).toEqual([]);
  });
  it('keeps createdAt when given', () => {
    const f = readChalk(writeChalk({ ...contents(), createdAt: '2020-01-01T00:00:00.000Z' }, { appVersion: 'x' }));
    expect(f.manifest.createdAt).toBe('2020-01-01T00:00:00.000Z');
  });
  it('rounds numbers to 4 decimals on write', () => {
    const c = contents();
    (c.board.objects[0] as { points: number[] }).points = [0.123456, 0, 1, 1];
    const f = readChalk(writeChalk(c, { appVersion: 'x' }));
    expect((f.board.objects[0] as { points: number[] }).points[0]).toBe(0.1235);
  });
});

const zip = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ChalkError).code; } return 'none'; };

describe('.chalk rejection', () => {
  it('rejects non-zip, missing parts, wrong format and future versions', () => {
    expect(code(() => readChalk(strToU8('hello')))).toBe('BadChalk');
    expect(code(() => readChalk(zip({ 'board.json': '{}' })))).toBe('BadChalk');
    expect(code(() => readChalk(zip({ 'manifest.json': '{"format":"other","version":0}', 'board.json': '{}' })))).toBe('BadChalk');
    expect(code(() => readChalk(zip({ 'manifest.json': '{"format":"chalk","version":1}', 'board.json': '{}' })))).toBe('UnsupportedVersion');
  });
  it('rejects schema violations, odd points and width mismatches', () => {
    const m = '{"format":"chalk","version":0,"createdBy":"x","createdAt":"a","modifiedAt":"a"}';
    const bad = (b: unknown) => code(() => readChalk(zip({ 'manifest.json': m, 'board.json': JSON.stringify(b) })));
    const ok = structuredClone(board);
    expect(bad({ ...ok, background: { color: { r: 999, g: 0, b: 0, a: 1 } } })).toBe('SchemaInvalid');
    const odd = structuredClone(board); (odd.objects[0] as { points: number[] }).points = [1, 2, 3];
    expect(bad(odd)).toBe('SchemaInvalid');
    const mism = structuredClone(board); (mism.objects[0] as { widths: number[] }).widths = [1];
    expect(bad(mism)).toBe('SchemaInvalid');
  });
  it('warns about missing assets and ignores unsafe entry names', () => {
    const c = contents(); c.assets.clear();
    const bytes = writeChalk(c, { appVersion: 'x' });
    const f = readChalk(bytes);
    expect(f.warnings).toEqual([`Image i1: asset ${asset} is missing.`]);
    expect(() => writeChalk({ ...contents(), assets: new Map([['../evil.png', new Uint8Array()]]) }, { appVersion: 'x' })).toThrow();
  });
  it('writes only assets the board references', () => {
    const c = contents();
    const orphan = 'assets/' + 'b'.repeat(64) + '.png';
    c.assets.set(orphan, new Uint8Array([9, 9]));
    const f = readChalk(writeChalk(c, { appVersion: 'x' }));
    expect([...f.assets.keys()]).toEqual([asset]);
    const noImages = { ...contents(), board: { ...structuredClone(board), objects: board.objects.filter((o) => o.kind !== 'image') } };
    expect(readChalk(writeChalk(noImages, { appVersion: 'x' })).assets.size).toBe(0);
  });
  it('applies unzip limits when reading', () => {
    const bytes = writeChalk(contents(), { appVersion: 'x' });
    const code = (limits: { maxEntries: number; maxTotalBytes: number; maxEntryBytes: number }) => {
      try { readChalk(bytes, { limits }); return 'ok'; } catch (e) { return (e as ChalkError).code; }
    };
    expect(code({ maxEntries: 64, maxTotalBytes: 2 ** 20, maxEntryBytes: 2 ** 20 })).toBe('ok');
    expect(code({ maxEntries: 2, maxTotalBytes: 2 ** 20, maxEntryBytes: 2 ** 20 })).toBe('TooLarge');
    expect(code({ maxEntries: 64, maxTotalBytes: 100, maxEntryBytes: 2 ** 20 })).toBe('TooLarge');
    expect(code({ maxEntries: 64, maxTotalBytes: 2 ** 20, maxEntryBytes: 50 })).toBe('TooLarge');
  });
  it('round-trips a rescued board exactly', () => {
    const r = rescueWhiteboardZip(FIXTURES['multi-group-order'](), { idGen: seqIds() });
    expect(r.board.view).toBeDefined();
    expect(r.assets.size).toBe(1);
    const f = readChalk(writeChalk(r, { appVersion: 'x' }));
    expect(f.board).toEqual(r.board);
    expect(f.assets).toEqual(r.assets);
    expect(f.extensions).toEqual(r.extensions);
  });
});

describe('published schema', () => {
  it('docs/spec/chalk-format.md contains exactly the code schema', () => {
    const md = readFileSync(fileURLToPath(new URL('../../../docs/spec/chalk-format.md', import.meta.url)), 'utf8');
    const block = md.match(/```json\n([\s\S]*?)\n```/);
    expect(block).not.toBeNull();
    expect(JSON.parse(block![1])).toEqual(JSON.parse(JSON.stringify(chalkBoardSchema)));
  });
});

describe('.chalk fix round 1', () => {
  const m = '{"format":"chalk","version":0,"createdBy":"x","createdAt":"a","modifiedAt":"a"}';
  it('validates the rounded board at write time', () => {
    const c = contents();
    (c.board.objects[0] as { width: number }).width = 0.00004;
    expect(code(() => writeChalk(c, { appVersion: 'x' }))).toBe('SchemaInvalid');
    const d = contents();
    d.board.view = { x: 0, y: 0, zoom: 0.00001 };
    expect(code(() => writeChalk(d, { appVersion: 'x' }))).toBe('SchemaInvalid');
  });
  it('rejects unknown object kinds with a clear message', () => {
    const b = { ...structuredClone(board), objects: [{ kind: 'foo', id: 'x' }] };
    let err: ChalkError | undefined;
    try { readChalk(zip({ 'manifest.json': m, 'board.json': JSON.stringify(b) })); } catch (e) { err = e as ChalkError; }
    expect(err?.code).toBe('SchemaInvalid');
    expect(err?.message).toContain('unknown object kind');
  });
  it('ignores unsafe entry names in a crafted zip', () => {
    const f = readChalk(zip({
      'manifest.json': m, 'board.json': JSON.stringify({ id: 'b', background: board.background, objects: [] }),
      'assets/../evil.png': 'x', 'assets\\x.png': 'x', 'extensions/../y.json': 'x', [asset]: 'ok',
    }));
    expect([...f.assets.keys()]).toEqual([asset]);
    expect(f.extensions.size).toBe(0);
  });
  it('rejects invalid JSON in board.json and manifest.json', () => {
    expect(code(() => readChalk(zip({ 'manifest.json': m, 'board.json': '{nope' })))).toBe('BadChalk');
    expect(code(() => readChalk(zip({ 'manifest.json': '{nope', 'board.json': '{}' })))).toBe('BadChalk');
  });
});

describe('standalone validator', () => {
  const dir = new URL('../src/format/', import.meta.url);
  it('committed generated validator matches the schema', () => {
    const committed = readFileSync(fileURLToPath(new URL('board-validator.generated.js', dir)), 'utf8');
    expect(committed).toBe(generateValidatorSource());
  });
  it('validate.ts does not compile schemas at runtime', () => {
    const src = readFileSync(fileURLToPath(new URL('validate.ts', dir)), 'utf8');
    expect(src).not.toContain('compile(');
    expect(src).not.toContain('new Ajv');
  });
});
