/** Round to 4 decimal places; never returns -0. */
export function round4(n: number): number {
  const r = Math.round(n * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
}
