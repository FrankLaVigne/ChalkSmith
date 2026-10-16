import {
  mimeForAsset, objectBounds, rgbaToCss, strokeOutline,
  type Bbox, type BoardObject, type Stroke, type TextureName,
} from '@chalksmith/core';
import type { EditorDoc } from './document';
import type { Editor } from './editor';
import { createTexturePattern } from './textures';

type ImgState = ImageBitmap | 'loading' | 'error';

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly paths = new WeakMap<Stroke, Path2D>();
  private readonly images = new Map<string, ImgState>();
  private readonly patterns = new Map<TextureName, CanvasPattern | null>();
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly invalidate: () => void) {
    const c = canvas.getContext('2d');
    if (!c) throw new Error('Canvas 2D is not available in this window.');
    this.ctx = c;
  }

  resize(cssW: number, cssH: number): void {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(cssW * this.dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * this.dpr));
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
  }

  draw(ed: Editor): void {
    const { ctx, canvas } = this;
    const cam = ed.camera;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = rgbaToCss(ed.doc.board.background.color);
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const k = this.dpr * cam.zoom;
    ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
    const view: Bbox = { x: cam.x, y: cam.y, w: canvas.width / k, h: canvas.height / k };
    const visible = ed.doc.index.query(view);
    const off = ed.live.moveOffset;

    for (const o of ed.doc.board.objects) {
      const moving = off !== null && ed.selection.has(o.id);
      if (!moving && !visible.has(o.id)) continue;
      if (moving) { ctx.save(); ctx.translate(off[0], off[1]); }
      this.drawObject(o, ed.doc, cam.zoom);
      if (moving) ctx.restore();
    }
    if (ed.live.stroke) this.drawStroke(ed.live.stroke, false);
    this.drawSelection(ed);
    this.drawEraser(ed);
  }

  private drawObject(o: BoardObject, doc: EditorDoc, zoom: number): void {
    const ctx = this.ctx;
    switch (o.kind) {
      case 'stroke':
        this.drawStroke(o, true);
        return;
      case 'group':
        ctx.save();
        ctx.transform(...o.transform);
        for (const c of o.children) this.drawStroke(c, true);
        ctx.restore();
        return;
      case 'image': {
        const img = this.image(doc, o.asset);
        if (img instanceof ImageBitmap) ctx.drawImage(img, o.x, o.y, o.w, o.h);
        else this.placeholder({ x: o.x, y: o.y, w: o.w, h: o.h }, img === 'error' ? 'missing image' : '', zoom);
        return;
      }
      case 'unsupported':
        this.placeholder(o.bbox, o.sourceType, zoom);
    }
  }

  private drawStroke(s: Stroke, cache: boolean): void {
    let p = cache ? this.paths.get(s) : undefined;
    if (!p) {
      p = new Path2D(strokeOutline(s));
      if (cache) this.paths.set(s, p);
    }
    if (s.brush.kind === 'texture') {
      const pat = this.pattern(s.brush.name);
      if (pat) {
        pat.setTransform(new DOMMatrix().translate(s.brush.origin[0], s.brush.origin[1]).scale(s.brush.scale));
        this.ctx.fillStyle = pat;
      } else this.ctx.fillStyle = rgbaToCss(s.color);
    } else {
      this.ctx.fillStyle = rgbaToCss(s.color);
    }
    this.ctx.fill(p, 'nonzero');
  }

  private pattern(name: TextureName): CanvasPattern | null {
    if (!this.patterns.has(name)) this.patterns.set(name, createTexturePattern(this.ctx, name));
    return this.patterns.get(name) ?? null;
  }

  private image(doc: EditorDoc, asset: string): ImgState {
    const st = this.images.get(asset);
    if (st) return st;
    const bytes = doc.assets.get(asset);
    if (!bytes) { this.images.set(asset, 'error'); return 'error'; }
    this.images.set(asset, 'loading');
    createImageBitmap(new Blob([bytes as BlobPart], { type: mimeForAsset(asset) }))
      .then((b) => { this.images.set(asset, b); this.invalidate(); })
      .catch(() => { this.images.set(asset, 'error'); this.invalidate(); });
    return 'loading';
  }

  private placeholder(b: Bbox | null, label: string, zoom: number): void {
    if (!b) return;
    const ctx = this.ctx;
    const w = Math.max(b.w, 24), h = Math.max(b.h, 24);
    ctx.save();
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    ctx.strokeRect(b.x, b.y, w, h);
    if (label) {
      ctx.setLineDash([]);
      ctx.fillStyle = '#666666';
      ctx.font = `${12 / zoom}px sans-serif`;
      ctx.fillText(label, b.x + 4 / zoom, b.y + 14 / zoom);
    }
    ctx.restore();
  }

  private drawSelection(ed: Editor): void {
    if (ed.selection.size === 0) return;
    const ctx = this.ctx;
    const z = ed.camera.zoom;
    const [ox, oy] = ed.live.moveOffset ?? [0, 0];
    ctx.save();
    ctx.strokeStyle = '#2f6fed';
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([5 / z, 4 / z]);
    for (const o of ed.doc.board.objects) {
      if (!ed.selection.has(o.id)) continue;
      const b = objectBounds(o);
      if (b) ctx.strokeRect(b.x + ox - 4 / z, b.y + oy - 4 / z, b.w + 8 / z, b.h + 8 / z);
    }
    ctx.restore();
  }

  private drawEraser(ed: Editor): void {
    const p = ed.live.eraserPath;
    if (!p || p.length < 4) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(120,120,120,0.6)';
    ctx.lineWidth = 16 / ed.camera.zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i + 1 < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.stroke();
    ctx.restore();
  }
}
