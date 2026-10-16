import { ChalkError } from '../errors';
import type { Board, Stroke } from '../model/types';
import check from './board-validator.generated.js';

const KINDS = new Set(['stroke', 'group', 'image', 'unsupported']);

function checkStroke(s: Stroke): void {
  if (s.points.length % 2 !== 0) throw new ChalkError('SchemaInvalid', `Invalid board: stroke ${s.id} has an odd number of coordinates.`);
  if (s.widths && s.widths.length !== s.points.length / 2) {
    throw new ChalkError('SchemaInvalid', `Invalid board: stroke ${s.id} has ${s.widths.length} widths for ${s.points.length / 2} points.`);
  }
}

function checkKinds(board: unknown): void {
  const objects = (board as { objects?: unknown } | null)?.objects;
  if (!Array.isArray(objects)) return;
  for (const o of objects) {
    const kind = (o as { kind?: unknown } | null)?.kind;
    if (!KINDS.has(kind as string)) {
      const id = (o as { id?: unknown } | null)?.id;
      throw new ChalkError('SchemaInvalid', `Invalid board: unknown object kind ${JSON.stringify(kind)}${typeof id === 'string' ? ` (object ${id})` : ''}.`);
    }
  }
}

export function validateBoard(board: unknown): asserts board is Board {
  checkKinds(board);
  if (!check(board)) {
    const e = check.errors?.[0];
    throw new ChalkError('SchemaInvalid', `Invalid board: ${e?.instancePath || '/'} ${e?.message ?? 'does not match the schema'}.`);
  }
  for (const o of (board as unknown as Board).objects) {
    if (o.kind === 'stroke') checkStroke(o);
    if (o.kind === 'group') o.children.forEach(checkStroke);
  }
}
