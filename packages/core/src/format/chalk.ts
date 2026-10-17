import { strFromU8, strToU8, zipSync, type Zippable } from 'fflate';
import { ChalkError } from '../errors';
import type { Board, Manifest } from '../model/types';
import { unzipLimited, type ExportLimits } from '../util/unzip';
import { chalkJson } from './json';
import { validateBoard } from './validate';

export const CHALK_VERSION = 0;

/**
 * Limits for .chalk files, separate from (and larger than) the Whiteboard export limits so that
 * any rescued board, plus later edits, can be saved and reopened. The writer enforces the same
 * limits, so a saved file can always be read back.
 */
export const CHALK_LIMITS: ExportLimits = { maxEntries: 10_000, maxTotalBytes: 1024 * 2 ** 20, maxEntryBytes: 128 * 2 ** 20 };

const mb = (n: number) => Math.round(n / 2 ** 20);

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

const json = (v: unknown) => strToU8(chalkJson(v));

function checkWriteLimits(files: Zippable, limits: ExportLimits): void {
  const entries = Object.entries(files);
  const tooLarge = (msg: string) => new ChalkError('TooLarge', `This board is too large to save: ${msg}`);
  if (entries.length > limits.maxEntries) throw tooLarge(`it has more than ${limits.maxEntries} files.`);
  let total = 0;
  for (const [name, v] of entries) {
    // Entries are either bytes or [bytes, options]; never nested directories here.
    const size = ((Array.isArray(v) ? v[0] : v) as Uint8Array).length;
    if (size > limits.maxEntryBytes) throw tooLarge(`"${name}" is larger than ${mb(limits.maxEntryBytes)} MB.`);
    total += size;
  }
  if (total > limits.maxTotalBytes) throw tooLarge(`it is larger than ${mb(limits.maxTotalBytes)} MB.`);
}

export function writeChalk(c: ChalkContents, opts: { appVersion: string; now?: Date; limits?: ExportLimits }): Uint8Array {
  const boardJson = json(c.board);
  validateBoard(JSON.parse(strFromU8(boardJson)));
  const now = (opts.now ?? new Date()).toISOString();
  const manifest: Manifest = {
    format: 'chalk', version: CHALK_VERSION, createdBy: `ChalkSmith ${opts.appVersion}`,
    createdAt: c.createdAt ?? now, modifiedAt: now,
  };
  const files: Zippable = { 'manifest.json': json(manifest), 'board.json': boardJson };
  // Only assets the board references are written; others (e.g. images since erased, kept in
  // memory for undo) are left out.
  const used = new Set(c.board.objects.flatMap((o) => (o.kind === 'image' ? [o.asset] : [])));
  for (const [p, b] of c.assets) {
    if (!safeEntry(p, 'assets/')) throw new ChalkError('BadChalk', `Refusing to write unsafe asset path "${p}".`);
    if (used.has(p)) files[p] = [b, { level: 0 }];
  }
  for (const [p, b] of c.extensions) {
    if (!safeEntry(p, 'extensions/')) throw new ChalkError('BadChalk', `Refusing to write unsafe extension path "${p}".`);
    files[p] = b;
  }
  checkWriteLimits(files, opts.limits ?? CHALK_LIMITS);
  return zipSync(files, { level: 6 });
}

function parseJson(bytes: Uint8Array, name: string): unknown {
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    throw new ChalkError('BadChalk', `This .chalk file is damaged: ${name} is not valid JSON.`);
  }
}

export function readChalk(bytes: Uint8Array, opts: { limits?: ExportLimits } = {}): ChalkFile {
  const entries = unzipLimited(bytes, opts.limits ?? CHALK_LIMITS, 'This .chalk file',
    () => new ChalkError('BadChalk', 'This file is not a valid .chalk file (it is not a ZIP archive).'));
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
