import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { ChalkError } from '../errors';
import type { Board, Manifest } from '../model/types';
import { round4 } from '../util/round';
import { validateBoard } from './validate';

export const CHALK_VERSION = 0;

export interface ChalkContents {
  board: Board;
  assets: Map<string, Uint8Array>;
  extensions: Map<string, Uint8Array>;
  createdAt?: string;
}

export interface ChalkFile extends ChalkContents {
  manifest: Manifest;
  warnings: string[];
}

function safeEntry(path: string, prefix: string): boolean {
  return path.startsWith(prefix) && !path.includes('..') && !path.includes('\\') && !path.startsWith('/') && path.length > prefix.length;
}

const json = (v: unknown) =>
  strToU8(JSON.stringify(v, (_k, x) => (typeof x === 'number' ? round4(x) : x), 2));

export function writeChalk(c: ChalkContents, opts: { appVersion: string; now?: Date }): Uint8Array {
  validateBoard(c.board);
  const now = (opts.now ?? new Date()).toISOString();
  const manifest: Manifest = {
    format: 'chalk', version: CHALK_VERSION, createdBy: `ChalkSmith ${opts.appVersion}`,
    createdAt: c.createdAt ?? now, modifiedAt: now,
  };
  const files: Zippable = { 'manifest.json': json(manifest), 'board.json': json(c.board) };
  for (const [p, b] of c.assets) {
    if (!safeEntry(p, 'assets/')) throw new ChalkError('BadChalk', `Refusing to write unsafe asset path "${p}".`);
    files[p] = [b, { level: 0 }];
  }
  for (const [p, b] of c.extensions) {
    if (!safeEntry(p, 'extensions/')) throw new ChalkError('BadChalk', `Refusing to write unsafe extension path "${p}".`);
    files[p] = b;
  }
  return zipSync(files, { level: 6 });
}

function parseJson(bytes: Uint8Array, name: string): unknown {
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    throw new ChalkError('BadChalk', `This .chalk file is damaged: ${name} is not valid JSON.`);
  }
}

export function readChalk(bytes: Uint8Array): ChalkFile {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new ChalkError('BadChalk', 'This file is not a valid .chalk file (it is not a ZIP archive).');
  }
  const m = entries['manifest.json'];
  const b = entries['board.json'];
  if (!m || !b) throw new ChalkError('BadChalk', 'This .chalk file is missing manifest.json or board.json.');
  const manifest = parseJson(m, 'manifest.json') as Partial<Manifest> | null;
  if (!manifest || manifest.format !== 'chalk') throw new ChalkError('BadChalk', 'This file is not a ChalkSmith board.');
  if (typeof manifest.version !== 'number' || manifest.version > CHALK_VERSION) {
    throw new ChalkError('UnsupportedVersion',
      `This board was saved by a newer ChalkSmith (format version ${String(manifest.version)}). Please update ChalkSmith.`);
  }
  const board = parseJson(b, 'board.json');
  validateBoard(board);
  const assets = new Map<string, Uint8Array>();
  const extensions = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) {
    if (safeEntry(name, 'assets/')) assets.set(name, data);
    else if (safeEntry(name, 'extensions/')) extensions.set(name, data);
  }
  const warnings: string[] = [];
  for (const o of board.objects) {
    if (o.kind === 'image' && !assets.has(o.asset)) warnings.push(`Image ${o.id}: asset ${o.asset} is missing.`);
  }
  return { board, assets, extensions, createdAt: manifest.createdAt, manifest: manifest as Manifest, warnings };
}
