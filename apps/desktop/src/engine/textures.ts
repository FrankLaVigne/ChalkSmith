import { GALAXY_BASE, RAINBOW_STOPS, TEXTURE_TILE, galaxyStars, type TextureName } from '@chalksmith/core';

/** Original ChalkSmith texture tiles, drawn from code (no image files). */
export function createTexturePattern(ctx: CanvasRenderingContext2D, name: TextureName): CanvasPattern | null {
  const c = document.createElement('canvas');
  c.width = c.height = TEXTURE_TILE;
  const t = c.getContext('2d');
  if (!t) return null;
  if (name === 'galaxy') {
    t.fillStyle = GALAXY_BASE;
    t.fillRect(0, 0, TEXTURE_TILE, TEXTURE_TILE);
    t.fillStyle = '#ffffff';
    for (const s of galaxyStars()) {
      t.globalAlpha = s.alpha;
      t.beginPath();
      t.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      t.fill();
    }
    t.globalAlpha = 1;
  } else {
    const g = t.createLinearGradient(0, 0, TEXTURE_TILE, 0);
    RAINBOW_STOPS.forEach((col, i) => g.addColorStop(i / (RAINBOW_STOPS.length - 1), col));
    t.fillStyle = g;
    t.fillRect(0, 0, TEXTURE_TILE, TEXTURE_TILE);
  }
  return ctx.createPattern(c, 'repeat');
}
