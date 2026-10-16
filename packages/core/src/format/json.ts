import { round4 } from '../util/round';

/** The JSON text ChalkSmith writes: numbers rounded to 4 decimals, 2-space indent. */
export const chalkJson = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (typeof x === 'number' ? round4(x) : x), 2);
