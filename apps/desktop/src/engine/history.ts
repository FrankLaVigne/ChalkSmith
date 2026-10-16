import type { Command } from './commands';
import type { EditorDoc } from './document';

export class History {
  private done: Command[] = [];
  private undone: Command[] = [];

  constructor(
    private readonly getDoc: () => EditorDoc,
    private readonly onChange: () => void,
    private readonly limit = 500,
  ) {}

  get canUndo(): boolean { return this.done.length > 0; }
  get canRedo(): boolean { return this.undone.length > 0; }

  execute(c: Command): void {
    c.apply(this.getDoc());
    this.done.push(c);
    if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
    this.changed();
  }

  undo(): boolean {
    const c = this.done.pop();
    if (!c) return false;
    c.revert(this.getDoc());
    this.undone.push(c);
    this.changed();
    return true;
  }

  redo(): boolean {
    const c = this.undone.pop();
    if (!c) return false;
    c.apply(this.getDoc());
    this.done.push(c);
    this.changed();
    return true;
  }

  clear(): void {
    this.done = [];
    this.undone = [];
  }

  private changed(): void {
    const d = this.getDoc();
    d.dirty = true;
    d.reindex();
    this.onChange();
  }
}
