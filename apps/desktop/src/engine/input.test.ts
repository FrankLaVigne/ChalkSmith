import { describe, expect, it } from 'vitest';
import { wheelDelta, zoomFactor } from './input';

describe('wheelDelta', () => {
  it('passes pixel deltas through', () => {
    expect(wheelDelta({ deltaX: 3, deltaY: 100, deltaMode: 0 }, 800)).toEqual([3, 100]);
  });
  it('scales line deltas by 16', () => {
    expect(wheelDelta({ deltaX: 0, deltaY: 3, deltaMode: 1 }, 800)).toEqual([0, 48]);
  });
  it('scales page deltas by page height', () => {
    expect(wheelDelta({ deltaX: 1, deltaY: 1, deltaMode: 2 }, 800)).toEqual([800, 800]);
  });
});

describe('zoomFactor', () => {
  it('is 1 for no delta and tracks small deltas', () => {
    expect(zoomFactor(0)).toBe(1);
    expect(zoomFactor(-2)).toBeCloseTo(Math.exp(0.02), 10);
  });
  it('clamps a wheel notch to about 1.28x', () => {
    expect(zoomFactor(-100)).toBeCloseTo(Math.exp(0.25), 10);
    expect(zoomFactor(100)).toBeCloseTo(Math.exp(-0.25), 10);
    expect(zoomFactor(-100)).toBeLessThan(1.3);
  });
});
