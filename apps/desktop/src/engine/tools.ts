import { hitTest, inflate, pointsBbox, randomId, round4, strokesUnderPath, type IdGen, type RGBA, type Stroke } from '@chalksmith/core';
import type { Camera } from './camera';
import { AddObject, MoveItems, RemoveItems } from './commands';
import type { EditorDoc } from './document';
import type { History } from './history';

export const PEN_COLORS: RGBA[] = [
  { r: 31, g: 31, b: 31, a: 1 }, { r: 231, g: 18, b: 36, a: 1 }, { r: 255, g: 140, b: 0, a: 1 },
  { r: 250, g: 200, b: 0, a: 1 }, { r: 22, g: 140, b: 70, a: 1 }, { r: 0, g: 110, b: 200, a: 1 },
  { r: 125, g: 70, b: 180, a: 1 }, { r: 120, g: 120, b: 120, a: 1 },
];
export const PEN_WIDTHS = [2, 4, 8, 16];
export const HIGHLIGHTER_COLORS: RGBA[] = [
  { r: 255, g: 230, b: 0, a: 0.4 }, { r: 120, g: 230, b: 90, a: 0.4 },
  { r: 255, g: 120, b: 190, a: 0.4 }, { r: 110, g: 190, b: 255, a: 0.4 },
];
export const HIGHLIGHTER_WIDTHS = [12, 24];

export interface ToolSettings { penColor: RGBA; penWidth: number; highlighterColor: RGBA; highlighterWidth: number }
export const defaultSettings = (): ToolSettings => ({
  penColor: PEN_COLORS[0], penWidth: 4, highlighterColor: HIGHLIGHTER_COLORS[0], highlighterWidth: 12,
});

export interface ToolPointer { wx: number; wy: number; sx: number; sy: number; pressure: number; pointerType: string }
export interface LiveOverlay { stroke: Stroke | null; eraserPath: number[] | null; moveOffset: [number, number] | null }

export interface ToolHost {
  doc: EditorDoc;
  camera: Camera;
  history: History;
  selection: Set<string>;
  live: LiveOverlay;
  settings: ToolSettings;
  render(): void;
  viewChanged(): void;
  setSelection(ids: string[]): void;
}

export interface Tool {
  down(p: ToolPointer, h: ToolHost): void;
  move(p: ToolPointer, h: ToolHost): void;
  up(p: ToolPointer, h: ToolHost): void;
  cancel(h: ToolHost): void;
}

export class DrawTool implements Tool {
  private pts: number[] = [];
  private ws: number[] = [];
  private device = false;
  private active = false;
  constructor(private readonly kind: 'pen' | 'highlighter', private readonly idGen: IdGen = randomId) {}

  down(p: ToolPointer, h: ToolHost): void {
    this.active = true;
    this.pts = [];
    this.ws = [];
    this.device = p.pointerType === 'pen';
    this.add(p, h);
  }

  move(p: ToolPointer, h: ToolHost): void {
    if (!this.active) return;
    const n = this.pts.length;
    if (Math.hypot(p.wx - this.pts[n - 2], p.wy - this.pts[n - 1]) < 0.5 / h.camera.zoom) return;
    this.add(p, h);
  }

  up(p: ToolPointer, h: ToolHost): void {
    if (!this.active) return;
    this.move(p, h);
    this.active = false;
    const s = this.build(h, this.idGen());
    h.live.stroke = null;
    h.history.execute(new AddObject(s));
    h.render();
  }

  cancel(h: ToolHost): void {
    this.active = false;
    h.live.stroke = null;
    h.render();
  }

  private width(h: ToolHost): number {
    return this.kind === 'pen' ? h.settings.penWidth : h.settings.highlighterWidth;
  }

  private add(p: ToolPointer, h: ToolHost): void {
    this.pts.push(round4(p.wx), round4(p.wy));
    const pressure = Math.min(1, Math.max(0.1, p.pressure || 0.5));
    this.ws.push(round4(this.width(h) * pressure));
    h.live.stroke = this.build(h, 'live');
    h.render();
  }

  private build(h: ToolHost, id: string): Stroke {
    const s: Stroke = {
      kind: 'stroke', id, tool: this.kind,
      color: { ...(this.kind === 'pen' ? h.settings.penColor : h.settings.highlighterColor) },
      width: this.width(h), points: [...this.pts], brush: { kind: 'solid' },
    };
    if (this.kind === 'pen' && this.device) s.widths = [...this.ws];
    return s;
  }
}

export class EraserTool implements Tool {
  private path: number[] = [];
  down(p: ToolPointer, h: ToolHost): void {
    this.path = [p.wx, p.wy];
    h.live.eraserPath = this.path;
    h.render();
  }
  move(p: ToolPointer, h: ToolHost): void {
    if (!h.live.eraserPath) return;
    this.path.push(p.wx, p.wy);
    h.render();
  }
  up(p: ToolPointer, h: ToolHost): void {
    if (!h.live.eraserPath) return;
    this.path.push(p.wx, p.wy);
    const tol = 8 / h.camera.zoom;
    const candidates = h.doc.index.query(inflate(pointsBbox(this.path)!, tol));
    const refs = strokesUnderPath(h.doc.board.objects, this.path, tol, candidates);
    h.live.eraserPath = null;
    this.path = [];
    if (refs.length) h.history.execute(new RemoveItems(refs));
    h.render();
  }
  cancel(h: ToolHost): void {
    h.live.eraserPath = null;
    this.path = [];
    h.render();
  }
}

export class SelectTool implements Tool {
  private start: [number, number] | null = null;
  down(p: ToolPointer, h: ToolHost): void {
    const tol = 6 / h.camera.zoom;
    const candidates = h.doc.index.query({ x: p.wx - tol, y: p.wy - tol, w: 2 * tol, h: 2 * tol });
    const id = hitTest(h.doc.board.objects, p.wx, p.wy, tol, candidates);
    if (!id) {
      this.start = null;
      h.setSelection([]);
      return;
    }
    if (!h.selection.has(id)) h.setSelection([id]);
    this.start = [p.wx, p.wy];
    h.live.moveOffset = [0, 0];
  }
  move(p: ToolPointer, h: ToolHost): void {
    if (!this.start) return;
    h.live.moveOffset = [p.wx - this.start[0], p.wy - this.start[1]];
    h.render();
  }
  up(p: ToolPointer, h: ToolHost): void {
    if (!this.start) return;
    const dx = round4(p.wx - this.start[0]);
    const dy = round4(p.wy - this.start[1]);
    this.start = null;
    h.live.moveOffset = null;
    if (dx !== 0 || dy !== 0) h.history.execute(new MoveItems([...h.selection], dx, dy));
    h.render();
  }
  cancel(h: ToolHost): void {
    this.start = null;
    h.live.moveOffset = null;
    h.render();
  }
}

export class HandTool implements Tool {
  private last: [number, number] | null = null;
  down(p: ToolPointer): void { this.last = [p.sx, p.sy]; }
  move(p: ToolPointer, h: ToolHost): void {
    if (!this.last) return;
    h.camera.panBy(p.sx - this.last[0], p.sy - this.last[1]);
    this.last = [p.sx, p.sy];
    h.viewChanged();
  }
  up(p: ToolPointer, h: ToolHost): void { this.move(p, h); this.last = null; }
  cancel(): void { this.last = null; }
}
