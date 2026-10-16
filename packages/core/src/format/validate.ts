import Ajv2020 from 'ajv/dist/2020';
import { ChalkError } from '../errors';
import type { Board, Stroke } from '../model/types';
import { chalkBoardSchema } from './schema';

const ajv = new Ajv2020({ allErrors: false });
const check = ajv.compile(chalkBoardSchema);

function checkStroke(s: Stroke): void {
  if (s.points.length % 2 !== 0) throw new ChalkError('SchemaInvalid', `Invalid board: stroke ${s.id} has an odd number of coordinates.`);
  if (s.widths && s.widths.length !== s.points.length / 2) {
    throw new ChalkError('SchemaInvalid', `Invalid board: stroke ${s.id} has ${s.widths.length} widths for ${s.points.length / 2} points.`);
  }
}

export function validateBoard(board: unknown): asserts board is Board {
  if (!check(board)) {
    const e = check.errors?.[0];
    throw new ChalkError('SchemaInvalid', `Invalid board: ${e?.instancePath || '/'} ${e?.message ?? 'does not match the schema'}.`);
  }
  for (const o of (board as unknown as Board).objects) {
    if (o.kind === 'stroke') checkStroke(o);
    if (o.kind === 'group') o.children.forEach(checkStroke);
  }
}
