import { describe, expect, it } from 'vitest';
import type { Group, Stroke } from '@chalksmith/core';
import { Camera, MAX_ZOOM, MIN_ZOOM } from './camera';
import { EditorDoc } from './document';
import { AddObject, MoveItems, RemoveItems } from './commands';
import { History } from './history';

const stroke = (id: string, x = 0): Stroke => ({
  kind: 'stroke', id, tool: 'pen', color: { r: 0, g: 0, b: 0, a: 1 }, width: 4,
  points: [x, 0, x + 10, 0], brush: { kind: 'solid' }, sourceOutline: `M${x},0L${x + 10},0`,
});

describe('Camera', () => {
  it('round-trips screen and world coordinates', () => {
    const c = new Camera(); c.x = 100; c.y = 50; c.zoom = 2;
    const [wx, wy] = c.screenToWorld(20, 40);
    expect([wx, wy]).toEqual([110, 70]);
    expect(c.worldToScreen(wx, wy)).toEqual([20, 40]);
  });
  it('zooms about the cursor and clamps', () => {
    const c = new Camera();
    const before = c.screenToWorld(300, 200);
    c.zoomAt(300, 200, 3);
    const after = c.screenToWorld(300, 200);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
    c.zoomAt(0, 0, 1e9); expect(c.zoom).toBe(MAX_ZOOM);
    c.zoomAt(0, 0, 1e-12); expect(c.zoom).toBe(MIN_ZOOM);
  });
  it('fits bounds and ignores an empty board', () => {
    const c = new Camera();
    c.fit(null, 800, 600);
    expect(c.toView()).toEqual({ x: 0, y: 0, zoom: 1 });
    c.fit({ x: 0, y: 0, w: 100, h: 100 }, 800, 600, 50);
    expect(c.zoom).toBe(5);
    const [cx, cy] = c.worldToScreen(50, 50);
    expect(cx).toBeCloseTo(400); expect(cy).toBeCloseTo(300);
  });
});

describe('commands and history', () => {
  const setup = () => {
    const doc = new EditorDoc({ board: { id: 'b', background: { color: { r: 255, g: 255, b: 255, a: 1 } }, objects: [stroke('a'), stroke('b', 20)] }, source: { kind: 'new' } });
    let changes = 0;
    const h = new History(() => doc, () => changes++);
    return { doc, h, changes: () => changes };
  };
  it('adds, undoes, redoes, and marks dirty', () => {
    const { doc, h, changes } = setup();
    h.execute(new AddObject(stroke('c', 40)));
    expect(doc.board.objects.map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(doc.dirty).toBe(true);
    expect(doc.index.query({ x: 45, y: 0, w: 1, h: 1 }).has('c')).toBe(true);
    h.undo(); expect(doc.board.objects.map((o) => o.id)).toEqual(['a', 'b']);
    h.redo(); expect(doc.board.objects.map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(changes()).toBe(3);
  });
  it('removes top-level objects and restores their index on undo', () => {
    const { doc, h } = setup();
    h.execute(new RemoveItems([{ groupId: null, id: 'a' }]));
    expect(doc.board.objects.map((o) => o.id)).toEqual(['b']);
    h.undo();
    expect(doc.board.objects.map((o) => o.id)).toEqual(['a', 'b']);
  });
  it('removes a group when its last child is erased, and undo restores both', () => {
    const { doc, h } = setup();
    const g: Group = { kind: 'group', id: 'g', transform: [1, 0, 0, 1, 0, 0], children: [stroke('c1')] };
    doc.board.objects.splice(1, 0, g);
    h.execute(new RemoveItems([{ groupId: 'g', id: 'c1' }]));
    expect(doc.board.objects.map((o) => o.id)).toEqual(['a', 'b']);
    h.undo();
    expect(doc.board.objects.map((o) => o.id)).toEqual(['a', 'g', 'b']);
    expect((doc.board.objects[1] as Group).children.map((c) => c.id)).toEqual(['c1']);
  });
  it('moves objects without marking strokes edited, and undoes exactly', () => {
    const { doc, h } = setup();
    h.execute(new MoveItems(['a'], 5.5, -2));
    const a = doc.board.objects[0] as Stroke;
    expect(a.points).toEqual([5.5, -2, 15.5, -2]);
    expect(a.sourceOutline).toBe('M5.5,-2L15.5,-2');
    expect(a.editedAt).toBeUndefined();
    h.undo();
    expect((doc.board.objects[0] as Stroke).points).toEqual([0, 0, 10, 0]);
  });
  it('clears redo after a new command and caps history length', () => {
    const { doc, h } = setup();
    h.execute(new AddObject(stroke('x')));
    h.undo();
    h.execute(new AddObject(stroke('y')));
    expect(h.canRedo).toBe(false);
    const small = new History(() => doc, () => {}, 2);
    for (const id of ['p', 'q', 'r']) small.execute(new AddObject(stroke(id)));
    expect(small.undo() && small.undo()).toBe(true);
    expect(small.undo()).toBe(false);
  });
});
