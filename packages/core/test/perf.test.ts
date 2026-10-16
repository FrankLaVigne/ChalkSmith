import { describe, expect, it } from 'vitest';
import { GridIndex, inflate, objectBounds, pointsBbox, rescueWhiteboardZip, strokesUnderPath } from '../src/index';
import { largeBoardZip } from '../fixtures/large';

// Generous, CI-safe budgets on a synthetic ~26k-point board (26 strokes × 1000 points).
describe('performance on a large board', () => {
  const zip = largeBoardZip(13, 2, 1000);

  it('rescues in under 3 s and erases a 40-sample swipe in under 200 ms', () => {
    let t = performance.now();
    const { board } = rescueWhiteboardZip(zip);
    const rescueMs = performance.now() - t;
    expect(board.objects).toHaveLength(13);
    expect(rescueMs).toBeLessThan(3000);

    const index = new GridIndex(256);
    for (const o of board.objects) {
      const b = objectBounds(o);
      if (b) index.insert(o.id, b);
    }
    const g = objectBounds(board.objects[6])!;
    const path: number[] = [];
    for (let i = 0; i < 40; i++) path.push(g.x + (g.w * i) / 39, g.y + (g.h * i) / 39);
    const tol = 8;
    t = performance.now();
    const candidates = index.query(inflate(pointsBbox(path)!, tol));
    const refs = strokesUnderPath(board.objects, path, tol, candidates);
    const eraseMs = performance.now() - t;
    expect(refs).toEqual(strokesUnderPath(board.objects, path, tol));
    expect(eraseMs).toBeLessThan(200);
  });
});
