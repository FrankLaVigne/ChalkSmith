import { invoke } from '@tauri-apps/api/core';
import { ask, message, open, save } from '@tauri-apps/plugin-dialog';

export interface Platform {
  pickOpen(): Promise<string | null>;
  pickSave(defaultPath: string, kind: 'chalk' | 'svg'): Promise<string | null>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  error(title: string, text: string): Promise<void>;
  confirm(title: string, text: string): Promise<boolean>;
}

export const tauriPlatform: Platform = {
  async pickOpen() {
    const p = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Boards and Whiteboard exports', extensions: ['chalk', 'zip'] }],
    });
    return typeof p === 'string' ? p : null;
  },
  async pickSave(defaultPath, kind) {
    return save({
      defaultPath,
      filters: kind === 'chalk'
        ? [{ name: 'ChalkSmith board', extensions: ['chalk'] }]
        : [{ name: 'SVG image', extensions: ['svg'] }],
    });
  },
  async readFile(path) {
    const buf = await invoke<ArrayBuffer>('read_file', { path });
    return new Uint8Array(buf);
  },
  async writeFile(path, bytes) {
    await invoke('write_atomic', bytes, { headers: { 'x-path': encodeURIComponent(path) } });
  },
  async error(title, text) {
    await message(text, { title, kind: 'error' });
  },
  async confirm(title, text) {
    return ask(text, { title, kind: 'warning' });
  },
};
