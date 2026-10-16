import { translateObject, type BoardObject, type Group, type ItemRef } from '@chalksmith/core';
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

type Removal =
  | { kind: 'remove'; index: number; obj: BoardObject }
  | { kind: 'replace'; id: string; before: Group };

/**
 * Removes top-level objects or group children. A group left empty is removed too.
 * Groups are never mutated: a group losing a child is replaced by a new group object
 * (objects are immutable, so cached bounds stay valid), and undo restores the original.
 */
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
        const children = g.children.filter((_, k) => k !== ci);
        if (children.length === 0) {
          objs.splice(gi, 1);
          this.log.push({ kind: 'remove', index: gi, obj: g });
        } else {
          objs[gi] = { ...g, children };
          this.log.push({ kind: 'replace', id: g.id, before: g });
        }
      } else {
        const i = objs.findIndex((o) => o.id === ref.id);
        if (i < 0) continue;
        const [o] = objs.splice(i, 1);
        this.log.push({ kind: 'remove', index: i, obj: o });
      }
    }
  }

  revert(doc: EditorDoc): void {
    const objs = doc.board.objects;
    for (const e of [...this.log].reverse()) {
      if (e.kind === 'replace') {
        const i = objs.findIndex((o) => o.id === e.id);
        if (i >= 0) objs[i] = e.before;
      } else {
        objs.splice(e.index, 0, e.obj);
      }
    }
  }
}

export class MoveItems implements Command {
  private originals = new Map<string, BoardObject>();
  constructor(private readonly ids: string[], private readonly dx: number, private readonly dy: number) {}
  apply(doc: EditorDoc): void {
    const set = new Set(this.ids);
    this.originals = new Map();
    doc.board.objects = doc.board.objects.map((o) => {
      if (!set.has(o.id)) return o;
      this.originals.set(o.id, o);
      return translateObject(o, this.dx, this.dy);
    });
  }
  /** Restores the exact original objects; no inverse arithmetic. */
  revert(doc: EditorDoc): void {
    doc.board.objects = doc.board.objects.map((o) => this.originals.get(o.id) ?? o);
  }
}
