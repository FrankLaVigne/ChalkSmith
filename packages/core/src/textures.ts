import { round4 } from './util/round';

export const TEXTURE_TILE = 128;
export const GALAXY_STAR_COUNT = 80;
export const GALAXY_BASE = '#1b1340';
export const RAINBOW_STOPS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#af52de', '#ff3b30'];

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Star { x: number; y: number; r: number; alpha: number }

export function galaxyStars(size = TEXTURE_TILE, count = GALAXY_STAR_COUNT, seed = 0xc4a1c): Star[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    x: round4(rnd() * size),
    y: round4(rnd() * size),
    r: round4(0.3 + rnd() * 1.2),
    alpha: round4(0.5 + rnd() * 0.5),
  }));
}
