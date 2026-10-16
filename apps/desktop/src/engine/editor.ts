import { boardBounds, randomId, round4, type IdGen } from '@chalksmith/core';
import { Camera } from './camera';
import { RemoveItems } from './commands';
import { EditorDoc, type DocSource } from './document';
import { History } from './history';
import {
  DrawTool, EraserTool, HandTool, SelectTool, defaultSettings,
  type LiveOverlay, type Tool, type ToolHost, type ToolPointer, type ToolSettings,
} from './tools';

export type ToolName = 'pen' | 'highlighter' | 'eraser' | 'select' | 'hand';

export class Editor implements ToolHost {
  doc: EditorDoc = EditorDoc.empty();
  camera = new Camera();
  readonly history: History;
  selection = new Set<string>();
  readonly live: LiveOverlay = { stroke: null, eraserPath: null, moveOffset: null };
  settings: ToolSettings = defaultSettings();
  toolName: ToolName = 'pen';
  viewport = { w: 0, h: 0 };
  private readonly tools: Record<ToolName, Tool>;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly renderFn: () => void = () => {}, idGen: IdGen = randomId) {
    this.history = new History(() => this.doc, () => this.emit());
    this.tools = {
      pen: new DrawTool('pen', idGen),
      highlighter: new DrawTool('highlighter', idGen),
      eraser: new EraserTool(),
      select: new SelectTool(),
      hand: new HandTool(),
    };
  }

  private get tool(): Tool { return this.tools[this.toolName]; }

  render(): void { this.renderFn(); }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  setViewport(w: number, h: number): void { this.viewport = { w, h }; }

  load(doc: EditorDoc): void {
    this.tool.cancel(this);
    this.doc = doc;
    this.history.clear();
    this.selection = new Set();
    this.camera = doc.board.view ? Camera.from(doc.board.view) : new Camera();
    if (!doc.board.view) this.camera.fit(boardBounds(doc.board.objects), this.viewport.w, this.viewport.h);
    this.emit();
    this.render();
  }

  fitToBoard(): void {
    this.camera.fit(boardBounds(this.doc.board.objects), this.viewport.w, this.viewport.h);
    this.viewChanged();
  }

  viewChanged(): void {
    this.emit();
    this.render();
  }

  setTool(name: ToolName): void {
    this.tool.cancel(this);
    this.toolName = name;
    if (name !== 'select') this.setSelection([]);
    else this.emit();
  }

  setSettings(p: Partial<ToolSettings>): void {
    this.settings = { ...this.settings, ...p };
    this.emit();
  }

  setSelection(ids: string[]): void {
    this.selection = new Set(ids);
    this.emit();
    this.render();
  }

  deleteSelection(): void {
    if (this.selection.size === 0) return;
    this.tool.cancel(this);
    this.history.execute(new RemoveItems([...this.selection].map((id) => ({ groupId: null, id }))));
    this.setSelection([]);
  }

  undo(): void { this.tool.cancel(this); if (this.history.undo()) this.afterHistory(); }
  redo(): void { this.tool.cancel(this); if (this.history.redo()) this.afterHistory(); }

  private afterHistory(): void {
    const ids = new Set(this.doc.board.objects.map((o) => o.id));
    this.setSelection([...this.selection].filter((id) => ids.has(id)));
  }

  pointerDown(p: ToolPointer): void { this.tool.down(p, this); }
  pointerMove(p: ToolPointer): void { this.tool.move(p, this); }
  pointerUp(p: ToolPointer): void { this.tool.up(p, this); }
  pointerCancel(): void { this.tool.cancel(this); }

  captureView(): void {
    this.doc.board.view = { x: round4(this.camera.x), y: round4(this.camera.y), zoom: round4(this.camera.zoom) };
  }

  markSaved(source: DocSource): void {
    this.doc.dirty = false;
    this.doc.source = source;
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
