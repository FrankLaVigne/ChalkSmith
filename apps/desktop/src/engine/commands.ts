import { translateObject, type BoardObject, type ItemRef, type Stroke } from '@chalksmith/core';
import type { EditorDoc } from './document';

export interface Command {
  apply(doc: EditorDoc): void;
  revert(doc: EditorDoc): void;
}

export class AddObject implements Command {
  constructor(private readonly obj: BoardObject) {}
  apply(doc: EditorDoc): void { doc.board.objects.push(this.obj); }
  revert(doc: EditorDoc): void {
    const i = doc.board.objects.findIndex((o) => o.id === this.obj.id);
    if (i >= 0) doc.board.objects.splice(i, 1);
  }
}

type Removal = { groupId: string | null; index: number; obj: BoardObject };

/** Removes top-level objects or group children. A group left empty is removed too. */
export class RemoveItems implements Command {
  private log: Removal[] = [];
  constructor(private readonly refs: ItemRef[]) {}

  apply(doc: EditorDoc): void {
    this.log = [];
    const objs = doc.board.objects;
    for (const ref of this.refs) {
      if (ref.groupId) {
        const gi = objs.findIndex((o) => o.id === ref.groupId);
        const g = objs[gi];
        if (!g || g.kind !== 'group') continue;
        const ci = g.children.findIndex((c) => c.id === ref.id);
        if (ci < 0) continue;
        const [child] = g.children.splice(ci, 1);
        this.log.push({ groupId: g.id, index: ci, obj: child });
        if (g.children.length === 0) {
          objs.splice(gi, 1);
          this.log.push({ groupId: null, index: gi, obj: g });
        }
      } else {
        const i = objs.findIndex((o) => o.id === ref.id);
        if (i < 0) continue;
        const [o] = objs.splice(i, 1);
        this.log.push({ groupId: null, index: i, obj: o });
      }
    }
  }

  revert(doc: EditorDoc): void {
    const objs = doc.board.objects;
    for (const e of [...this.log].reverse()) {
      if (e.groupId) {
        const g = objs.find((o) => o.id === e.groupId);
        if (g && g.kind === 'group') g.children.splice(e.index, 0, e.obj as Stroke);
      } else {
        objs.splice(e.index, 0, e.obj);
      }
    }
  }
}

export class MoveItems implements Command {
  constructor(private readonly ids: string[], private readonly dx: number, private readonly dy: number) {}
  apply(doc: EditorDoc): void { this.shift(doc, this.dx, this.dy); }
  revert(doc: EditorDoc): void { this.shift(doc, -this.dx, -this.dy); }
  private shift(doc: EditorDoc, dx: number, dy: number): void {
    const set = new Set(this.ids);
    doc.board.objects = doc.board.objects.map((o) => (set.has(o.id) ? translateObject(o, dx, dy) : o));
  }
}
