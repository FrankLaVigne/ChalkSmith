import { WHITE } from '../../model/color';
import type { BoardObject } from '../../model/types';
import { chalkJson } from '../../format/json';
import check from '../../format/board-validator.generated.js';
import { validateBoard } from '../../format/validate';

function allFinite(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(allFinite);
  if (v && typeof v === 'object') return Object.values(v).every(allFinite);
  return true;
}

/**
 * Why an imported object could not be saved, or null when it is valid: it must contain only
 * finite numbers and pass the board schema (as a one-object board, after the same JSON
 * serialisation writeChalk uses).
 */
export function objectProblem(o: BoardObject): string | null {
  if (!allFinite(o)) return 'it contains an out-of-range number';
  const board = JSON.parse(chalkJson({ id: 'check', background: { color: WHITE }, objects: [o] }));
  if (!check(board)) {
    // The object schema is a oneOf over kinds; the deepest error is the informative one.
    const e = [...(check.errors ?? [])].sort((a, b) => b.instancePath.length - a.instancePath.length)[0];
    const where = e?.instancePath.replace(/^\/objects\/0\/?/, '');
    return e ? `${where || o.kind} ${e.message}` : 'it does not match the board schema';
  }
  try {
    validateBoard(board);
  } catch (e) {
    return (e as Error).message.replace(/^Invalid board: /, '').replace(/\.$/, '');
  }
  return null;
}

export const finiteBox = (b: { x: number; y: number; w: number; h: number }) =>
  allFinite(b) && b.w >= 0 && b.h >= 0;
