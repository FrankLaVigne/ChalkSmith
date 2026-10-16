import type { Bbox, View } from '@chalksmith/core';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 20;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(z) ? z : 1));
}

/** x, y: world coordinates at the viewport's top-left; zoom: screen px per world px. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  static from(v?: View): Camera {
    const c = new Camera();
    if (v) { c.x = v.x; c.y = v.y; c.zoom = clampZoom(v.zoom); }
    return c;
  }

  toView(): View {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [this.x + sx / this.zoom, this.y + sy / this.zoom];
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x) * this.zoom, (wy - this.y) * this.zoom];
  }

  panBy(dsx: number, dsy: number): void {
    this.x -= dsx / this.zoom;
    this.y -= dsy / this.zoom;
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.zoom = clampZoom(this.zoom * factor);
    this.x = wx - sx / this.zoom;
    this.y = wy - sy / this.zoom;
  }

  fit(b: Bbox | null, vw: number, vh: number, margin = 32): void {
    if (!b || vw <= 0 || vh <= 0) return;
    const z = clampZoom(Math.min((vw - 2 * margin) / Math.max(b.w, 1), (vh - 2 * margin) / Math.max(b.h, 1)));
    this.zoom = z;
    this.x = b.x + b.w / 2 - vw / (2 * z);
    this.y = b.y + b.h / 2 - vh / (2 * z);
  }
}
