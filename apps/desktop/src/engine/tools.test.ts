import { describe, expect, it } from 'vitest';
import { seqIds, type Stroke } from '@chalksmith/core';
import { Editor } from './editor';
import { EditorDoc } from './document';
import type { ToolPointer } from './tools';

const at = (wx: number, wy: number, extra: Partial<ToolPointer> = {}): ToolPointer =>
  ({ wx, wy, sx: wx, sy: wy, pressure: 0.5, pointerType: 'mouse', ...extra });

const draw = (ed: Editor, pts: [number, number][], extra: Partial<ToolPointer> = {}) => {
  ed.pointerDown(at(...pts[0], extra));
  for (const p of pts.slice(1, -1)) ed.pointerMove(at(...p, extra));
  ed.pointerUp(at(...pts[pts.length - 1], extra));
};

const newEditor = () => {
  let renders = 0;
  const ed = new Editor(() => renders++, seqIds('t'));
  ed.load(EditorDoc.empty());
  return { ed, renders: () => renders };
};

describe('pen and highlighter', () => {
  it('creates a pen stroke with current settings and constant width for mouse', () => {
    const { ed } = newEditor();
    ed.setSettings({ penWidth: 8 });
    draw(ed, [[0, 0], [10, 0], [20, 0]]);
    const s = ed.doc.board.objects[0] as Stroke;
    expect(s).toMatchObject({ kind: 'stroke', tool: 'pen', width: 8, points: [0, 0, 10, 0, 20, 0] });
    expect(s.widths).toBeUndefined();
    expect(s.id).toMatch(/^t-/);
    expect(ed.live.stroke).toBeNull();
    expect(ed.history.canUndo).toBe(true);
  });
  it('records pressure as per-point widths for a pen device', () => {
    const { ed } = newEditor();
    ed.setSettings({ penWidth: 10 });
    ed.pointerDown(at(0, 0, { pointerType: 'pen', pressure: 0.2 }));
    ed.pointerMove(at(10, 0, { pointerType: 'pen', pressure: 1 }));
    ed.pointerUp(at(20, 0, { pointerType: 'pen', pressure: 0.5 }));
    expect((ed.doc.board.objects[0] as Stroke).widths).toEqual([2, 10, 5]);
  });
  it('drops sub-pixel jitter', () => {
    const { ed } = newEditor();
    draw(ed, [[0, 0], [0.1, 0], [0.2, 0], [10, 0]]);
    expect((ed.doc.board.objects[0] as Stroke).points).toEqual([0, 0, 10, 0]);
  });
  it('draws translucent highlighter strokes', () => {
    const { ed } = newEditor();
    ed.setTool('highlighter');
    draw(ed, [[0, 0], [30, 0]]);
    const s = ed.doc.board.objects[0] as Stroke;
    expect(s.tool).toBe('highlighter');
    expect(s.color.a).toBe(0.4);
    expect(s.width).toBe(12);
  });
  it('cancels the live stroke when switching tools', () => {
    const { ed } = newEditor();
    ed.pointerDown(at(0, 0));
    ed.pointerMove(at(10, 0));
    ed.setTool('select');
    expect(ed.live.stroke).toBeNull();
    expect(ed.doc.board.objects).toHaveLength(0);
  });
});

describe('eraser, select, hand', () => {
  it('erases strokes under the path, undoably', () => {
    const { ed } = newEditor();
    draw(ed, [[0, 0], [100, 0]]);
    draw(ed, [[0, 50], [100, 50]]);
    ed.setTool('eraser');
    draw(ed, [[50, -10], [50, 10]]);
    expect(ed.doc.board.objects).toHaveLength(1);
    ed.undo();
    expect(ed.doc.board.objects).toHaveLength(2);
  });
  it('selects, drags and deletes', () => {
    const { ed } = newEditor();
    draw(ed, [[0, 0], [100, 0]]);
    const id = ed.doc.board.objects[0].id;
    ed.setTool('select');
    ed.pointerDown(at(50, 1));
    expect([...ed.selection]).toEqual([id]);
    ed.pointerMove(at(60, 11));
    expect(ed.live.moveOffset).toEqual([10, 10]);
    ed.pointerUp(at(60, 11));
    expect((ed.doc.board.objects[0] as Stroke).points).toEqual([10, 10, 110, 10]);
    ed.deleteSelection();
    expect(ed.doc.board.objects).toHaveLength(0);
    ed.undo();
    expect(ed.doc.board.objects).toHaveLength(1);
  });
  it('clears the selection when clicking empty space', () => {
    const { ed } = newEditor();
    draw(ed, [[0, 0], [100, 0]]);
    ed.setTool('select');
    ed.pointerDown(at(50, 0)); ed.pointerUp(at(50, 0));
    ed.pointerDown(at(500, 500)); ed.pointerUp(at(500, 500));
    expect(ed.selection.size).toBe(0);
  });
  it('pans with the hand tool', () => {
    const { ed } = newEditor();
    ed.setTool('hand');
    ed.pointerDown(at(0, 0, { sx: 100, sy: 100 }));
    ed.pointerMove(at(0, 0, { sx: 150, sy: 120 }));
    ed.pointerUp(at(0, 0, { sx: 150, sy: 120 }));
    expect(ed.camera.toView()).toEqual({ x: -50, y: -20, zoom: 1 });
  });
  it('captures the view into the board for saving', () => {
    const { ed } = newEditor();
    ed.camera.x = 1.234567; ed.camera.zoom = 2;
    ed.captureView();
    expect(ed.doc.board.view).toEqual({ x: 1.2346, y: 0, zoom: 2 });
  });
});

describe('history and delete cancel in-progress gestures', () => {
  it('undo during a pen stroke discards the live stroke', () => {
    const { ed } = newEditor();
    draw(ed, [[0, 0], [50, 0]]);
    ed.pointerDown(at(0, 10));
    ed.pointerMove(at(20, 10));
    expect(ed.live.stroke).not.toBeNull();
    ed.undo();
    expect(ed.live.stroke).toBeNull();
    ed.pointerUp(at(40, 10));
    expect(ed.doc.board.objects).toHaveLength(0);
  });
  it('deleteSelection during a drag does not commit a stale move', () => {
    const { ed } = newEditor();
    draw(ed, [[0, 0], [100, 0]]);
    ed.setTool('select');
    ed.pointerDown(at(50, 1));
    ed.pointerMove(at(60, 11));
    ed.deleteSelection();
    ed.pointerUp(at(60, 11));
    expect(ed.doc.board.objects).toHaveLength(0);
    ed.undo();
    expect((ed.doc.board.objects[0] as Stroke).points).toEqual([0, 0, 100, 0]);
  });
});
