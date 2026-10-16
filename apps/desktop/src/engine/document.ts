import { GridIndex, WHITE, objectBounds, randomId, type Board } from '@chalksmith/core';

export type DocSource =
  | { kind: 'chalk'; path: string }
  | { kind: 'whiteboard-zip'; path: string }
  | { kind: 'new' };

export interface DocInit {
  board: Board;
  assets?: Map<string, Uint8Array>;
  extensions?: Map<string, Uint8Array>;
  createdAt?: string;
  source: DocSource;
}

export class EditorDoc {
  board: Board;
  assets: Map<string, Uint8Array>;
  extensions: Map<string, Uint8Array>;
  createdAt?: string;
  source: DocSource;
  dirty = false;
  readonly index = new GridIndex(256);

  constructor(init: DocInit) {
    this.board = init.board;
    this.assets = init.assets ?? new Map();
    this.extensions = init.extensions ?? new Map();
    this.createdAt = init.createdAt;
    this.source = init.source;
    this.reindex();
  }

  static empty(): EditorDoc {
    return new EditorDoc({ board: { id: randomId(), background: { color: { ...WHITE } }, objects: [] }, source: { kind: 'new' } });
  }

  reindex(): void {
    this.index.clear();
    for (const o of this.board.objects) {
      const b = objectBounds(o);
      if (b) this.index.insert(o.id, b);
    }
  }
}
