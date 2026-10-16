# ChalkSmith First Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cross-platform desktop app that rescues Microsoft Whiteboard Full Export ZIPs into editable `.chalk` boards, with pen, highlighter, eraser, select, undo/redo, save, and SVG export.

**Architecture:** An npm-workspace monorepo. `packages/core` is pure TypeScript with no DOM: data model, `.chalk` read/write, Whiteboard importer, geometry, hit-testing, SVG export. `apps/desktop` is a Tauri 2 app. Its framework-free `engine/` (camera, commands, tools, Canvas 2D renderer, input) is driven by a thin Svelte 5 UI, and a two-command Rust shell handles file I/O.

**Tech Stack:** Node ≥ 20, npm workspaces, TypeScript 5, vitest, fflate, parse5 v7, ajv v8, perfect-freehand v1, tsx, Svelte 5, Vite, Tauri 2 (+ dialog plugin), Rust stable.

**Spec:** `docs/superpowers/specs/2026-10-16-chalksmith-first-build-design.md` (read it before starting; this plan implements it).

## Global Constraints

- Licence: Apache-2.0. Original code only. No Microsoft code, CSS, textures, icons, fonts or branding anywhere in the repo.
- Never commit `original/`, `private/`, real exports, or anything derived from them. Public tests use only synthetic fixtures built by `packages/core/fixtures/build.ts`.
- The importer never modifies its input, never fetches any URL, never runs scripts, and discards the export's `<style>`.
- `packages/core` must not import DOM, Tauri, Svelte, or Node built-ins in `src/` (tests may use `node:` modules).
- Only `apps/desktop/src-tauri` and `apps/desktop/src/platform.ts` touch the file system.
- Numbers written to `.chalk` have at most 4 decimal places (`round4`).
- Import limits: ≤ 64 ZIP entries, ≤ 256 MB total uncompressed, ≤ 128 MB per entry.
- Zoom range 0.05–20×. History limit 500 steps. Grid index cell 256 px.
- Pen width presets 2, 4, 8, 16 px; 8 pen colours. Highlighter widths 12, 24 px; 4 colours at α 0.4.
- Every third-party dependency must have a permissive licence (MIT/ISC/BSD/Apache-2.0). Check with `npm view <pkg> license` before adding.
- Commit after every task. Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CLhdFaFNPi8qegxuEftkDa
  ```

## Review Focus

1. **The rescued ZIP is never overwritten.** "Save" on a rescued board must behave as "Save As" (default `<zip-name>.chalk` in the same folder), and choosing the ZIP's own path must be refused. → tests in Task 14.
2. **Degenerate strokes** (one point, repeated identical points) must not produce `NaN` anywhere: in the imported board, generated outlines, or SVG. → tests in Tasks 3 and 8.
3. **An empty board** (zero objects) must export valid SVG and must not break "Fit". → tests in Tasks 9 and 11.
4. **Erasing the last stroke of a group** removes the group; undo must restore both the group and the stroke at their original positions. → test in Task 11.
5. **Content of unknown objects** (e.g. sticky-note text) must not be copied into the board. Unusual characters in type names must not break the SVG. → tests in Tasks 8 and 9.

---

## File Structure

```
package.json                        root: workspaces, scripts
vitest.config.ts                    root test config
.gitignore                          (modify) add node_modules, build outputs, fixture output
packages/core/
  package.json  tsconfig.json
  src/index.ts                      public API (re-exports)
  src/errors.ts                     ChalkError + codes
  src/model/types.ts                Board/Stroke/Group/ImageObj/Unsupported, ids
  src/model/color.ts                CSS colour parse/format
  src/util/round.ts                 round4
  src/util/sha256.ts                sync SHA-256
  src/util/base64.ts                base64 encode/decode
  src/util/image.ts                 sniff image type + intrinsic size
  src/geometry/path.ts              SVG path parse/format/map/flatten
  src/geometry/bounds.ts            bboxes, affine helpers, object bounds
  src/geometry/width.ts             pen/highlighter width recovery
  src/geometry/outline.ts           outline for rendering (source or generated)
  src/geometry/translate.ts         move strokes/objects
  src/geometry/hittest.ts           distance, GridIndex, hitTest, strokesUnderPath
  src/textures.ts                   original procedural texture data
  src/format/schema.ts              JSON Schema for board.json
  src/format/validate.ts            ajv validation + extra checks
  src/format/chalk.ts               readChalk / writeChalk
  src/import/whiteboard/unzip.ts    ZIP read with limits
  src/import/whiteboard/dom.ts      parse5 helpers
  src/import/whiteboard/css.ts      style/transform parsing
  src/import/whiteboard/context.ts  import context + report helpers
  src/import/whiteboard/ink.ts      InkGroup → Group/Stroke
  src/import/whiteboard/image.ts    AzureImage → ImageObj
  src/import/whiteboard/unsupported.ts
  src/import/whiteboard/index.ts    rescueWhiteboardZip
  src/export/svg.ts                 boardToSvg
  fixtures/build.ts                 synthetic export builder (HTML, ZIP, PNG, outlines)
  fixtures/catalog.ts               named synthetic fixtures
  fixtures/generate.ts              writes catalog ZIPs to fixtures/out/
  test/*.test.ts  test/golden/*
docs/spec/chalk-format.md           published format + schema
apps/desktop/
  package.json tsconfig.json vite.config.ts svelte.config.js index.html app-icon.png
  scripts/make-icon.ts
  src/main.ts src/app.css src/platform.ts
  src/engine/camera.ts document.ts commands.ts history.ts tools.ts editor.ts
  src/engine/textures.ts renderer.ts input.ts
  src/engine/*.test.ts
  src/ui/actions.ts actions.test.ts menu.ts App.svelte Toolbar.svelte RescueReport.svelte
  src-tauri/Cargo.toml build.rs tauri.conf.json capabilities/default.json src/main.rs src/lib.rs icons/*
.github/workflows/ci.yml
private/acceptance.ts               (local only, git-ignored)
```

---

### Task 1: Workspace, core package, and basic utilities

**Files:**
- Create: `package.json`, `vitest.config.ts`, `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/core/src/errors.ts`, `src/model/types.ts`, `src/model/color.ts`, `src/util/round.ts`, `src/util/sha256.ts`, `src/util/base64.ts`, `src/util/image.ts`, `src/index.ts`
- Modify: `.gitignore`
- Test: `packages/core/test/util.test.ts`

**Interfaces:**
- Produces: `round4(n): number`; `parseCssColor(s): RGBA | null`; `rgbaToCss(c): string`; `WHITE`; `ChalkError(code, message)` with `code: ChalkErrorCode`; `sha256Hex(bytes): string`; `base64ToBytes(s)`, `bytesToBase64(b)`; `sniffImage(b): ImageKind | null`; `imageSize(b, kind): {w,h} | null`; `mimeForAsset(path): string`; all model types; `randomId`, `seqIds(prefix?)`.

- [ ] **Step 1: Create the root workspace files**

`package.json`:
```json
{
  "name": "chalksmith",
  "private": true,
  "license": "Apache-2.0",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p packages/core/tsconfig.json",
    "fixtures": "tsx packages/core/fixtures/generate.ts"
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    environment: 'node',
  },
});
```

Append to `.gitignore`:
```
node_modules/
dist/
apps/desktop/src-tauri/target/
apps/desktop/src-tauri/gen/
packages/core/fixtures/out/
```

`packages/core/package.json`:
```json
{
  "name": "@chalksmith/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "license": "Apache-2.0",
  "exports": { ".": "./src/index.ts" }
}
```

`packages/core/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noUncheckedIndexedAccess": false
  },
  "include": ["src", "test", "fixtures"]
}
```

- [ ] **Step 2: Install dev tooling and core dependencies**

Check licences first (each must print MIT, ISC, BSD-* or Apache-2.0):
```bash
for p in vitest typescript tsx @types/node fflate parse5@7 ajv@8 perfect-freehand; do echo "$p: $(npm view $p license)"; done
```
Then:
```bash
npm install -D vitest typescript tsx @types/node
npm install -w @chalksmith/core fflate parse5@7 ajv@8 perfect-freehand
```
Expected: `package-lock.json` created; `node_modules/@chalksmith/core` is a symlink to `packages/core`.

- [ ] **Step 3: Write the failing tests**

`packages/core/test/util.test.ts`:
```ts
import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  round4, parseCssColor, rgbaToCss, sha256Hex, base64ToBytes, bytesToBase64,
  sniffImage, imageSize, mimeForAsset, ChalkError, seqIds,
} from '../src/index';

describe('round4', () => {
  it('rounds to 4 decimals and never returns -0', () => {
    expect(round4(0.4000000059604645)).toBe(0.4);
    expect(round4(1.23456)).toBe(1.2346);
    expect(Object.is(round4(-0.00001), 0)).toBe(true);
  });
});

describe('colours', () => {
  it('parses rgba, rgb and hex', () => {
    expect(parseCssColor('rgba(31,31,31,1)')).toEqual({ r: 31, g: 31, b: 31, a: 1 });
    expect(parseCssColor('rgba(253, 132, 45, 0.4000000059604645)')).toEqual({ r: 253, g: 132, b: 45, a: 0.4 });
    expect(parseCssColor('rgb(300, 0, 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseCssColor('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor('#abc')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
  });
  it('rejects non-colours', () => {
    expect(parseCssColor('url(#-0)')).toBeNull();
    expect(parseCssColor('')).toBeNull();
  });
  it('formats rgba', () => {
    expect(rgbaToCss({ r: 1, g: 2, b: 3, a: 0.4 })).toBe('rgba(1,2,3,0.4)');
  });
});

describe('sha256', () => {
  it('matches known vectors', () => {
    expect(sha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('matches node:crypto across block boundaries', () => {
    for (const n of [1, 55, 56, 63, 64, 65, 1000, 100_000]) {
      const b = new Uint8Array(randomBytes(n));
      expect(sha256Hex(b)).toBe(createHash('sha256').update(b).digest('hex'));
    }
  });
});

describe('base64', () => {
  it('round-trips and matches Buffer', () => {
    const b = new Uint8Array(randomBytes(100_003));
    const s = bytesToBase64(b);
    expect(s).toBe(Buffer.from(b).toString('base64'));
    expect(base64ToBytes(s)).toEqual(b);
  });
});

function pngHeader(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
}

describe('images', () => {
  it('sniffs and sizes PNG', () => {
    const b = pngHeader(1706, 1006);
    const k = sniffImage(b)!;
    expect(k).toEqual({ mime: 'image/png', ext: 'png' });
    expect(imageSize(b, k)).toEqual({ w: 1706, h: 1006 });
  });
  it('sniffs and sizes JPEG via SOF0', () => {
    const b = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x40, 0x03, 0, 0, 0, 0, 0, 0,
    ]);
    const k = sniffImage(b)!;
    expect(k.ext).toBe('jpg');
    expect(imageSize(b, k)).toEqual({ w: 64, h: 32 });
  });
  it('sniffs and sizes GIF', () => {
    const b = new Uint8Array([71, 73, 70, 56, 57, 97, 10, 0, 20, 0, 0, 0]);
    const k = sniffImage(b)!;
    expect(k.ext).toBe('gif');
    expect(imageSize(b, k)).toEqual({ w: 10, h: 20 });
  });
  it('sniffs and sizes WebP VP8X', () => {
    const b = new Uint8Array(30);
    b.set([82, 73, 70, 70], 0); b.set([87, 69, 66, 80], 8); b.set([86, 80, 56, 88], 12);
    b.set([99, 0, 0], 24); b.set([49, 0, 0], 27); // w-1 = 99, h-1 = 49
    const k = sniffImage(b)!;
    expect(k.ext).toBe('webp');
    expect(imageSize(b, k)).toEqual({ w: 100, h: 50 });
  });
  it('rejects unknown bytes and maps asset paths to MIME types', () => {
    expect(sniffImage(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(mimeForAsset('assets/ab.jpg')).toBe('image/jpeg');
    expect(mimeForAsset('assets/ab.png')).toBe('image/png');
  });
});

describe('errors and ids', () => {
  it('carries a code', () => {
    const e = new ChalkError('NotAZip', 'nope');
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('NotAZip');
    expect(e.message).toBe('nope');
  });
  it('generates sequential ids', () => {
    const g = seqIds();
    expect([g(), g()]).toEqual(['id-1', 'id-2']);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/util.test.ts`
Expected: FAIL — cannot resolve `../src/index`.

- [ ] **Step 5: Implement**

`packages/core/src/util/round.ts`:
```ts
/** Round to 4 decimal places; never returns -0. */
export function round4(n: number): number {
  const r = Math.round(n * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
}
```

`packages/core/src/errors.ts`:
```ts
export type ChalkErrorCode =
  | 'NotAZip'
  | 'NoBoardHtml'
  | 'TooLarge'
  | 'BadChalk'
  | 'UnsupportedVersion'
  | 'SchemaInvalid';

export class ChalkError extends Error {
  readonly code: ChalkErrorCode;
  constructor(code: ChalkErrorCode, message: string) {
    super(message);
    this.name = 'ChalkError';
    this.code = code;
  }
}
```

`packages/core/src/model/types.ts`:
```ts
export type RGBA = { r: number; g: number; b: number; a: number };
/** CSS-style affine matrix [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Affine = [number, number, number, number, number, number];
export interface Bbox { x: number; y: number; w: number; h: number }
export interface Source { system: 'ms-whiteboard'; id: string }
export type TextureName = 'galaxy' | 'rainbow';
export type Brush =
  | { kind: 'solid' }
  | { kind: 'texture'; name: TextureName; origin: [number, number]; scale: number };

interface Base {
  id: string;
  source?: Source;
  ext?: Record<string, unknown>;
}

export interface Stroke extends Base {
  kind: 'stroke';
  tool: 'pen' | 'highlighter';
  color: RGBA;
  /** Nominal width, px. */
  width: number;
  /** Flat [x0, y0, x1, y1, …] in px, in the parent's space. */
  points: number[];
  /** Per-point width in px, one per point. */
  widths?: number[];
  brush: Brush;
  /** SVG path data in px (parent space). Used for rendering while editedAt is absent. */
  sourceOutline?: string;
  editedAt?: string;
}

export interface Group extends Base {
  kind: 'group';
  transform: Affine;
  children: Stroke[];
}

export interface ImageObj extends Base {
  kind: 'image';
  /** "assets/<sha256>.<ext>" */
  asset: string;
  x: number;
  y: number;
  w: number;
  h: number;
  intrinsic: { w: number; h: number };
}

export interface Unsupported extends Base {
  kind: 'unsupported';
  sourceType: string;
  bbox: Bbox | null;
}

export type BoardObject = Group | Stroke | ImageObj | Unsupported;

/** x, y: world coordinates shown at the viewport's top-left corner. */
export interface View { x: number; y: number; zoom: number }

export interface Board {
  id: string;
  background: { color: RGBA };
  view?: View;
  /** Paint order: first is bottom. */
  objects: BoardObject[];
  ext?: Record<string, unknown>;
}

export interface Manifest {
  format: 'chalk';
  version: number;
  createdBy: string;
  createdAt: string;
  modifiedAt: string;
}

export type IdGen = () => string;
export const randomId: IdGen = () => crypto.randomUUID();
/** Deterministic ids for tests: "id-1", "id-2", … */
export function seqIds(prefix = 'id'): IdGen {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
```

`packages/core/src/model/color.ts`:
```ts
import { round4 } from '../util/round';
import type { RGBA } from './types';

export const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };

const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)));

export function parseCssColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase();
  let m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) {
    const r = clamp255(Number(m[1]));
    const g = clamp255(Number(m[2]));
    const b = clamp255(Number(m[3]));
    const a = m[4] === undefined ? 1 : round4(Math.min(1, Math.max(0, Number(m[4]))));
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return { r, g, b, a };
  }
  m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  return null;
}

export function rgbaToCss(c: RGBA): string {
  return `rgba(${c.r},${c.g},${c.b},${c.a})`;
}
```

`packages/core/src/util/sha256.ts`:
```ts
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** Synchronous SHA-256, hex-encoded. */
export function sha256Hex(data: Uint8Array): string {
  const len = data.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  const bits = len * 8;
  dv.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(padded.length - 4, bits >>> 0);

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const W = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const w15 = W[i - 15];
      const w2 = W[i - 2];
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
}
```

`packages/core/src/util/base64.ts`:
```ts
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}
```

`packages/core/src/util/image.ts`:
```ts
export type ImageKind =
  | { mime: 'image/png'; ext: 'png' }
  | { mime: 'image/jpeg'; ext: 'jpg' }
  | { mime: 'image/gif'; ext: 'gif' }
  | { mime: 'image/webp'; ext: 'webp' };

const ascii = (b: Uint8Array, at: number, s: string) =>
  s.split('').every((c, i) => b[at + i] === c.charCodeAt(0));

export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 'PNG')) return { mime: 'image/png', ext: 'png' };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 6 && ascii(b, 0, 'GIF8')) return { mime: 'image/gif', ext: 'gif' };
  if (b.length >= 12 && ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export function imageSize(b: Uint8Array, kind: ImageKind): { w: number; h: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  switch (kind.ext) {
    case 'png':
      return b.length >= 24 ? { w: dv.getUint32(16), h: dv.getUint32(20) } : null;
    case 'gif':
      return b.length >= 10 ? { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) } : null;
    case 'jpg': {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m === 0xff) { i++; continue; }
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        const len = (b[i + 2] << 8) | b[i + 3];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
        }
        i += 2 + len;
      }
      return null;
    }
    case 'webp': {
      if (b.length < 30) return null;
      if (ascii(b, 12, 'VP8X')) {
        return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
      }
      if (ascii(b, 12, 'VP8 ')) {
        return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
      }
      if (ascii(b, 12, 'VP8L')) {
        return {
          w: 1 + (((b[22] & 0x3f) << 8) | b[21]),
          h: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
        };
      }
      return null;
    }
  }
}

export function mimeForAsset(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return ({ png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' } as Record<string, string>)[ext]
    ?? 'application/octet-stream';
}
```

`packages/core/src/index.ts`:
```ts
export * from './errors';
export * from './model/types';
export * from './model/color';
export * from './util/round';
export * from './util/sha256';
export * from './util/base64';
export * from './util/image';
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run packages/core/test/util.test.ts && npm run typecheck`
Expected: all tests PASS; `tsc` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts .gitignore packages/core
git commit -m "feat(core): workspace, model types and basic utilities"
```
(Use the commit trailer from Global Constraints on every commit.)

---

### Task 2: SVG path parsing, bounds, and width recovery

**Files:**
- Create: `packages/core/src/geometry/path.ts`, `src/geometry/bounds.ts`, `src/geometry/width.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/geometry.test.ts`

**Interfaces:**
- Consumes: `round4`, model types.
- Produces:
  - `type Seg = {c:'M',x,y} | {c:'L',x,y} | {c:'A',rx,ry,rot,large:0|1,sweep:0|1,x,y} | {c:'Z'}`
  - `parsePath(d): Seg[]` (absolute M/L/A/Z only; throws otherwise), `formatPath(segs): string`, `mapPath(segs, k, dx, dy): Seg[]` (scale then translate)
  - `flattenArc(x1,y1,r,large,sweep,x2,y2,steps): [number,number][]` (interior samples), `pathPolygons(segs, arcSteps=8): number[][]`
  - `pointsBbox(points): Bbox|null`, `polysBbox(polys): Bbox|null`, `unionBbox(a,b)`, `inflate(b,d)`, `intersects(a,b)`, `applyAffine(m,x,y)`, `invertAffine(m): Affine|null`, `strokeBounds(s)`, `objectBounds(o)`, `boardBounds(objects)`
  - `maxArcRadius(segs)`, `penWidth(segs, points)`, `highlighterWidth(segs, points)`, `perPointWidths(points, segs, nominal): number[]`

- [ ] **Step 1: Write the failing tests**

`packages/core/test/geometry.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  parsePath, formatPath, mapPath, flattenArc, pathPolygons,
  pointsBbox, applyAffine, invertAffine, objectBounds, strokeBounds, boardBounds,
  maxArcRadius, penWidth, highlighterWidth, perPointWidths,
  type Affine, type Stroke, type Group,
} from '../src/index';

describe('parsePath', () => {
  it('parses observed Whiteboard syntax', () => {
    const s = parsePath('M1561,134L1498,226A149,149 0 0 0 1475,279L1416,555');
    expect(s).toEqual([
      { c: 'M', x: 1561, y: 134 },
      { c: 'L', x: 1498, y: 226 },
      { c: 'A', rx: 149, ry: 149, rot: 0, large: 0, sweep: 0, x: 1475, y: 279 },
      { c: 'L', x: 1416, y: 555 },
    ]);
  });
  it('treats extra pairs after M as L and parses Z', () => {
    expect(parsePath('M0,0 10,0 10,10Z').map((s) => s.c)).toEqual(['M', 'L', 'L', 'Z']);
  });
  it('rejects relative and unsupported commands', () => {
    expect(() => parsePath('m0,0l1,1')).toThrow();
    expect(() => parsePath('M0,0C1,1 2,2 3,3')).toThrow();
  });
  it('maps and formats', () => {
    const s = mapPath(parsePath('M128,256L-128,0A128,128 0 0 1 256,256'), 1 / 128, 0, 0);
    expect(formatPath(s)).toBe('M1,2L-1,0A1,1 0 0 1 2,2');
    expect(formatPath(mapPath(parsePath('M0,0L1,1Z'), 1, 10, 20))).toBe('M10,20L11,21Z');
  });
});

describe('flattenArc', () => {
  const dist = ([x, y]: [number, number], cx: number, cy: number) => Math.hypot(x - cx, y - cy);
  it('samples a semicircle on the side chosen by sweep', () => {
    const up = flattenArc(-1, 0, 1, 0, 1, 1, 0, 8);
    const down = flattenArc(-1, 0, 1, 0, 0, 1, 0, 8);
    expect(up).toHaveLength(7);
    for (const p of [...up, ...down]) expect(dist(p, 0, 0)).toBeCloseTo(1, 6);
    expect(up[3][1]).toBeCloseTo(-1, 6);
    expect(down[3][1]).toBeCloseTo(1, 6);
  });
  it('samples a quarter circle around the right centre', () => {
    const q = flattenArc(1, 0, 1, 0, 1, 0, 1, 2);
    expect(q).toHaveLength(1);
    expect(q[0][0]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(q[0][1]).toBeCloseTo(Math.SQRT1_2, 6);
  });
  it('returns nothing for zero-length arcs', () => {
    expect(flattenArc(5, 5, 3, 0, 0, 5, 5, 8)).toEqual([]);
  });
});

describe('pathPolygons', () => {
  it('splits subpaths', () => {
    const p = pathPolygons(parsePath('M0,0L10,0L10,10ZM20,20L30,20'));
    expect(p).toEqual([[0, 0, 10, 0, 10, 10], [20, 20, 30, 20]]);
  });
});

describe('bounds and affine', () => {
  it('computes point bboxes', () => {
    expect(pointsBbox([0, 0, 10, 5, -2, 3])).toEqual({ x: -2, y: 0, w: 12, h: 5 });
    expect(pointsBbox([])).toBeNull();
  });
  it('inverts affines', () => {
    const m: Affine = [2, 0, 0, 2, 10, 20];
    const inv = invertAffine(m)!;
    const [x, y] = applyAffine(m, 3, 4);
    const [bx, by] = applyAffine(inv, x, y);
    expect(bx).toBeCloseTo(3);
    expect(by).toBeCloseTo(4);
    expect(invertAffine([0, 0, 0, 0, 0, 0])).toBeNull();
  });
  const stroke: Stroke = {
    kind: 'stroke', id: 's', tool: 'pen', color: { r: 0, g: 0, b: 0, a: 1 }, width: 4,
    points: [0, 0, 10, 0], brush: { kind: 'solid' },
  };
  it('uses the outline when present and unedited', () => {
    expect(strokeBounds({ ...stroke, sourceOutline: 'M-1,-3L11,-3L11,3L-1,3Z' })).toEqual({ x: -1, y: -3, w: 12, h: 6 });
    expect(strokeBounds({ ...stroke, sourceOutline: 'M-1,-3L11,-3Z', editedAt: 'x' })).toEqual({ x: -2, y: -2, w: 14, h: 4 });
  });
  it('transforms group bounds', () => {
    const g: Group = { kind: 'group', id: 'g', transform: [1, 0, 0, 1, 100, 50], children: [stroke] };
    expect(objectBounds(g)).toEqual({ x: 98, y: 48, w: 14, h: 4 });
    expect(boardBounds([])).toBeNull();
  });
});

// A straight pen stroke along y=0: points (0,0) (10,0) (20,0), half-width 2,
// with zero-length arcs carrying the radius (as Whiteboard emits at joins).
const PEN = 'M0,2L10,2A2,2 0 0 0 10,2L20,2A2,2 0 0 0 20,2L20,-2L10,-2L0,-2';
const PEN_POINTS = [0, 0, 10, 0, 20, 0];

describe('width recovery', () => {
  it('reads nominal pen width from the largest arc radius', () => {
    expect(maxArcRadius(parsePath(PEN))).toBe(2);
    expect(penWidth(parsePath(PEN), PEN_POINTS)).toBe(4);
  });
  it('recovers per-point widths and clamps the end caps', () => {
    expect(perPointWidths(PEN_POINTS, parsePath(PEN), 4)).toEqual([0.4, 4, 0.4]);
  });
  it('uses the long side of the highlighter tip rectangle', () => {
    const d = 'M-2,-4L2,-4L2,4L-2,4L-2,-4M0,-4L20,-4L20,4L0,4';
    expect(highlighterWidth(parsePath(d), [0, 0, 20, 0])).toBe(8);
  });
  it('falls back to outline distance when there is no separate tip', () => {
    const d = 'M0,-4L20,-4L20,4L0,4';
    expect(highlighterWidth(parsePath(d), [0, 0, 10, 0, 20, 0])).toBe(8);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/geometry.test.ts`
Expected: FAIL — `parsePath` is not exported.

- [ ] **Step 3: Implement `path.ts`**

```ts
import { round4 } from '../util/round';

export type Seg =
  | { c: 'M'; x: number; y: number }
  | { c: 'L'; x: number; y: number }
  | { c: 'A'; rx: number; ry: number; rot: number; large: 0 | 1; sweep: 0 | 1; x: number; y: number }
  | { c: 'Z' };

const TOKEN = /[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/** Parse absolute M/L/A/Z path data (the subset Whiteboard emits). */
export function parsePath(d: string): Seg[] {
  const tokens = d.match(TOKEN) ?? [];
  const segs: Seg[] = [];
  let i = 0;
  let cmd: string | null = null;
  const num = (): number => {
    const t = tokens[i++];
    const v = Number(t);
    if (t === undefined || /^[A-Za-z]$/.test(t) || Number.isNaN(v)) throw new Error(`bad number in path near token ${i}`);
    return v;
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) {
      i++;
      if (t === 'Z' || t === 'z') { segs.push({ c: 'Z' }); cmd = null; continue; }
      if (t !== 'M' && t !== 'L' && t !== 'A') throw new Error(`unsupported path command "${t}"`);
      cmd = t;
      continue;
    }
    if (cmd === 'M') { segs.push({ c: 'M', x: num(), y: num() }); cmd = 'L'; }
    else if (cmd === 'L') segs.push({ c: 'L', x: num(), y: num() });
    else if (cmd === 'A') {
      const rx = num(), ry = num(), rot = num();
      const large = num() ? 1 : 0, sweep = num() ? 1 : 0;
      segs.push({ c: 'A', rx, ry, rot, large, sweep, x: num(), y: num() });
    } else throw new Error('path data must start with a command');
  }
  return segs;
}

const f = (n: number) => String(round4(n));

export function formatPath(segs: Seg[]): string {
  return segs
    .map((s) => {
      if (s.c === 'Z') return 'Z';
      if (s.c === 'A') return `A${f(s.rx)},${f(s.ry)} ${f(s.rot)} ${s.large} ${s.sweep} ${f(s.x)},${f(s.y)}`;
      return `${s.c}${f(s.x)},${f(s.y)}`;
    })
    .join('');
}

/** Scale every coordinate and radius by k, then translate by (dx, dy). */
export function mapPath(segs: Seg[], k: number, dx: number, dy: number): Seg[] {
  return segs.map((s): Seg => {
    if (s.c === 'Z') return s;
    if (s.c === 'A') return { ...s, rx: s.rx * k, ry: s.ry * k, x: s.x * k + dx, y: s.y * k + dy };
    return { ...s, x: s.x * k + dx, y: s.y * k + dy };
  });
}

/** Interior sample points of a circular SVG arc (endpoints excluded). */
export function flattenArc(
  x1: number, y1: number, r: number, large: 0 | 1, sweep: 0 | 1, x2: number, y2: number, steps: number,
): [number, number][] {
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const d2 = dx * dx + dy * dy;
  if (d2 === 0 || r <= 0) return [];
  const rr = Math.max(r * r, d2);
  const sign = large !== sweep ? 1 : -1;
  const coef = sign * Math.sqrt(Math.max(0, (rr - d2) / d2));
  const cx = coef * dy + (x1 + x2) / 2;
  const cy = -coef * dx + (y1 + y2) / 2;
  const R = Math.sqrt(rr);
  const t1 = Math.atan2(y1 - cy, x1 - cx);
  let dt = Math.atan2(y2 - cy, x2 - cx) - t1;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  const out: [number, number][] = [];
  for (let i = 1; i < steps; i++) {
    const t = t1 + (dt * i) / steps;
    out.push([cx + R * Math.cos(t), cy + R * Math.sin(t)]);
  }
  return out;
}

/** Flatten a path to one flat vertex list per subpath (arcs sampled). */
export function pathPolygons(segs: Seg[], arcSteps = 8): number[][] {
  const polys: number[][] = [];
  let cur: number[] | null = null;
  let sx = 0, sy = 0, px = 0, py = 0;
  for (const s of segs) {
    if (s.c === 'M') {
      cur = [s.x, s.y];
      polys.push(cur);
      sx = px = s.x;
      sy = py = s.y;
    } else if (s.c === 'Z') {
      px = sx;
      py = sy;
      cur = null;
    } else {
      if (!cur) { cur = [px, py]; polys.push(cur); }
      if (s.c === 'A') {
        for (const [x, y] of flattenArc(px, py, (s.rx + s.ry) / 2, s.large, s.sweep, s.x, s.y, arcSteps)) cur.push(x, y);
      }
      cur.push(s.x, s.y);
      px = s.x;
      py = s.y;
    }
  }
  return polys;
}
```

- [ ] **Step 4: Implement `bounds.ts`**

```ts
import type { Affine, Bbox, BoardObject, Stroke } from '../model/types';
import { parsePath, pathPolygons } from './path';

export function pointsBbox(points: number[]): Bbox | null {
  if (points.length < 2) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i], y = points[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function polysBbox(polys: number[][]): Bbox | null {
  return pointsBbox(polys.flat());
}

export function unionBbox(a: Bbox | null, b: Bbox | null): Bbox | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function inflate(b: Bbox, d: number): Bbox {
  return { x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d };
}

export function intersects(a: Bbox, b: Bbox): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export function applyAffine(m: Affine, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function invertAffine(m: Affine): Affine | null {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (det === 0 || !Number.isFinite(det)) return null;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

function transformBbox(m: Affine, b: Bbox): Bbox {
  const pts = [
    ...applyAffine(m, b.x, b.y), ...applyAffine(m, b.x + b.w, b.y),
    ...applyAffine(m, b.x, b.y + b.h), ...applyAffine(m, b.x + b.w, b.y + b.h),
  ];
  return pointsBbox(pts)!;
}

export function strokeBounds(s: Stroke): Bbox | null {
  if (s.sourceOutline && !s.editedAt) {
    try {
      const b = polysBbox(pathPolygons(parsePath(s.sourceOutline)));
      if (b) return b;
    } catch {
      // fall through to points
    }
  }
  const b = pointsBbox(s.points);
  return b ? inflate(b, s.width / 2) : null;
}

export function objectBounds(o: BoardObject): Bbox | null {
  switch (o.kind) {
    case 'stroke':
      return strokeBounds(o);
    case 'group': {
      let b: Bbox | null = null;
      for (const c of o.children) b = unionBbox(b, strokeBounds(c));
      return b ? transformBbox(o.transform, b) : null;
    }
    case 'image':
      return { x: o.x, y: o.y, w: o.w, h: o.h };
    case 'unsupported':
      return o.bbox;
  }
}

export function boardBounds(objects: BoardObject[]): Bbox | null {
  let b: Bbox | null = null;
  for (const o of objects) b = unionBbox(b, objectBounds(o));
  return b;
}
```

- [ ] **Step 5: Implement `width.ts`**

```ts
import { round4 } from '../util/round';
import { pathPolygons, type Seg } from './path';

/** Flat list of edges [ax, ay, bx, by, …]; each subpath is treated as closed. */
function polygonEdges(polys: number[][]): number[] {
  const edges: number[] = [];
  for (const p of polys) {
    const n = p.length / 2;
    if (n < 2) continue;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      edges.push(p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1]);
    }
  }
  return edges;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function distToEdges(px: number, py: number, edges: number[]): number {
  let best = Infinity;
  for (let i = 0; i < edges.length; i += 4) {
    const d = segDist(px, py, edges[i], edges[i + 1], edges[i + 2], edges[i + 3]);
    if (d < best) best = d;
  }
  return best;
}

export function maxArcRadius(segs: Seg[]): number {
  let r = 0;
  for (const s of segs) if (s.c === 'A') r = Math.max(r, (s.rx + s.ry) / 2);
  return r;
}

function maxCenterDistance(points: number[], segs: Seg[]): number {
  const edges = polygonEdges(pathPolygons(segs));
  let best = 0;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const d = distToEdges(points[i], points[i + 1], edges);
    if (Number.isFinite(d) && d > best) best = d;
  }
  return best;
}

/** Nominal pen width: 2 × the largest arc radius; falls back to outline distance. */
export function penWidth(segs: Seg[], points: number[]): number {
  const r = maxArcRadius(segs);
  return r > 0 ? 2 * r : 2 * maxCenterDistance(points, segs);
}

function firstSubpathRect(segs: Seg[]): { w: number; h: number } | null {
  const polys = pathPolygons(segs);
  if (polys.length < 2) return null;
  const p = polys[0];
  const v: [number, number][] = [];
  for (let i = 0; i + 1 < p.length; i += 2) {
    const q: [number, number] = [p[i], p[i + 1]];
    const last = v[v.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) v.push(q);
  }
  if (v.length === 5 && v[0][0] === v[4][0] && v[0][1] === v[4][1]) v.pop();
  if (v.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const a = v[i], b = v[(i + 1) % 4];
    if (a[0] !== b[0] && a[1] !== b[1]) return null;
  }
  const xs = v.map((q) => q[0]), ys = v.map((q) => q[1]);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Highlighter width: the long side of the chisel-tip rectangle, else outline distance. */
export function highlighterWidth(segs: Seg[], points: number[]): number {
  const rect = firstSubpathRect(segs);
  if (rect) return Math.max(rect.w, rect.h);
  return 2 * maxCenterDistance(points, segs);
}

/** Per-point width = 2 × distance from each centerline point to the outline, clamped to [0.1·n, n]. */
export function perPointWidths(points: number[], segs: Seg[], nominal: number): number[] {
  const edges = polygonEdges(pathPolygons(segs));
  const out: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const d = distToEdges(points[i], points[i + 1], edges);
    const w = Number.isFinite(d) ? 2 * d : nominal;
    out.push(round4(Math.min(nominal, Math.max(0.1 * nominal, w))));
  }
  return out;
}
```

Add to `src/index.ts`:
```ts
export * from './geometry/path';
export * from './geometry/bounds';
export * from './geometry/width';
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run packages/core/test/geometry.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): path parsing, bounds and width recovery"
```

---

### Task 3: Outlines, translation, and textures

**Files:**
- Create: `packages/core/src/geometry/outline.ts`, `src/geometry/translate.ts`, `src/textures.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/outline.test.ts`

**Interfaces:**
- Consumes: `parsePath`, `formatPath`, `mapPath`, `pathPolygons`, `polysBbox`, `round4`, types.
- Produces: `strokeOutline(s): string`; `generateOutline(s): string`; `translateStroke(s, dx, dy): Stroke`; `translateObject(o, dx, dy): BoardObject`; `mulberry32(seed)`; `galaxyStars(size?, count?, seed?): Star[]`; `TEXTURE_TILE = 128`; `GALAXY_STAR_COUNT = 80`; `GALAXY_BASE`; `RAINBOW_STOPS`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/outline.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  strokeOutline, generateOutline, translateStroke, translateObject, parsePath, pathPolygons, polysBbox,
  galaxyStars, mulberry32, TEXTURE_TILE, type Stroke, type Group, type Unsupported,
} from '../src/index';

const base: Stroke = {
  kind: 'stroke', id: 's', tool: 'pen', color: { r: 0, g: 0, b: 0, a: 1 }, width: 10,
  points: [0, 0, 50, 0, 100, 0], brush: { kind: 'solid' },
};
const bboxOf = (d: string) => polysBbox(pathPolygons(parsePath(d)))!;

describe('strokeOutline', () => {
  it('returns the source outline while unedited', () => {
    expect(strokeOutline({ ...base, sourceOutline: 'M0,0L1,1' })).toBe('M0,0L1,1');
  });
  it('regenerates once edited', () => {
    const d = strokeOutline({ ...base, sourceOutline: 'M0,0L1,1', editedAt: '2026-01-01T00:00:00Z' });
    expect(d).not.toBe('M0,0L1,1');
    expect(d.startsWith('M')).toBe(true);
  });
});

describe('generateOutline', () => {
  it('draws constant width when there are no per-point widths', () => {
    const b = bboxOf(generateOutline(base));
    expect(b.h).toBeGreaterThan(9);
    expect(b.h).toBeLessThan(11);
  });
  it('honours per-point widths up to the nominal width', () => {
    const b = bboxOf(generateOutline({ ...base, widths: [2, 10, 2] }));
    expect(b.h).toBeLessThan(11);
    expect(b.h).toBeGreaterThan(5);
  });
  it('never produces NaN for degenerate strokes', () => {
    for (const points of [[5, 5], [5, 5, 5, 5, 5, 5]]) {
      const d = generateOutline({ ...base, points, widths: points.map(() => 10).slice(0, points.length / 2) });
      expect(d).not.toContain('NaN');
      expect(d.length).toBeGreaterThan(0);
    }
    expect(generateOutline({ ...base, points: [] })).toBe('');
  });
});

describe('translate', () => {
  it('moves points, outline and texture origin without marking the stroke edited', () => {
    const s: Stroke = { ...base, sourceOutline: 'M0,0L10,0', brush: { kind: 'texture', name: 'galaxy', origin: [1, 2], scale: 0.5 } };
    const t = translateStroke(s, 3, 4);
    expect(t.points).toEqual([3, 4, 53, 4, 103, 4]);
    expect(t.sourceOutline).toBe('M3,4L13,4');
    expect(t.brush).toEqual({ kind: 'texture', name: 'galaxy', origin: [4, 6], scale: 0.5 });
    expect(t.editedAt).toBeUndefined();
    expect(s.points).toEqual([0, 0, 50, 0, 100, 0]);
  });
  it('moves groups by transform, and keeps null bboxes null', () => {
    const g: Group = { kind: 'group', id: 'g', transform: [1, 0, 0, 1, 10, 10], children: [base] };
    expect((translateObject(g, 5, -5) as Group).transform).toEqual([1, 0, 0, 1, 15, 5]);
    const u: Unsupported = { kind: 'unsupported', id: 'u', sourceType: 'X', bbox: null };
    expect(translateObject(u, 1, 1)).toEqual(u);
  });
});

describe('textures', () => {
  it('is deterministic and within the tile', () => {
    expect(mulberry32(1)()).toBe(mulberry32(1)());
    const a = galaxyStars();
    expect(a).toEqual(galaxyStars());
    for (const s of a) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(TEXTURE_TILE);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/outline.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement**

`packages/core/src/geometry/outline.ts`:
```ts
import { getStroke } from 'perfect-freehand';
import type { Stroke } from '../model/types';
import { round4 } from '../util/round';

/** Outline used for rendering: the imported source outline while unedited, else generated. */
export function strokeOutline(s: Stroke): string {
  if (s.sourceOutline && !s.editedAt) return s.sourceOutline;
  return generateOutline(s);
}

/**
 * Variable-width outline from centerline points.
 * With thinning 1, perfect-freehand's radius is size·pressure, so size = width/2 and
 * pressure = widths[i]/width gives a local diameter of widths[i]. Without widths,
 * thinning 0 gives a constant diameter equal to size = width.
 */
export function generateOutline(s: Stroke): string {
  const n = Math.floor(s.points.length / 2);
  if (n === 0) return '';
  const variable = s.tool === 'pen' && !!s.widths && s.widths.length === n && s.width > 0;
  const input: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p = variable ? Math.min(1, Math.max(0.05, s.widths![i] / s.width)) : 1;
    input.push([s.points[2 * i], s.points[2 * i + 1], p]);
  }
  const poly = getStroke(input, {
    size: variable ? s.width / 2 : s.width,
    thinning: variable ? 1 : 0,
    smoothing: 0.5,
    streamline: 0.2,
    simulatePressure: false,
    last: true,
  });
  const pts = poly.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pts.length === 0) {
    // Fallback dot for degenerate input: a circle of the nominal width at the first point.
    const r = round4(Math.max(s.width, 0.1) / 2);
    const x = round4(s.points[0]), y = round4(s.points[1]);
    return `M${round4(x - r)},${y}A${r},${r} 0 1 0 ${round4(x + r)},${y}A${r},${r} 0 1 0 ${round4(x - r)},${y}Z`;
  }
  return 'M' + pts.map(([x, y]) => `${round4(x)},${round4(y)}`).join('L') + 'Z';
}
```

`packages/core/src/geometry/translate.ts`:
```ts
import type { BoardObject, Stroke } from '../model/types';
import { round4 } from '../util/round';
import { formatPath, mapPath, parsePath } from './path';

export function translateStroke(s: Stroke, dx: number, dy: number): Stroke {
  const out: Stroke = {
    ...s,
    points: s.points.map((v, i) => round4(v + (i % 2 === 0 ? dx : dy))),
  };
  if (s.sourceOutline) out.sourceOutline = formatPath(mapPath(parsePath(s.sourceOutline), 1, dx, dy));
  if (s.brush.kind === 'texture') {
    out.brush = { ...s.brush, origin: [round4(s.brush.origin[0] + dx), round4(s.brush.origin[1] + dy)] };
  }
  return out;
}

export function translateObject(o: BoardObject, dx: number, dy: number): BoardObject {
  switch (o.kind) {
    case 'stroke':
      return translateStroke(o, dx, dy);
    case 'group': {
      const [a, b, c, d, e, f] = o.transform;
      return { ...o, transform: [a, b, c, d, round4(e + dx), round4(f + dy)] };
    }
    case 'image':
      return { ...o, x: round4(o.x + dx), y: round4(o.y + dy) };
    case 'unsupported':
      return o.bbox ? { ...o, bbox: { ...o.bbox, x: round4(o.bbox.x + dx), y: round4(o.bbox.y + dy) } } : o;
  }
}
```

`packages/core/src/textures.ts` (original ChalkSmith art, generated from code):
```ts
import { round4 } from './util/round';

export const TEXTURE_TILE = 128;
export const GALAXY_STAR_COUNT = 80;
export const GALAXY_BASE = '#1b1340';
export const RAINBOW_STOPS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#af52de', '#ff3b30'];

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Star { x: number; y: number; r: number; alpha: number }

export function galaxyStars(size = TEXTURE_TILE, count = GALAXY_STAR_COUNT, seed = 0xc4a1c): Star[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    x: round4(rnd() * size),
    y: round4(rnd() * size),
    r: round4(0.3 + rnd() * 1.2),
    alpha: round4(0.5 + rnd() * 0.5),
  }));
}
```

Add to `src/index.ts`:
```ts
export * from './geometry/outline';
export * from './geometry/translate';
export * from './textures';
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/core/test/outline.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): stroke outlines, translation and original textures"
```

---

### Task 4: Hit-testing and spatial index

**Files:**
- Create: `packages/core/src/geometry/hittest.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/hittest.test.ts`

**Interfaces:**
- Consumes: `objectBounds`, `strokeBounds`, `inflate`, `intersects`, `invertAffine`, `applyAffine`.
- Produces: `distToPolyline(px, py, points): number`; `class GridIndex(cell = 256)` with `insert(id, bbox)`, `remove(id)`, `query(bbox): Set<string>`, `clear()`; `hitTest(objects, x, y, tol, candidates?): string | null` (topmost top-level id); `type ItemRef = { groupId: string | null; id: string }`; `strokesUnderPath(objects, path, tol): ItemRef[]`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/hittest.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { distToPolyline, GridIndex, hitTest, strokesUnderPath, type Stroke, type Group, type ImageObj } from '../src/index';

const stroke = (id: string, points: number[], width = 4): Stroke => ({
  kind: 'stroke', id, tool: 'pen', color: { r: 0, g: 0, b: 0, a: 1 }, width, points, brush: { kind: 'solid' },
});

describe('distToPolyline', () => {
  it('measures segments and single points', () => {
    expect(distToPolyline(5, 3, [0, 0, 10, 0])).toBe(3);
    expect(distToPolyline(3, 4, [0, 0])).toBe(5);
    expect(distToPolyline(0, 0, [])).toBe(Infinity);
  });
});

describe('GridIndex', () => {
  it('finds, removes and handles huge boxes', () => {
    const g = new GridIndex(256);
    g.insert('a', { x: 0, y: 0, w: 10, h: 10 });
    g.insert('b', { x: 1000, y: 1000, w: 10, h: 10 });
    g.insert('huge', { x: -1e6, y: -1e6, w: 2e6, h: 2e6 });
    expect([...g.query({ x: 5, y: 5, w: 1, h: 1 })].sort()).toEqual(['a', 'huge']);
    g.remove('a');
    expect([...g.query({ x: 5, y: 5, w: 1, h: 1 })]).toEqual(['huge']);
    g.clear();
    expect(g.query({ x: 0, y: 0, w: 1e6, h: 1e6 }).size).toBe(0);
  });
});

describe('hitTest', () => {
  const a = stroke('a', [0, 0, 100, 0]);
  const b = stroke('b', [0, 0, 0, 100]);
  const img: ImageObj = { kind: 'image', id: 'img', asset: 'assets/x.png', x: 200, y: 200, w: 50, h: 50, intrinsic: { w: 50, h: 50 } };
  const g: Group = { kind: 'group', id: 'g', transform: [1, 0, 0, 1, 500, 500], children: [stroke('c', [0, 0, 10, 0])] };
  const objs = [a, b, img, g];
  it('returns the topmost object', () => {
    expect(hitTest(objs, 0, 0, 2)).toBe('b');
    expect(hitTest(objs, 50, 1, 2)).toBe('a');
    expect(hitTest(objs, 220, 220, 2)).toBe('img');
    expect(hitTest(objs, 505, 501, 2)).toBe('g');
    expect(hitTest(objs, 400, 400, 2)).toBeNull();
  });
  it('respects candidate sets', () => {
    expect(hitTest(objs, 0, 0, 2, new Set(['a']))).toBe('a');
  });
  it('finds strokes and group children under an eraser path', () => {
    const refs = strokesUnderPath(objs, [50, -10, 50, 10, 500, 500, 510, 500], 2);
    expect(refs).toEqual([{ groupId: null, id: 'a' }, { groupId: 'g', id: 'c' }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/hittest.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/core/src/geometry/hittest.ts`:
```ts
import type { Bbox, BoardObject, Stroke } from '../model/types';
import { applyAffine, inflate, intersects, invertAffine, objectBounds, strokeBounds } from './bounds';

export function distToPolyline(px: number, py: number, points: number[]): number {
  const n = Math.floor(points.length / 2);
  if (n === 0) return Infinity;
  if (n === 1) return Math.hypot(px - points[0], py - points[1]);
  let best = Infinity;
  for (let i = 0; i < n - 1; i++) {
    const ax = points[2 * i], ay = points[2 * i + 1], bx = points[2 * i + 2], by = points[2 * i + 3];
    const dx = bx - ax, dy = by - ay;
    const L = dx * dx + dy * dy;
    const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
    const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
    if (d < best) best = d;
  }
  return best;
}

const MAX_CELLS = 4096;

export class GridIndex {
  private readonly cells = new Map<string, Set<string>>();
  private readonly boxes = new Map<string, Bbox>();
  private readonly big = new Set<string>();
  constructor(private readonly cell = 256) {}

  private range(b: Bbox): [number, number, number, number] {
    return [
      Math.floor(b.x / this.cell), Math.floor(b.y / this.cell),
      Math.floor((b.x + b.w) / this.cell), Math.floor((b.y + b.h) / this.cell),
    ];
  }

  insert(id: string, b: Bbox): void {
    this.remove(id);
    this.boxes.set(id, b);
    const [x0, y0, x1, y1] = this.range(b);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELLS) { this.big.add(id); return; }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = `${x},${y}`;
      let s = this.cells.get(k);
      if (!s) { s = new Set(); this.cells.set(k, s); }
      s.add(id);
    }
  }

  remove(id: string): void {
    const b = this.boxes.get(id);
    if (!b) return;
    this.boxes.delete(id);
    if (this.big.delete(id)) return;
    const [x0, y0, x1, y1] = this.range(b);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) this.cells.get(`${x},${y}`)?.delete(id);
  }

  query(b: Bbox): Set<string> {
    const out = new Set<string>();
    for (const id of this.big) if (intersects(this.boxes.get(id)!, b)) out.add(id);
    const [x0, y0, x1, y1] = this.range(b);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELLS) {
      for (const [id, box] of this.boxes) if (intersects(box, b)) out.add(id);
      return out;
    }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      for (const id of this.cells.get(`${x},${y}`) ?? []) if (intersects(this.boxes.get(id)!, b)) out.add(id);
    }
    return out;
  }

  clear(): void {
    this.cells.clear();
    this.boxes.clear();
    this.big.clear();
  }
}

function strokeHit(s: Stroke, x: number, y: number, tol: number): boolean {
  const b = strokeBounds(s);
  if (!b || !intersects(inflate(b, tol), { x, y, w: 0, h: 0 })) return false;
  return distToPolyline(x, y, s.points) <= Math.max(s.width / 2, tol);
}

function inBox(b: Bbox | null, x: number, y: number, tol: number): boolean {
  return !!b && intersects(inflate(b, tol), { x, y, w: 0, h: 0 });
}

function hitObject(o: BoardObject, x: number, y: number, tol: number): boolean {
  switch (o.kind) {
    case 'stroke':
      return strokeHit(o, x, y, tol);
    case 'group': {
      const inv = invertAffine(o.transform);
      if (!inv) return false;
      const [lx, ly] = applyAffine(inv, x, y);
      const scale = Math.sqrt(Math.abs(o.transform[0] * o.transform[3] - o.transform[1] * o.transform[2])) || 1;
      return o.children.some((c) => strokeHit(c, lx, ly, tol / scale));
    }
    case 'image':
    case 'unsupported':
      return inBox(objectBounds(o), x, y, tol);
  }
}

/** Topmost top-level object under (x, y), or null. */
export function hitTest(objects: BoardObject[], x: number, y: number, tol: number, candidates?: Set<string>): string | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (candidates && !candidates.has(o.id)) continue;
    if (hitObject(o, x, y, tol)) return o.id;
  }
  return null;
}

export type ItemRef = { groupId: string | null; id: string };

function densify(path: number[], step: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < path.length; i += 2) {
    if (i >= 2) {
      const ax = path[i - 2], ay = path[i - 1], bx = path[i], by = path[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) / step);
      for (let k = 1; k < n; k++) out.push(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
    }
    out.push(path[i], path[i + 1]);
  }
  return out;
}

/** Strokes (top-level, or children of groups) touched by an eraser path. */
export function strokesUnderPath(objects: BoardObject[], path: number[], tol: number): ItemRef[] {
  const pts = densify(path, Math.max(tol, 0.5));
  const refs: ItemRef[] = [];
  const touches = (s: Stroke, xs: number[], t: number) => {
    for (let i = 0; i + 1 < xs.length; i += 2) if (strokeHit(s, xs[i], xs[i + 1], t)) return true;
    return false;
  };
  for (const o of objects) {
    if (o.kind === 'stroke' && touches(o, pts, tol)) refs.push({ groupId: null, id: o.id });
    if (o.kind === 'group') {
      const inv = invertAffine(o.transform);
      if (!inv) continue;
      const local: number[] = [];
      for (let i = 0; i + 1 < pts.length; i += 2) local.push(...applyAffine(inv, pts[i], pts[i + 1]));
      const scale = Math.sqrt(Math.abs(o.transform[0] * o.transform[3] - o.transform[1] * o.transform[2])) || 1;
      for (const c of o.children) if (touches(c, local, tol / scale)) refs.push({ groupId: o.id, id: c.id });
    }
  }
  return refs;
}
```

Add to `src/index.ts`: `export * from './geometry/hittest';`

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/core/test/hittest.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): hit-testing, eraser hit detection and grid index"
```

---

### Task 5: The `.chalk` format (schema, read, write, published spec)

**Files:**
- Create: `packages/core/src/format/schema.ts`, `src/format/validate.ts`, `src/format/chalk.ts`, `docs/spec/chalk-format.md`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/chalk.test.ts`

**Interfaces:**
- Consumes: types, `ChalkError`, `round4`.
- Produces: `chalkBoardSchema`; `validateBoard(board: unknown): asserts board is Board` (throws `SchemaInvalid`); `CHALK_VERSION = 0`; `interface ChalkContents { board; assets: Map<string, Uint8Array>; extensions: Map<string, Uint8Array>; createdAt?: string }`; `writeChalk(c, { appVersion, now? }): Uint8Array`; `interface ChalkFile extends ChalkContents { manifest: Manifest; warnings: string[] }`; `readChalk(bytes): ChalkFile`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/chalk.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readChalk, writeChalk, chalkBoardSchema, ChalkError, type Board } from '../src/index';

const asset = 'assets/' + 'a'.repeat(64) + '.png';
const board: Board = {
  id: 'b1',
  background: { color: { r: 255, g: 255, b: 255, a: 1 } },
  view: { x: -10.5, y: 3, zoom: 0.25 },
  objects: [
    { kind: 'stroke', id: 's1', tool: 'pen', color: { r: 31, g: 31, b: 31, a: 1 }, width: 3.5,
      points: [0, 0, 1.2345, 2], widths: [1, 3.5], brush: { kind: 'solid' }, sourceOutline: 'M0,0L1,1',
      source: { system: 'ms-whiteboard', id: 'abc' } },
    { kind: 'group', id: 'g1', transform: [1, 0, 0, 1, 10, 20], children: [
      { kind: 'stroke', id: 's2', tool: 'highlighter', color: { r: 253, g: 132, b: 45, a: 0.4 }, width: 9.3,
        points: [0, 0], brush: { kind: 'texture', name: 'galaxy', origin: [0, 0], scale: 0.5 } },
    ] },
    { kind: 'image', id: 'i1', asset, x: 1, y: 2, w: 30, h: 20, intrinsic: { w: 60, h: 40 } },
    { kind: 'unsupported', id: 'u1', sourceType: 'StickyNote', bbox: null },
  ],
};
const contents = () => ({
  board: structuredClone(board),
  assets: new Map([[asset, new Uint8Array([1, 2, 3])]]),
  extensions: new Map([['extensions/ms-whiteboard/comments.json', strToU8('{"commentThreads":[]}')]]),
});

describe('.chalk round trip', () => {
  it('writes and reads back identical content', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    const f = readChalk(writeChalk(contents(), { appVersion: '0.1.0', now }));
    expect(f.board).toEqual(board);
    expect([...f.assets.keys()]).toEqual([asset]);
    expect(f.assets.get(asset)).toEqual(new Uint8Array([1, 2, 3]));
    expect(f.extensions.size).toBe(1);
    expect(f.manifest).toEqual({ format: 'chalk', version: 0, createdBy: 'ChalkSmith 0.1.0',
      createdAt: '2026-10-16T12:00:00.000Z', modifiedAt: '2026-10-16T12:00:00.000Z' });
    expect(f.warnings).toEqual([]);
  });
  it('keeps createdAt when given', () => {
    const f = readChalk(writeChalk({ ...contents(), createdAt: '2020-01-01T00:00:00.000Z' }, { appVersion: 'x' }));
    expect(f.manifest.createdAt).toBe('2020-01-01T00:00:00.000Z');
  });
  it('rounds numbers to 4 decimals on write', () => {
    const c = contents();
    (c.board.objects[0] as { points: number[] }).points = [0.123456, 0, 1, 1];
    const f = readChalk(writeChalk(c, { appVersion: 'x' }));
    expect((f.board.objects[0] as { points: number[] }).points[0]).toBe(0.1235);
  });
});

const zip = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ChalkError).code; } return 'none'; };

describe('.chalk rejection', () => {
  it('rejects non-zip, missing parts, wrong format and future versions', () => {
    expect(code(() => readChalk(strToU8('hello')))).toBe('BadChalk');
    expect(code(() => readChalk(zip({ 'board.json': '{}' })))).toBe('BadChalk');
    expect(code(() => readChalk(zip({ 'manifest.json': '{"format":"other","version":0}', 'board.json': '{}' })))).toBe('BadChalk');
    expect(code(() => readChalk(zip({ 'manifest.json': '{"format":"chalk","version":1}', 'board.json': '{}' })))).toBe('UnsupportedVersion');
  });
  it('rejects schema violations, odd points and width mismatches', () => {
    const m = '{"format":"chalk","version":0,"createdBy":"x","createdAt":"a","modifiedAt":"a"}';
    const bad = (b: unknown) => code(() => readChalk(zip({ 'manifest.json': m, 'board.json': JSON.stringify(b) })));
    const ok = structuredClone(board);
    expect(bad({ ...ok, background: { color: { r: 999, g: 0, b: 0, a: 1 } } })).toBe('SchemaInvalid');
    const odd = structuredClone(board); (odd.objects[0] as { points: number[] }).points = [1, 2, 3];
    expect(bad(odd)).toBe('SchemaInvalid');
    const mism = structuredClone(board); (mism.objects[0] as { widths: number[] }).widths = [1];
    expect(bad(mism)).toBe('SchemaInvalid');
  });
  it('warns about missing assets and ignores unsafe entry names', () => {
    const c = contents(); c.assets.clear();
    const bytes = writeChalk(c, { appVersion: 'x' });
    const f = readChalk(bytes);
    expect(f.warnings).toEqual([`Image i1: asset ${asset} is missing.`]);
    expect(() => writeChalk({ ...contents(), assets: new Map([['../evil.png', new Uint8Array()]]) }, { appVersion: 'x' })).toThrow();
  });
});

describe('published schema', () => {
  it('docs/spec/chalk-format.md contains exactly the code schema', () => {
    const md = readFileSync(fileURLToPath(new URL('../../../docs/spec/chalk-format.md', import.meta.url)), 'utf8');
    const block = md.match(/```json\n([\s\S]*?)\n```/);
    expect(block).not.toBeNull();
    expect(JSON.parse(block![1])).toEqual(JSON.parse(JSON.stringify(chalkBoardSchema)));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/chalk.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the schema**

`packages/core/src/format/schema.ts`:
```ts
const base = {
  id: { type: 'string', minLength: 1 },
  source: { $ref: '#/$defs/source' },
  ext: { $ref: '#/$defs/ext' },
};
const num = { type: 'number' };
const pair = { type: 'array', items: num, minItems: 2, maxItems: 2 };

export const chalkBoardSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/FrankLaVigne/ChalkSmith/schema/board-v0.json',
  title: 'ChalkSmith board (format version 0)',
  type: 'object',
  required: ['id', 'background', 'objects'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    background: {
      type: 'object', required: ['color'], additionalProperties: false,
      properties: { color: { $ref: '#/$defs/rgba' } },
    },
    view: {
      type: 'object', required: ['x', 'y', 'zoom'], additionalProperties: false,
      properties: { x: num, y: num, zoom: { type: 'number', exclusiveMinimum: 0 } },
    },
    objects: { type: 'array', items: { $ref: '#/$defs/object' } },
    ext: { $ref: '#/$defs/ext' },
  },
  $defs: {
    ext: { type: 'object' },
    rgba: {
      type: 'object', required: ['r', 'g', 'b', 'a'], additionalProperties: false,
      properties: {
        r: { type: 'integer', minimum: 0, maximum: 255 },
        g: { type: 'integer', minimum: 0, maximum: 255 },
        b: { type: 'integer', minimum: 0, maximum: 255 },
        a: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    source: {
      type: 'object', required: ['system', 'id'], additionalProperties: false,
      properties: { system: { const: 'ms-whiteboard' }, id: { type: 'string' } },
    },
    bbox: {
      type: 'object', required: ['x', 'y', 'w', 'h'], additionalProperties: false,
      properties: { x: num, y: num, w: { type: 'number', minimum: 0 }, h: { type: 'number', minimum: 0 } },
    },
    brush: {
      oneOf: [
        { type: 'object', required: ['kind'], additionalProperties: false, properties: { kind: { const: 'solid' } } },
        {
          type: 'object', required: ['kind', 'name', 'origin', 'scale'], additionalProperties: false,
          properties: {
            kind: { const: 'texture' }, name: { enum: ['galaxy', 'rainbow'] },
            origin: pair, scale: { type: 'number', exclusiveMinimum: 0 },
          },
        },
      ],
    },
    stroke: {
      type: 'object', required: ['id', 'kind', 'tool', 'color', 'width', 'points', 'brush'], additionalProperties: false,
      properties: {
        ...base,
        kind: { const: 'stroke' },
        tool: { enum: ['pen', 'highlighter'] },
        color: { $ref: '#/$defs/rgba' },
        width: { type: 'number', exclusiveMinimum: 0 },
        points: { type: 'array', items: num },
        widths: { type: 'array', items: { type: 'number', minimum: 0 } },
        brush: { $ref: '#/$defs/brush' },
        sourceOutline: { type: 'string' },
        editedAt: { type: 'string' },
      },
    },
    group: {
      type: 'object', required: ['id', 'kind', 'transform', 'children'], additionalProperties: false,
      properties: {
        ...base,
        kind: { const: 'group' },
        transform: { type: 'array', items: num, minItems: 6, maxItems: 6 },
        children: { type: 'array', items: { $ref: '#/$defs/stroke' } },
      },
    },
    image: {
      type: 'object', required: ['id', 'kind', 'asset', 'x', 'y', 'w', 'h', 'intrinsic'], additionalProperties: false,
      properties: {
        ...base,
        kind: { const: 'image' },
        asset: { type: 'string', pattern: '^assets/[0-9a-f]{64}\\.(png|jpg|gif|webp)$' },
        x: num, y: num, w: { type: 'number', minimum: 0 }, h: { type: 'number', minimum: 0 },
        intrinsic: {
          type: 'object', required: ['w', 'h'], additionalProperties: false,
          properties: { w: { type: 'number', minimum: 0 }, h: { type: 'number', minimum: 0 } },
        },
      },
    },
    unsupported: {
      type: 'object', required: ['id', 'kind', 'sourceType', 'bbox'], additionalProperties: false,
      properties: {
        ...base,
        kind: { const: 'unsupported' },
        sourceType: { type: 'string' },
        bbox: { oneOf: [{ $ref: '#/$defs/bbox' }, { type: 'null' }] },
      },
    },
    object: {
      oneOf: [
        { $ref: '#/$defs/stroke' }, { $ref: '#/$defs/group' },
        { $ref: '#/$defs/image' }, { $ref: '#/$defs/unsupported' },
      ],
    },
  },
};
```

- [ ] **Step 4: Implement validation and read/write**

`packages/core/src/format/validate.ts`:
```ts
import Ajv2020 from 'ajv/dist/2020';
import { ChalkError } from '../errors';
import type { Board, Stroke } from '../model/types';
import { chalkBoardSchema } from './schema';

const ajv = new Ajv2020({ allErrors: false });
const check = ajv.compile(chalkBoardSchema);

function checkStroke(s: Stroke): void {
  if (s.points.length % 2 !== 0) throw new ChalkError('SchemaInvalid', `Invalid board: stroke ${s.id} has an odd number of coordinates.`);
  if (s.widths && s.widths.length !== s.points.length / 2) {
    throw new ChalkError('SchemaInvalid', `Invalid board: stroke ${s.id} has ${s.widths.length} widths for ${s.points.length / 2} points.`);
  }
}

export function validateBoard(board: unknown): asserts board is Board {
  if (!check(board)) {
    const e = check.errors?.[0];
    throw new ChalkError('SchemaInvalid', `Invalid board: ${e?.instancePath || '/'} ${e?.message ?? 'does not match the schema'}.`);
  }
  for (const o of (board as Board).objects) {
    if (o.kind === 'stroke') checkStroke(o);
    if (o.kind === 'group') o.children.forEach(checkStroke);
  }
}
```

`packages/core/src/format/chalk.ts`:
```ts
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { ChalkError } from '../errors';
import type { Board, Manifest } from '../model/types';
import { round4 } from '../util/round';
import { validateBoard } from './validate';

export const CHALK_VERSION = 0;

export interface ChalkContents {
  board: Board;
  assets: Map<string, Uint8Array>;
  extensions: Map<string, Uint8Array>;
  createdAt?: string;
}

export interface ChalkFile extends ChalkContents {
  manifest: Manifest;
  warnings: string[];
}

function safeEntry(path: string, prefix: string): boolean {
  return path.startsWith(prefix) && !path.includes('..') && !path.includes('\\') && !path.startsWith('/') && path.length > prefix.length;
}

const json = (v: unknown) =>
  strToU8(JSON.stringify(v, (_k, x) => (typeof x === 'number' ? round4(x) : x), 2));

export function writeChalk(c: ChalkContents, opts: { appVersion: string; now?: Date }): Uint8Array {
  validateBoard(c.board);
  const now = (opts.now ?? new Date()).toISOString();
  const manifest: Manifest = {
    format: 'chalk', version: CHALK_VERSION, createdBy: `ChalkSmith ${opts.appVersion}`,
    createdAt: c.createdAt ?? now, modifiedAt: now,
  };
  const files: Zippable = { 'manifest.json': json(manifest), 'board.json': json(c.board) };
  for (const [p, b] of c.assets) {
    if (!safeEntry(p, 'assets/')) throw new ChalkError('BadChalk', `Refusing to write unsafe asset path "${p}".`);
    files[p] = [b, { level: 0 }];
  }
  for (const [p, b] of c.extensions) {
    if (!safeEntry(p, 'extensions/')) throw new ChalkError('BadChalk', `Refusing to write unsafe extension path "${p}".`);
    files[p] = b;
  }
  return zipSync(files, { level: 6 });
}

function parseJson(bytes: Uint8Array, name: string): unknown {
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    throw new ChalkError('BadChalk', `This .chalk file is damaged: ${name} is not valid JSON.`);
  }
}

export function readChalk(bytes: Uint8Array): ChalkFile {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new ChalkError('BadChalk', 'This file is not a valid .chalk file (it is not a ZIP archive).');
  }
  const m = entries['manifest.json'];
  const b = entries['board.json'];
  if (!m || !b) throw new ChalkError('BadChalk', 'This .chalk file is missing manifest.json or board.json.');
  const manifest = parseJson(m, 'manifest.json') as Partial<Manifest> | null;
  if (!manifest || manifest.format !== 'chalk') throw new ChalkError('BadChalk', 'This file is not a ChalkSmith board.');
  if (typeof manifest.version !== 'number' || manifest.version > CHALK_VERSION) {
    throw new ChalkError('UnsupportedVersion',
      `This board was saved by a newer ChalkSmith (format version ${String(manifest.version)}). Please update ChalkSmith.`);
  }
  const board = parseJson(b, 'board.json');
  validateBoard(board);
  const assets = new Map<string, Uint8Array>();
  const extensions = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) {
    if (safeEntry(name, 'assets/')) assets.set(name, data);
    else if (safeEntry(name, 'extensions/')) extensions.set(name, data);
  }
  const warnings: string[] = [];
  for (const o of board.objects) {
    if (o.kind === 'image' && !assets.has(o.asset)) warnings.push(`Image ${o.id}: asset ${o.asset} is missing.`);
  }
  return { board, assets, extensions, createdAt: manifest.createdAt, manifest: manifest as Manifest, warnings };
}
```

Add to `src/index.ts`:
```ts
export * from './format/schema';
export * from './format/validate';
export * from './format/chalk';
```

- [ ] **Step 5: Write `docs/spec/chalk-format.md`**

Print the schema:
```bash
npx tsx -e "import { chalkBoardSchema } from './packages/core/src/format/schema'; console.log(JSON.stringify(chalkBoardSchema, null, 2))"
```
Create `docs/spec/chalk-format.md` with this prose, and paste the printed JSON as the **only** ```json block:

````markdown
# ChalkSmith `.chalk` format — version 0

A `.chalk` file is a ZIP archive:

| Entry | Content |
|---|---|
| `manifest.json` | `{ "format": "chalk", "version": 0, "createdBy", "createdAt", "modifiedAt" }` (ISO-8601 times) |
| `board.json` | The board, matching the schema below |
| `assets/<sha256>.<ext>` | Binary assets named by the SHA-256 of their bytes (`png`, `jpg`, `gif`, `webp`) |
| `extensions/…` | Optional pass-through data, e.g. `extensions/ms-whiteboard/comments.json` |

Readers must reject a `format` other than `"chalk"` and a `version` greater than they support.

## Semantics

- Coordinates are CSS pixels; y points down. `view.x`/`view.y` are the world coordinates at the viewport's top-left corner.
- `objects` are in paint order (first = bottom). A group's `children` are in paint order too and live in group space; `transform` is `[a, b, c, d, e, f]` with `x' = a·x + c·y + e`, `y' = b·x + d·y + f`.
- A stroke's `points` is a flat `[x0, y0, x1, y1, …]` list; `widths`, when present, has one entry per point. `width` is the nominal width.
- `sourceOutline` is SVG path data (absolute `M`/`L`/`A`/`Z`) in the same space as `points`. Renderers draw it while `editedAt` is absent, and regenerate the outline from `points`/`widths` once `editedAt` is set.
- `brush.kind: "texture"` names a texture (`galaxy`, `rainbow`). Each application supplies its own artwork; `origin` and `scale` place it.
- Numbers are written with at most 4 decimal places.
- Extra checks beyond the schema: `points` has an even length; `widths` (if present) has `points.length / 2` entries.

## JSON Schema (draft 2020-12) for `board.json`

```json
<PASTE THE PRINTED SCHEMA HERE>
```
````

- [ ] **Step 6: Run tests**

Run: `npx vitest run packages/core/test/chalk.test.ts && npm run typecheck`
Expected: PASS. If the published-schema test fails, re-run the print command and re-paste the JSON.

- [ ] **Step 7: Commit**

```bash
git add packages/core docs/spec/chalk-format.md
git commit -m "feat(core): .chalk v0 format with JSON Schema validation"
```

---

### Task 6: Synthetic fixture builder

**Files:**
- Create: `packages/core/fixtures/build.ts`, `packages/core/fixtures/catalog.ts`, `packages/core/fixtures/generate.ts`
- Test: `packages/core/test/fixtures.test.ts`

**Interfaces:**
- Consumes: `bytesToBase64`, `sniffImage`, `imageSize`, `parsePath`.
- Produces (`fixtures/build.ts`): types `Pt`, `FxStroke`, `FxInk`, `FxImage`, `FxRaw`, `FxBoard`; `buildExportHtml(b: FxBoard): string`; `buildExportZip(html, opts?: { name?: string; comments?: string | null; extra?: Record<string, Uint8Array> }): Uint8Array`; `penOutline(points: Pt[], half: number[]): string`; `highlighterOutline(points: Pt[], tipW: number, tipH: number): string`; `makePng(w, h, color?: (x, y) => [r, g, b]): Uint8Array`.
- Produces (`fixtures/catalog.ts`): `FIXTURES: Record<string, () => Uint8Array>` with keys `pen-basic`, `pen-variable-width`, `highlighter`, `texture-galaxy`, `image-centered`, `multi-group-order`, `unknown-type`, `malformed-stroke`, `single-point`, `rotated-group`, `external-image`, `with-comments`, `bad-comments`, `no-comments`, `not-a-zip`, `no-html`, `no-canvas`. Also exports `PNG_80x40: Uint8Array`.

All geometry in fixtures is invented. Units inside strokes are 1/128 px, as in real exports.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/fixtures.test.ts`:
```ts
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { imageSize, sniffImage, parsePath, maxArcRadius } from '../src/index';
import { buildExportHtml, buildExportZip, makePng, penOutline } from '../fixtures/build';
import { FIXTURES } from '../fixtures/catalog';

describe('fixture builder', () => {
  it('builds a ZIP with board HTML and comments', () => {
    const z = unzipSync(buildExportZip(buildExportHtml({ objects: [] }), { name: 'Board' }));
    expect(Object.keys(z).sort()).toEqual(['Board-comments.json', 'Board.html']);
    expect(strFromU8(z['Board.html'])).toContain('id="canvasContent"');
  });
  it('makes real PNGs', () => {
    const p = makePng(80, 40);
    const k = sniffImage(p)!;
    expect(imageSize(p, k)).toEqual({ w: 80, h: 40 });
  });
  it('emits arcs that carry the half-width', () => {
    const d = penOutline([[0, 0], [1280, 0], [2560, 0]], [128, 512, 256]);
    expect(maxArcRadius(parsePath(d))).toBe(512);
    expect(penOutline([[0, 0]], [256])).toMatch(/^M-256,0A256,256/);
  });
  it('builds every catalog entry', () => {
    for (const [name, make] of Object.entries(FIXTURES)) expect(make().length, name).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/fixtures.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `fixtures/build.ts`**

```ts
import { strToU8, zipSync, zlibSync, type Zippable } from 'fflate';
import { bytesToBase64 } from '../src/index';

export type Pt = [number, number];

/** A stroke in 1/128-px units, group-local. */
export interface FxStroke {
  fill: string;
  points: Pt[];
  outline: string;
  texture?: 'galaxy' | 'rainbow';
  rawPoints?: string; // overrides `points` text verbatim (for malformed fixtures)
}
export interface FxInk {
  kind: 'ink';
  id: string;
  left: number;
  top: number;
  /** Anchor matrix translation; defaults to the viewBox origin, as real exports do. */
  e?: number;
  f?: number;
  matrix?: [number, number, number, number];
  viewBox: [number, number, number, number];
  tool: 'PenStroke' | 'Highlighter';
  strokes: FxStroke[];
}
export interface FxImage { kind: 'image'; id: string; left: number; top: number; w: number; h: number; src: string }
export interface FxRaw { kind: 'raw'; html: string }
export type FxObject = FxInk | FxImage | FxRaw;
export interface FxBoard {
  background?: string;
  view?: { tx: number; ty: number; scale: number };
  objects: FxObject[];
}

const HIT_WIDTH = '8140.929356707803'; // a hit-test width: must never be read as a pen width

function strokeHtml(s: FxStroke, id: string, i: number): string {
  const pts = s.rawPoints ?? s.points.map(([x, y]) => `${x},${y}`).join(' ');
  const [sx, sy] = s.points[0] ?? [0, 0];
  const tex = s.texture
    ? `<defs><pattern id="-${i}" width="540" height="540" x="0" y="0" patternUnits="userSpaceOnUse" patternTransform="translate(${sx} ${sy}) scale(0.5 0.5) matrix(128, 0, 0, 128, 0, 0)"><use href="#${s.texture}-pen"></use></pattern></defs>`
    : '';
  const fill = s.texture ? `url(#-${i})` : s.fill;
  return `<g class="inkStroke interactive" id="${id}" transform="matrix(0.0078125, 0, 0, 0.0078125, 0, 0)" data-apikey="__x_${id}"><path d="${s.outline}" fill="${fill}" opacity="${s.texture ? '1' : ''}"></path>${tex}<polyline class="inkHitTestOverlay" stroke-linecap="round" stroke-width="${HIT_WIDTH}" points="${pts} "></polyline></g>`;
}

function inkHtml(o: FxInk): string {
  const [a, b, c, d] = o.matrix ?? [1, 0, 0, 1];
  const [vx, vy, vw, vh] = o.viewBox;
  const strokes = o.strokes.map((s, i) => strokeHtml(s, `${o.id}s${i}`, i)).join('');
  return `<div class="anchor includedInExportedPdf align topLeft" data-prevent-drag="false" data-whiteboard-type="InkGroup" data-apikey="${o.id}" style="left: ${o.left}px; top: ${o.top}px; transform: matrix(${a}, ${b}, ${c}, ${d}, ${o.e ?? vx}, ${o.f ?? vy});"><div id="id${o.id}c" data-content-blueprint-type="BpInkGroup" data-blueprint-type="CanvasChild" data-identity-key="${o.id}" class="canvasChild canvasChildElement"><svg class="inkGroup ink ${o.tool}" viewBox="${vx} ${vy} ${vw} ${vh}" overflow="visible" width="${vw}" height="${vh}" tabindex="0">${strokes}</svg></div></div>`;
}

function imageHtml(o: FxImage): string {
  return `<div class="anchor includedInExportedPdf align center" data-prevent-drag="false" data-whiteboard-type="AzureImage" data-apikey="${o.id}" style="left: ${o.left}px; top: ${o.top}px; transform: matrix(1, 0, 0, 1, 0, 0);"><div id="id${o.id}c" data-content-blueprint-type="Image" data-blueprint-type="CanvasChild" class="canvasChild canvasChildElement"><div class="content imageComponent interactive" role="img" tabindex="0" style="height: ${o.h}px; width: ${o.w}px;"><div class="ms-Image"><img draggable="false" src="${o.src}" class="ms-Image-image" style="max-height: ${o.h}px; max-width: ${o.w}px;"></div></div></div></div>`;
}

export function dataUri(bytes: Uint8Array): string {
  return `data:image/*;base64,${bytesToBase64(bytes)}`;
}

export function buildExportHtml(b: FxBoard): string {
  const v = b.view ?? { tx: 0, ty: 0, scale: 1 };
  const objs = b.objects.map((o) => (o.kind === 'ink' ? inkHtml(o) : o.kind === 'image' ? imageHtml(o) : o.html)).join('');
  return `<html><head><meta charSet="utf-8" /><meta httpEquiv="Content-Type" content="text/html; charset=utf-8" /><style>.anchor { position: absolute; } .synthetic { color: red; }</style></head><body style="overflow: auto;"><div class="transformComponent" style="transform: translate(${v.tx}px, ${v.ty}px) scale(${v.scale});"><svg class="canvasBackground" version="1.1" xmlns="http://www.w3.org/2000/svg"><defs class="canvasBackgroundGrid"><pattern id="Neutral"></pattern></defs><rect class="canvasBackgroundColor" width="100%" height="100%" fill="${b.background ?? '#FFFFFF'}"></rect><rect width="100%" height="100%" fill="url(#Neutral)"></rect></svg><div id="canvasContent" class="contentOrigin" data-blueprint-type="Canvas" data-identity-key="c0">${objs}</div><svg id="effect-resources"><defs><image id="rainbow-pen" href="https://example.invalid/rainbow.jpg"></image><image id="galaxy-pen" href="https://example.invalid/galaxy.jpg"></image></defs></svg></div></body></html>`;
}

const EMPTY_COMMENTS = '{\n  "description": "The comment thread IDs in this file correspond to the IDs presented in the HTML file.",\n  "commentThreads": []\n}';

export function buildExportZip(
  html: string,
  opts: { name?: string; comments?: string | null; extra?: Record<string, Uint8Array> } = {},
): Uint8Array {
  const name = opts.name ?? 'Board';
  const files: Zippable = { [`${name}.html`]: [strToU8(html), { level: 0 }] };
  const comments = opts.comments === undefined ? EMPTY_COMMENTS : opts.comments;
  if (comments !== null) files[`${name}-comments.json`] = [strToU8(comments), { level: 0 }];
  for (const [k, v] of Object.entries(opts.extra ?? {})) files[k] = v;
  return zipSync(files);
}

/**
 * Round-capped pen outline in 1/128 units: a left offset edge with a zero-length arc at each
 * vertex (carrying that vertex's half-width, as Whiteboard emits at joins), then the right edge.
 */
export function penOutline(points: Pt[], half: number[]): string {
  const n = points.length;
  if (n === 1) {
    const [x, y] = points[0];
    const r = half[0];
    return `M${x - r},${y}A${r},${r} 0 0 0 ${x + r},${y}A${r},${r} 0 0 0 ${x - r},${y}`;
  }
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[Math.min(n - 1, i + 1)];
    let dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const nx = -dy, ny = dx;
    left.push([Math.round(points[i][0] + nx * half[i]), Math.round(points[i][1] + ny * half[i])]);
    right.push([Math.round(points[i][0] - nx * half[i]), Math.round(points[i][1] - ny * half[i])]);
  }
  let d = `M${left[0][0]},${left[0][1]}`;
  for (let i = 1; i < n; i++) d += `L${left[i][0]},${left[i][1]}A${half[i]},${half[i]} 0 0 0 ${left[i][0]},${left[i][1]}`;
  for (let i = n - 1; i >= 0; i--) d += `L${right[i][0]},${right[i][1]}`;
  return d;
}

/** Chisel highlighter in 1/128 units: tip rectangle subpath, then a swept body (horizontal strokes). */
export function highlighterOutline(points: Pt[], tipW: number, tipH: number): string {
  const [x0, y0] = points[0];
  const [xn, yn] = points[points.length - 1];
  const hw = tipW / 2, hh = tipH / 2;
  const tip = `M${x0 - hw},${y0 - hh}L${x0 + hw},${y0 - hh}L${x0 + hw},${y0 + hh}L${x0 - hw},${y0 + hh}L${x0 - hw},${y0 - hh}`;
  const body = `M${x0},${y0 - hh}L${xn},${yn - hh}L${xn},${yn + hh}L${x0},${y0 + hh}`;
  return tip + body;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A real, valid RGB PNG. */
export function makePng(w: number, h: number, color: (x: number, y: number) => [number, number, number] = () => [200, 40, 40]): Uint8Array {
  const row = w * 3 + 1;
  const raw = new Uint8Array(row * h);
  for (let y = 0; y < h; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < w; x++) raw.set(color(x, y), y * row + 1 + x * 3);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
```

- [ ] **Step 4: Implement `fixtures/catalog.ts`**

```ts
import { strToU8, zipSync } from 'fflate';
import {
  buildExportHtml, buildExportZip, dataUri, highlighterOutline, makePng, penOutline,
  type FxInk, type FxObject, type Pt,
} from './build';

const line = (n: number, step = 1280, y = 0): Pt[] => Array.from({ length: n }, (_, i) => [i * step, y]);

export const PNG_80x40 = makePng(80, 40, (x) => [x * 3, 120, 200]);

// A pen stroke 20 px long, nominal width 4 px (half 256 units), group at canvas (100, 50).
const penGroup = (id = 'pen1', left = 100, top = 50): FxInk => ({
  kind: 'ink', id, left, top, viewBox: [-3, -3, 26, 6], tool: 'PenStroke',
  strokes: [{ fill: 'rgba(31,31,31,1)', points: line(3), outline: penOutline(line(3), [256, 256, 256]) }],
});

// Half-widths ramp 128→512 units (widths 2→8 px) over 11 points; nominal 8 px.
const RAMP = Array.from({ length: 11 }, (_, i) => 128 + (384 * i) / 10);
const variableGroup: FxInk = {
  kind: 'ink', id: 'var1', left: 0, top: 0, viewBox: [-1, -5, 102, 10], tool: 'PenStroke',
  strokes: [{ fill: 'rgba(231,18,36,1)', points: line(11), outline: penOutline(line(11), RAMP) }],
};

// Chisel tip 595×1190 units (4.6484 × 9.2969 px): width should be the long side.
const hlGroup = (id = 'hl1'): FxInk => ({
  kind: 'ink', id, left: 300, top: 300, viewBox: [-3, -5, 30, 10], tool: 'Highlighter',
  strokes: [{ fill: 'rgba(253,132,45,0.4000000059604645)', points: line(3), outline: highlighterOutline(line(3), 595, 1190) }],
});

const galaxyGroup: FxInk = {
  kind: 'ink', id: 'gal1', left: 10, top: 10, viewBox: [-4, -4, 28, 8], tool: 'PenStroke',
  strokes: [{ fill: '', texture: 'galaxy', points: line(3), outline: penOutline(line(3), [448, 448, 448]) }],
};

const image = { kind: 'image' as const, id: 'img1', left: 300, top: 200, w: 40, h: 20, src: dataUri(PNG_80x40) };

const sticky = '<div class="anchor includedInExportedPdf align topLeft" data-whiteboard-type="StickyNote" data-apikey="note1" style="left: 10px; top: 20px; transform: matrix(1, 0, 0, 1, 0, 0);"><div class="canvasChild"><div class="noteBody" style="width: 100px; height: 80px;">secret text from a note</div></div></div>';

const zipOf = (objects: FxObject[], opts?: Parameters<typeof buildExportZip>[1]) =>
  buildExportZip(buildExportHtml({ view: { tx: 50, ty: 20, scale: 0.5 }, objects }), opts);

export const FIXTURES: Record<string, () => Uint8Array> = {
  'pen-basic': () => zipOf([penGroup()]),
  'pen-variable-width': () => zipOf([variableGroup]),
  'highlighter': () => zipOf([hlGroup()]),
  'texture-galaxy': () => zipOf([galaxyGroup]),
  'image-centered': () => zipOf([image]),
  'multi-group-order': () => zipOf([penGroup('a'), image, hlGroup('b'), { kind: 'raw', html: sticky }]),
  'unknown-type': () => zipOf([{ kind: 'raw', html: sticky }]),
  'malformed-stroke': () => zipOf([{
    ...penGroup('bad'),
    strokes: [penGroup().strokes[0], { fill: 'rgba(0,0,0,1)', points: [[0, 0]], rawPoints: 'abc def', outline: 'M0,0L1,1' }],
  }]),
  'single-point': () => zipOf([{
    kind: 'ink', id: 'dot', left: 5, top: 5, viewBox: [-2, -2, 4, 4], tool: 'PenStroke',
    strokes: [{ fill: 'rgba(0,0,0,1)', points: [[0, 0]], outline: penOutline([[0, 0]], [192]) }],
  }]),
  'rotated-group': () => zipOf([{ ...penGroup('rot'), matrix: [0, 1, -1, 0] }]),
  'external-image': () => zipOf([{ ...image, src: 'https://example.invalid/picture.png' }]),
  'with-comments': () => zipOf([penGroup()], { comments: '{"description":"x","commentThreads":[{"id":"t1"}]}' }),
  'bad-comments': () => zipOf([penGroup()], { comments: '{not json' }),
  'no-comments': () => zipOf([penGroup()], { comments: null }),
  'not-a-zip': () => strToU8('this is not a zip file'),
  'no-html': () => zipSync({ 'Board-comments.json': strToU8('{}') }),
  'no-canvas': () => buildExportZip('<html><body><p>hello</p></body></html>'),
};
```

- [ ] **Step 5: Implement `fixtures/generate.ts`**

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FIXTURES } from './catalog';

const out = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(out, { recursive: true });
for (const [name, make] of Object.entries(FIXTURES)) {
  writeFileSync(`${out}${name}.zip`, make());
  console.log(`wrote fixtures/out/${name}.zip`);
}
```

- [ ] **Step 6: Run tests and the generator**

Run: `npx vitest run packages/core/test/fixtures.test.ts && npm run fixtures && npm run typecheck`
Expected: PASS; 17 ZIPs written to `packages/core/fixtures/out/` (git-ignored).

- [ ] **Step 7: Commit**

```bash
git add packages/core/fixtures packages/core/test/fixtures.test.ts
git commit -m "test(core): synthetic Whiteboard export fixtures"
```

---

### Task 7: Importer, part 1: ZIP limits, HTML, and ink

**Files:**
- Create: `packages/core/src/import/whiteboard/unzip.ts`, `dom.ts`, `css.ts`, `context.ts`, `ink.ts`, `index.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/import-ink.test.ts`

**Interfaces:**
- Consumes: geometry and path functions, `parseCssColor`, `WHITE`, `ChalkError`, `round4`, types.
- Produces:
  - `interface ExportLimits { maxEntries; maxTotalBytes; maxEntryBytes }`, `DEFAULT_LIMITS`, `readExportZip(bytes, limits)`
  - `interface RescueReport { counts: { groups; strokes; points; images; unsupported: Record<string, number> }; substitutions: { texture: string; strokes: number }[]; skipped: { sourceId: string | null; reason: string }[]; warnings: string[] }`
  - `interface RescueResult { board; assets: Map<string, Uint8Array>; extensions: Map<string, Uint8Array>; report }`
  - `interface RescueOptions { idGen?: IdGen; limits?: ExportLimits }`
  - `rescueWhiteboardZip(bytes, opts?): RescueResult`. This task handles ink; images and unsupported objects arrive in Task 8. In this task, every non-ink anchor is skipped with reason `"not imported yet"`; Task 8 replaces that.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/import-ink.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { rescueWhiteboardZip, seqIds, ChalkError, applyAffine, type ExportLimits, type Group } from '../src/index';
import { FIXTURES } from '../fixtures/catalog';

const rescue = (name: string, limits?: ExportLimits) =>
  rescueWhiteboardZip(FIXTURES[name](), { idGen: seqIds(), limits });
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ChalkError).code; } return 'none'; };

describe('ink import', () => {
  it('imports a pen group with correct placement and width', () => {
    const r = rescue('pen-basic');
    expect(r.report.counts).toMatchObject({ groups: 1, strokes: 1, points: 3, images: 0 });
    const g = r.board.objects[0] as Group;
    expect(g.kind).toBe('group');
    expect(g.source).toEqual({ system: 'ms-whiteboard', id: 'pen1' });
    // Fixture anchors the group at canvas (100, 50); e,f equal the viewBox origin.
    expect(applyAffine(g.transform, 0, 0)).toEqual([100, 50]);
    const s = g.children[0];
    expect(s.points).toEqual([0, 0, 10, 0, 20, 0]);
    expect(s.width).toBe(4); // from arc radius, NOT the 8140.93 hit-test width
    expect(s.color).toEqual({ r: 31, g: 31, b: 31, a: 1 });
    expect(s.tool).toBe('pen');
    expect(s.sourceOutline!.startsWith('M0,2')).toBe(true);
  });
  it('recovers per-point widths within 5% for interior points', () => {
    const s = (rescue('pen-variable-width').board.objects[0] as Group).children[0];
    expect(s.width).toBe(8);
    for (let i = 1; i < 10; i++) {
      const expected = (2 * (128 + (384 * i) / 10)) / 128;
      expect(Math.abs(s.widths![i] - expected) / expected).toBeLessThan(0.05);
    }
  });
  it('imports highlighters using the long side of the tip, without per-point widths', () => {
    const s = (rescue('highlighter').board.objects[0] as Group).children[0];
    expect(s.tool).toBe('highlighter');
    expect(s.width).toBe(9.2969);
    expect(s.color.a).toBe(0.4);
    expect(s.widths).toBeUndefined();
  });
  it('maps textured pens to a ChalkSmith texture and reports the substitution', () => {
    const r = rescue('texture-galaxy');
    const s = (r.board.objects[0] as Group).children[0];
    expect(s.brush).toEqual({ kind: 'texture', name: 'galaxy', origin: [0, 0], scale: 0.5 });
    expect(s.color).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(r.report.substitutions).toEqual([{ texture: 'galaxy', strokes: 1 }]);
  });
  it('reads background and view', () => {
    const r = rescue('pen-basic');
    expect(r.board.background.color).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(r.board.view).toEqual({ x: -100, y: -40, zoom: 0.5 });
  });
  it('skips malformed strokes but keeps the rest of the group', () => {
    const r = rescue('malformed-stroke');
    expect(r.report.counts.strokes).toBe(1);
    expect(r.report.skipped).toHaveLength(1);
    expect(r.report.skipped[0].sourceId).toBe('bads1');
  });
  it('warns about rotated groups', () => {
    expect(rescue('rotated-group').report.warnings.some((w) => w.includes('rotated or scaled'))).toBe(true);
  });
  it('never contacts the network', () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('network used'); });
    try { rescue('texture-galaxy'); } finally { spy.mockRestore(); }
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('whole-file errors', () => {
  it('rejects non-zips, missing html, missing canvas', () => {
    expect(code(() => rescue('not-a-zip'))).toBe('NotAZip');
    expect(code(() => rescue('no-html'))).toBe('NoBoardHtml');
    expect(code(() => rescue('no-canvas'))).toBe('NoBoardHtml');
  });
  it('enforces size limits', () => {
    expect(code(() => rescue('pen-basic', { maxEntries: 64, maxTotalBytes: 1024 ** 3, maxEntryBytes: 100 }))).toBe('TooLarge');
    expect(code(() => rescue('pen-basic', { maxEntries: 1, maxTotalBytes: 1024 ** 3, maxEntryBytes: 1024 ** 3 }))).toBe('TooLarge');
    expect(code(() => rescue('pen-basic', { maxEntries: 64, maxTotalBytes: 100, maxEntryBytes: 1024 ** 3 }))).toBe('TooLarge');
  });
  it('does not modify the input bytes', () => {
    const bytes = FIXTURES['pen-basic']();
    const copy = bytes.slice();
    rescueWhiteboardZip(bytes);
    expect(bytes).toEqual(copy);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/import-ink.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `unzip.ts`**

```ts
import { strFromU8, unzipSync } from 'fflate';
import { ChalkError } from '../../errors';

export interface ExportLimits { maxEntries: number; maxTotalBytes: number; maxEntryBytes: number }
export const DEFAULT_LIMITS: ExportLimits = { maxEntries: 64, maxTotalBytes: 256 * 2 ** 20, maxEntryBytes: 128 * 2 ** 20 };

export interface ExportEntries { htmlName: string; html: string; comments: Uint8Array | null }

const mb = (n: number) => Math.round(n / 2 ** 20);

export function readExportZip(bytes: Uint8Array, limits: ExportLimits = DEFAULT_LIMITS): ExportEntries {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new ChalkError('NotAZip', 'This file is not a valid Whiteboard export (it is not a ZIP archive).');
  }
  let count = 0;
  let total = 0;
  const tooLarge = (msg: string) => new ChalkError('TooLarge', msg);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        count++;
        if (count > limits.maxEntries) throw tooLarge(`The export contains more than ${limits.maxEntries} files.`);
        if (f.originalSize > limits.maxEntryBytes) throw tooLarge(`"${f.name}" is larger than ${mb(limits.maxEntryBytes)} MB.`);
        total += f.originalSize;
        if (total > limits.maxTotalBytes) throw tooLarge(`The export is larger than ${mb(limits.maxTotalBytes)} MB when unpacked.`);
        return true;
      },
    });
  } catch (e) {
    if (e instanceof ChalkError) throw e;
    throw new ChalkError('NotAZip', 'This file is not a valid Whiteboard export (the ZIP archive could not be read).');
  }
  let actual = 0;
  for (const [name, data] of Object.entries(files)) {
    if (data.length > limits.maxEntryBytes) throw tooLarge(`"${name}" is larger than ${mb(limits.maxEntryBytes)} MB.`);
    actual += data.length;
    if (actual > limits.maxTotalBytes) throw tooLarge(`The export is larger than ${mb(limits.maxTotalBytes)} MB when unpacked.`);
  }
  const top = Object.keys(files).filter((n) => !n.includes('/') && !n.endsWith('/'));
  const htmls = top.filter((n) => /\.html?$/i.test(n));
  if (htmls.length !== 1) {
    throw new ChalkError('NoBoardHtml', htmls.length === 0
      ? 'The ZIP does not contain a Whiteboard board (.html file).'
      : 'The ZIP contains more than one .html file; expected exactly one board.');
  }
  const commentsName = top.find((n) => n.toLowerCase().endsWith('-comments.json')) ?? null;
  return { htmlName: htmls[0], html: strFromU8(files[htmls[0]]), comments: commentsName ? files[commentsName] : null };
}
```

- [ ] **Step 4: Implement `dom.ts` and `css.ts`**

`dom.ts`:
```ts
import { parse, type DefaultTreeAdapterMap } from 'parse5';

export type Node = DefaultTreeAdapterMap['node'];
export type Element = DefaultTreeAdapterMap['element'];
export type Document = DefaultTreeAdapterMap['document'];

export const parseHtml = (html: string): Document => parse(html);

export function isElement(n: Node): n is Element {
  return 'tagName' in n;
}

function kids(n: Node): Node[] {
  return (n as { childNodes?: Node[] }).childNodes ?? [];
}

export function attr(el: Element, name: string): string | null {
  const lower = name.toLowerCase();
  const a = el.attrs.find((x) => x.name.toLowerCase() === lower);
  return a ? a.value : null;
}

export function hasClass(el: Element, c: string): boolean {
  return (attr(el, 'class') ?? '').split(/\s+/).includes(c);
}

export function childElements(el: Node): Element[] {
  return kids(el).filter(isElement);
}

export function* descendants(root: Node): Generator<Element> {
  const stack = [...kids(root)].reverse();
  while (stack.length) {
    const n = stack.pop()!;
    if (!isElement(n)) continue;
    yield n;
    const c = kids(n);
    for (let i = c.length - 1; i >= 0; i--) stack.push(c[i]);
  }
}

export function findFirst(root: Node, pred: (e: Element) => boolean): Element | null {
  for (const e of descendants(root)) if (pred(e)) return e;
  return null;
}

export function findAll(root: Node, pred: (e: Element) => boolean): Element[] {
  const out: Element[] = [];
  for (const e of descendants(root)) if (pred(e)) out.push(e);
  return out;
}

export const tag = (name: string) => (e: Element) => e.tagName.toLowerCase() === name;
```

`css.ts`:
```ts
import type { Affine } from '../../model/types';

const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;

export function parseStyle(style: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!style) return out;
  for (const part of style.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

export function px(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.match(new RegExp(String.raw`^(${NUM})px$`));
  return m ? Number(m[1]) : null;
}

export function parseMatrix(t: string | undefined): Affine {
  const m = t?.match(new RegExp(String.raw`matrix\(\s*(${NUM})\s*,\s*(${NUM})\s*,\s*(${NUM})\s*,\s*(${NUM})\s*,\s*(${NUM})\s*,\s*(${NUM})\s*\)`));
  return m ? [1, 2, 3, 4, 5, 6].map((i) => Number(m[i])) as Affine : [1, 0, 0, 1, 0, 0];
}

export function parseTranslateScale(t: string | undefined): { tx: number; ty: number; scale: number } | null {
  const m = t?.match(new RegExp(String.raw`translate\(\s*(${NUM})px\s*,\s*(${NUM})px\s*\)\s*scale\(\s*(${NUM})\s*\)`));
  return m ? { tx: Number(m[1]), ty: Number(m[2]), scale: Number(m[3]) } : null;
}

export function parsePatternTransform(t: string | null): { tx: number; ty: number; scale: number } | null {
  const m = t?.match(new RegExp(String.raw`translate\(\s*(${NUM})[\s,]+(${NUM})\s*\)\s*scale\(\s*(${NUM})`));
  return m ? { tx: Number(m[1]), ty: Number(m[2]), scale: Number(m[3]) } : null;
}

export const isIdentityLinear = (m: Affine) => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1;
```

- [ ] **Step 5: Implement `context.ts` and `ink.ts`**

`context.ts`:
```ts
import type { BoardObject, IdGen } from '../../model/types';

export interface RescueReport {
  counts: { groups: number; strokes: number; points: number; images: number; unsupported: Record<string, number> };
  substitutions: { texture: string; strokes: number }[];
  skipped: { sourceId: string | null; reason: string }[];
  warnings: string[];
}

export interface ImportCtx {
  idGen: IdGen;
  skipped: RescueReport['skipped'];
  warnings: Set<string>;
  substitutions: Map<string, number>;
  unsupported: Record<string, number>;
  transformed: number;
}

export function newCtx(idGen: IdGen): ImportCtx {
  return { idGen, skipped: [], warnings: new Set(), substitutions: new Map(), unsupported: {}, transformed: 0 };
}

export function skip(ctx: ImportCtx, sourceId: string | null, reason: string): void {
  ctx.skipped.push({ sourceId, reason });
}

export function buildReport(ctx: ImportCtx, objects: BoardObject[]): RescueReport {
  let groups = 0, strokes = 0, points = 0, images = 0;
  for (const o of objects) {
    if (o.kind === 'group') {
      groups++;
      strokes += o.children.length;
      for (const c of o.children) points += c.points.length / 2;
    } else if (o.kind === 'stroke') {
      strokes++;
      points += o.points.length / 2;
    } else if (o.kind === 'image') images++;
  }
  if (ctx.transformed > 0) ctx.warnings.add(`${ctx.transformed} object(s) are rotated or scaled; check their placement.`);
  return {
    counts: { groups, strokes, points, images, unsupported: { ...ctx.unsupported } },
    substitutions: [...ctx.substitutions].map(([texture, n]) => ({ texture, strokes: n })),
    skipped: ctx.skipped,
    warnings: [...ctx.warnings],
  };
}
```

`ink.ts`:
```ts
import { WHITE, parseCssColor } from '../../model/color';
import type { Affine, Brush, Group, RGBA, Stroke, TextureName } from '../../model/types';
import { formatPath, mapPath, parsePath } from '../../geometry/path';
import { highlighterWidth, penWidth, perPointWidths } from '../../geometry/width';
import { round4 } from '../../util/round';
import { isIdentityLinear, parseMatrix, parsePatternTransform, parseStyle, px } from './css';
import { attr, findAll, findFirst, hasClass, tag, type Element } from './dom';
import { skip, type ImportCtx } from './context';

const TEXTURES: Record<string, TextureName> = { '#galaxy-pen': 'galaxy', '#rainbow-pen': 'rainbow' };
const source = (id: string | null) => (id ? { source: { system: 'ms-whiteboard' as const, id } } : {});

function readTexture(g: Element): Brush | null {
  const pattern = findFirst(g, tag('pattern'));
  const use = pattern && findFirst(pattern, tag('use'));
  const href = use && (attr(use, 'href') ?? attr(use, 'xlink:href'));
  const name = href ? TEXTURES[href] : undefined;
  if (!pattern || !name) return null;
  const pt = parsePatternTransform(attr(pattern, 'patternTransform'));
  return {
    kind: 'texture', name,
    origin: pt ? [round4(pt.tx / 128), round4(pt.ty / 128)] : [0, 0],
    scale: pt && pt.scale > 0 ? round4(pt.scale) : 1,
  };
}

export function importStroke(g: Element, tool: 'pen' | 'highlighter', ctx: ImportCtx): Stroke {
  const path = findFirst(g, tag('path'));
  const poly = findFirst(g, (e) => tag('polyline')(e) && hasClass(e, 'inkHitTestOverlay')) ?? findFirst(g, tag('polyline'));
  if (!path || !poly) throw new Error('missing outline path or centerline polyline');
  const segs = mapPath(parsePath(attr(path, 'd') ?? ''), 1 / 128, 0, 0);
  if (segs.length === 0) throw new Error('empty outline');
  const raw = (attr(poly, 'points') ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (raw.length < 2 || raw.length % 2 !== 0 || raw.some((n) => !Number.isFinite(n))) throw new Error('invalid centerline points');
  const points = raw.map((v) => round4(v / 128));

  const fill = (attr(path, 'fill') ?? '').trim();
  let color: RGBA;
  let brush: Brush;
  if (/^url\(/i.test(fill)) {
    const tex = readTexture(g);
    if (tex && tex.kind === 'texture') {
      brush = tex;
      color = { ...WHITE };
      ctx.substitutions.set(tex.name, (ctx.substitutions.get(tex.name) ?? 0) + 1);
    } else {
      brush = { kind: 'solid' };
      color = { r: 128, g: 128, b: 128, a: 1 };
      ctx.warnings.add('Some strokes use an unknown texture and were imported in grey.');
    }
  } else {
    const c = parseCssColor(fill);
    if (!c) throw new Error(`unrecognised colour "${fill}"`);
    color = c;
    brush = { kind: 'solid' };
  }

  const width = round4(tool === 'pen' ? penWidth(segs, points) : highlighterWidth(segs, points));
  if (!(width > 0)) throw new Error('could not determine stroke width');
  const s: Stroke = {
    kind: 'stroke', id: ctx.idGen(), ...source(attr(g, 'id')),
    tool, color, width, points, brush, sourceOutline: formatPath(segs),
  };
  if (tool === 'pen') s.widths = perPointWidths(points, segs, width);
  return s;
}

export function importInkGroup(anchor: Element, ctx: ImportCtx): Group | null {
  const sourceId = attr(anchor, 'data-apikey');
  const svg = findFirst(anchor, (e) => tag('svg')(e) && hasClass(e, 'inkGroup'));
  if (!svg) { skip(ctx, sourceId, 'ink group has no drawing'); return null; }
  const vb = (attr(svg, 'viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) { skip(ctx, sourceId, 'ink group has an invalid viewBox'); return null; }
  const st = parseStyle(attr(anchor, 'style'));
  const L = px(st.left) ?? 0;
  const T = px(st.top) ?? 0;
  const m = parseMatrix(st.transform);
  const [a, b, c, d, e, f] = m;
  const [vx, vy] = vb;
  const transform = [a, b, c, d, L + e - (a * vx + c * vy), T + f - (b * vx + d * vy)].map(round4) as Affine;
  if (!isIdentityLinear(m)) ctx.transformed++;

  const tool = hasClass(svg, 'Highlighter') ? 'highlighter' : 'pen';
  const children: Stroke[] = [];
  for (const g of findAll(svg, (el) => tag('g')(el) && hasClass(el, 'inkStroke'))) {
    try {
      children.push(importStroke(g, tool, ctx));
    } catch (err) {
      skip(ctx, attr(g, 'id'), `stroke could not be read: ${(err as Error).message}`);
    }
  }
  if (children.length === 0) { skip(ctx, sourceId, 'ink group contains no readable strokes'); return null; }
  return { kind: 'group', id: ctx.idGen(), ...source(sourceId), transform, children };
}
```

- [ ] **Step 6: Implement `index.ts` (rescue entry point)**

`packages/core/src/import/whiteboard/index.ts`:
```ts
import { strFromU8 } from 'fflate';
import { ChalkError } from '../../errors';
import { WHITE, parseCssColor } from '../../model/color';
import { randomId, type Board, type BoardObject, type IdGen } from '../../model/types';
import { round4 } from '../../util/round';
import { buildReport, newCtx, skip, type RescueReport } from './context';
import { parseStyle, parseTranslateScale } from './css';
import { attr, childElements, findFirst, hasClass, parseHtml, tag } from './dom';
import { importInkGroup } from './ink';
import { DEFAULT_LIMITS, readExportZip, type ExportLimits } from './unzip';

export type { RescueReport } from './context';
export { DEFAULT_LIMITS, type ExportLimits } from './unzip';

export interface RescueResult {
  board: Board;
  assets: Map<string, Uint8Array>;
  extensions: Map<string, Uint8Array>;
  report: RescueReport;
}

export interface RescueOptions { idGen?: IdGen; limits?: ExportLimits }

export const COMMENTS_EXTENSION = 'extensions/ms-whiteboard/comments.json';

/** Convert a Whiteboard Full Export ZIP into a ChalkSmith board. Pure: no I/O, no network. */
export function rescueWhiteboardZip(bytes: Uint8Array, opts: RescueOptions = {}): RescueResult {
  const entries = readExportZip(bytes, opts.limits ?? DEFAULT_LIMITS);
  const doc = parseHtml(entries.html);
  const canvas = findFirst(doc, (e) => attr(e, 'id') === 'canvasContent');
  if (!canvas) throw new ChalkError('NoBoardHtml', 'The .html file in this ZIP is not a Whiteboard board (no canvas found).');

  const ctx = newCtx(opts.idGen ?? randomId);
  const boardId = ctx.idGen();
  const assets = new Map<string, Uint8Array>();
  const objects: BoardObject[] = [];

  for (const anchor of childElements(canvas)) {
    if (!hasClass(anchor, 'anchor')) continue;
    const type = attr(anchor, 'data-whiteboard-type') ?? 'unknown';
    const sourceId = attr(anchor, 'data-apikey');
    try {
      if (type === 'InkGroup') {
        const g = importInkGroup(anchor, ctx);
        if (g) objects.push(g);
      } else {
        skip(ctx, sourceId, `${type}: not imported yet`);
      }
    } catch (err) {
      skip(ctx, sourceId, `object could not be read: ${(err as Error).message}`);
    }
  }

  const bgRect = findFirst(doc, (e) => tag('rect')(e) && hasClass(e, 'canvasBackgroundColor'));
  const color = (bgRect && parseCssColor(attr(bgRect, 'fill') ?? '')) || { ...WHITE };
  const tc = findFirst(doc, (e) => hasClass(e, 'transformComponent'));
  const ts = tc ? parseTranslateScale(parseStyle(attr(tc, 'style')).transform) : null;
  const view = ts && ts.scale > 0 ? { x: round4(-ts.tx / ts.scale), y: round4(-ts.ty / ts.scale), zoom: round4(ts.scale) } : undefined;

  const extensions = new Map<string, Uint8Array>();
  if (entries.comments) {
    try {
      JSON.parse(strFromU8(entries.comments));
      extensions.set(COMMENTS_EXTENSION, entries.comments);
    } catch {
      ctx.warnings.add('The comments file is not valid JSON and was not kept.');
    }
  } else {
    ctx.warnings.add('The export has no comments file.');
  }

  const board: Board = { id: boardId, background: { color }, ...(view ? { view } : {}), objects };
  return { board, assets, extensions, report: buildReport(ctx, objects) };
}
```

Add to `packages/core/src/index.ts`:
```ts
export * from './import/whiteboard/index';
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run packages/core/test/import-ink.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core
git commit -m "feat(core): Whiteboard export import for ink groups"
```

---

### Task 8: Importer, part 2: images, unknown objects, comments

**Files:**
- Create: `packages/core/src/import/whiteboard/image.ts`, `unsupported.ts`
- Modify: `packages/core/src/import/whiteboard/index.ts`
- Test: `packages/core/test/import-other.test.ts`

**Interfaces:**
- Consumes: `sha256Hex`, `base64ToBytes`, `sniffImage`, `imageSize`, dom/css helpers, `ImportCtx`.
- Produces: `importImage(anchor, ctx, assets): ImageObj | null`; `importUnsupported(anchor, type, ctx): Unsupported`. `rescueWhiteboardZip` now handles `AzureImage`/`Image` and maps every other type to `Unsupported`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/import-other.test.ts`:
```ts
import { strFromU8 } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { rescueWhiteboardZip, seqIds, sha256Hex, COMMENTS_EXTENSION, type ImageObj, type Unsupported } from '../src/index';
import { FIXTURES, PNG_80x40 } from '../fixtures/catalog';

const rescue = (name: string) => rescueWhiteboardZip(FIXTURES[name](), { idGen: seqIds() });

describe('images', () => {
  it('places centre-anchored images and stores bytes by hash', () => {
    const r = rescue('image-centered');
    const im = r.board.objects[0] as ImageObj;
    expect(im).toMatchObject({ kind: 'image', x: 280, y: 190, w: 40, h: 20, intrinsic: { w: 80, h: 40 } });
    expect(im.asset).toBe(`assets/${sha256Hex(PNG_80x40)}.png`);
    expect(r.assets.get(im.asset)).toEqual(PNG_80x40);
    expect(r.report.counts.images).toBe(1);
  });
  it('never downloads external images', () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('network used'); });
    let r;
    try { r = rescue('external-image'); } finally { spy.mockRestore(); }
    expect(spy).not.toHaveBeenCalled();
    expect(r!.board.objects).toHaveLength(0);
    expect(r!.report.skipped[0].reason).toMatch(/not embedded/);
    expect(JSON.stringify(r!.board)).not.toContain('example.invalid');
  });
});

describe('unknown objects', () => {
  it('become placeholders with a bbox and no copied content', () => {
    const r = rescue('unknown-type');
    const u = r.board.objects[0] as Unsupported;
    expect(u).toMatchObject({ kind: 'unsupported', sourceType: 'StickyNote', bbox: { x: 10, y: 20, w: 100, h: 80 } });
    expect(r.report.counts.unsupported).toEqual({ StickyNote: 1 });
    expect(JSON.stringify(r.board)).not.toContain('secret text');
  });
  it('keeps document order across types', () => {
    const kinds = rescue('multi-group-order').board.objects.map((o) => o.kind);
    expect(kinds).toEqual(['group', 'image', 'group', 'unsupported']);
  });
});

describe('degenerate strokes', () => {
  it('import a single-point stroke without NaN', () => {
    const r = rescue('single-point');
    expect(r.report.counts.strokes).toBe(1);
    expect(JSON.stringify(r.board)).not.toContain('null');
    expect(JSON.stringify(r.board)).not.toMatch(/NaN|Infinity/);
  });
});

describe('comments', () => {
  it('keeps valid comments verbatim', () => {
    const r = rescue('with-comments');
    expect(strFromU8(r.extensions.get(COMMENTS_EXTENSION)!)).toContain('"t1"');
  });
  it('warns on invalid or missing comments', () => {
    expect(rescue('bad-comments').report.warnings).toContain('The comments file is not valid JSON and was not kept.');
    expect(rescue('no-comments').report.warnings).toContain('The export has no comments file.');
    expect(rescue('bad-comments').extensions.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/import-other.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `image.ts`**

```ts
import type { ImageObj } from '../../model/types';
import { base64ToBytes } from '../../util/base64';
import { imageSize, sniffImage } from '../../util/image';
import { round4 } from '../../util/round';
import { sha256Hex } from '../../util/sha256';
import { skip, type ImportCtx } from './context';
import { isIdentityLinear, parseMatrix, parseStyle, px } from './css';
import { attr, findFirst, hasClass, tag, type Element } from './dom';

export function importImage(anchor: Element, ctx: ImportCtx, assets: Map<string, Uint8Array>): ImageObj | null {
  const sourceId = attr(anchor, 'data-apikey');
  const img = findFirst(anchor, tag('img'));
  if (!img) { skip(ctx, sourceId, 'image element is missing'); return null; }
  const m = (attr(img, 'src') ?? '').match(/^data:([^,]*?),(.*)$/s);
  if (!m) { skip(ctx, sourceId, 'image is not embedded in the export (external images are never downloaded)'); return null; }
  if (!/;base64$/i.test(m[1])) { skip(ctx, sourceId, 'embedded image is not base64-encoded'); return null; }
  let bytes: Uint8Array;
  try { bytes = base64ToBytes(m[2]); } catch { skip(ctx, sourceId, 'embedded image data is corrupt'); return null; }
  const kind = sniffImage(bytes);
  if (!kind) { skip(ctx, sourceId, 'embedded image format is not recognised'); return null; }
  const intrinsic = imageSize(bytes, kind);

  const box = findFirst(anchor, (e) => hasClass(e, 'imageComponent'));
  const bs = parseStyle(box ? attr(box, 'style') : null);
  const is = parseStyle(attr(img, 'style'));
  const w = px(bs.width) ?? px(is['max-width']) ?? intrinsic?.w ?? null;
  const h = px(bs.height) ?? px(is['max-height']) ?? intrinsic?.h ?? null;
  if (!w || !h) { skip(ctx, sourceId, 'image size is unknown'); return null; }

  const st = parseStyle(attr(anchor, 'style'));
  const L = px(st.left) ?? 0;
  const T = px(st.top) ?? 0;
  const mtx = parseMatrix(st.transform);
  if (!isIdentityLinear(mtx)) ctx.transformed++;
  const centered = hasClass(anchor, 'center');
  const asset = `assets/${sha256Hex(bytes)}.${kind.ext}`;
  assets.set(asset, bytes);
  if (!intrinsic) ctx.warnings.add('Some images have an unreadable size header; their display size was used.');
  return {
    kind: 'image',
    id: ctx.idGen(),
    ...(sourceId ? { source: { system: 'ms-whiteboard' as const, id: sourceId } } : {}),
    asset,
    x: round4(L + mtx[4] - (centered ? w / 2 : 0)),
    y: round4(T + mtx[5] - (centered ? h / 2 : 0)),
    w: round4(w),
    h: round4(h),
    intrinsic: intrinsic ?? { w: round4(w), h: round4(h) },
  };
}
```

- [ ] **Step 4: Implement `unsupported.ts`**

```ts
import type { Bbox, Unsupported } from '../../model/types';
import { round4 } from '../../util/round';
import type { ImportCtx } from './context';
import { parseMatrix, parseStyle, px } from './css';
import { attr, findFirst, hasClass, type Element } from './dom';

/** A placeholder: type and bounding box only. Inner content (e.g. note text) is never copied. */
export function importUnsupported(anchor: Element, type: string, ctx: ImportCtx): Unsupported {
  const sourceId = attr(anchor, 'data-apikey');
  const st = parseStyle(attr(anchor, 'style'));
  const L = px(st.left);
  const T = px(st.top);
  const [, , , , e, f] = parseMatrix(st.transform);
  let bbox: Bbox | null = null;
  if (L !== null && T !== null) {
    const sized = findFirst(anchor, (el) => {
      const s = parseStyle(attr(el, 'style'));
      return px(s.width) !== null && px(s.height) !== null;
    });
    if (sized) {
      const s = parseStyle(attr(sized, 'style'));
      const w = px(s.width)!, h = px(s.height)!;
      const centered = hasClass(anchor, 'center');
      bbox = { x: round4(L + e - (centered ? w / 2 : 0)), y: round4(T + f - (centered ? h / 2 : 0)), w: round4(w), h: round4(h) };
    } else {
      bbox = { x: round4(L + e), y: round4(T + f), w: 0, h: 0 };
    }
  }
  ctx.unsupported[type] = (ctx.unsupported[type] ?? 0) + 1;
  return {
    kind: 'unsupported',
    id: ctx.idGen(),
    ...(sourceId ? { source: { system: 'ms-whiteboard' as const, id: sourceId } } : {}),
    sourceType: type,
    bbox,
  };
}
```

- [ ] **Step 5: Wire into `index.ts`**

In `packages/core/src/import/whiteboard/index.ts`, add imports:
```ts
import { importImage } from './image';
import { importUnsupported } from './unsupported';
```
Replace the `else { skip(ctx, sourceId, \`${type}: not imported yet\`); }` branch with:
```ts
      } else if (type === 'AzureImage' || type === 'Image') {
        const im = importImage(anchor, ctx, assets);
        if (im) objects.push(im);
      } else {
        objects.push(importUnsupported(anchor, type, ctx));
      }
```

- [ ] **Step 6: Run all core tests**

Run: `npx vitest run packages/core && npm run typecheck`
Expected: PASS (including Task 7's tests).

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): import images and unknown objects as placeholders"
```

---

### Task 9: SVG export and golden files

**Files:**
- Create: `packages/core/src/export/svg.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/svg.test.ts`, `packages/core/test/golden.test.ts` (creates `test/golden/*`)

**Interfaces:**
- Consumes: `strokeOutline`, `boardBounds`, `rgbaToCss`, `bytesToBase64`, `mimeForAsset`, `galaxyStars`, `GALAXY_BASE`, `RAINBOW_STOPS`, `TEXTURE_TILE`, `round4`.
- Produces: `boardToSvg(board, assets): string`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/svg.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { boardToSvg, type Board } from '../src/index';

const empty: Board = { id: 'b', background: { color: { r: 255, g: 255, b: 255, a: 1 } }, objects: [] };

describe('boardToSvg', () => {
  it('exports an empty board without NaN', () => {
    const svg = boardToSvg(empty, new Map());
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg).not.toMatch(/NaN|Infinity/);
  });
  it('escapes unusual type names', () => {
    const b: Board = { ...empty, objects: [{ kind: 'unsupported', id: 'u', sourceType: '<Note "x" & y>', bbox: { x: 0, y: 0, w: 10, h: 10 } }] };
    const svg = boardToSvg(b, new Map());
    expect(svg).toContain('&lt;Note &quot;x&quot; &amp; y&gt;');
    expect(svg).not.toContain('<Note');
  });
  it('embeds images and draws missing assets as placeholders', () => {
    const asset = 'assets/' + 'b'.repeat(64) + '.png';
    const b: Board = { ...empty, objects: [{ kind: 'image', id: 'i', asset, x: 0, y: 0, w: 4, h: 2, intrinsic: { w: 4, h: 2 } }] };
    expect(boardToSvg(b, new Map([[asset, new Uint8Array([1, 2, 3])]]))).toContain('href="data:image/png;base64,AQID"');
    expect(boardToSvg(b, new Map())).toContain('stroke-dasharray');
  });
  it('defines textures once and references them', () => {
    const s = { kind: 'stroke' as const, tool: 'pen' as const, color: { r: 255, g: 255, b: 255, a: 1 }, width: 4,
      points: [0, 0, 10, 0], brush: { kind: 'texture' as const, name: 'galaxy' as const, origin: [0, 0] as [number, number], scale: 0.5 } };
    const svg = boardToSvg({ ...empty, objects: [{ ...s, id: 'a' }, { ...s, id: 'b' }] }, new Map());
    expect(svg.match(/id="chalksmith-galaxy"/g)).toHaveLength(1);
    expect(svg.match(/fill="url\(#chalksmith-galaxy\)"/g)).toHaveLength(2);
  });
});
```

`packages/core/test/golden.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { rescueWhiteboardZip, boardToSvg, seqIds } from '../src/index';
import { FIXTURES } from '../fixtures/catalog';

describe('golden output', () => {
  for (const name of ['pen-basic', 'texture-galaxy', 'multi-group-order']) {
    it(name, async () => {
      const r = rescueWhiteboardZip(FIXTURES[name](), { idGen: seqIds() });
      await expect(JSON.stringify(r.board, null, 2) + '\n').toMatchFileSnapshot(`./golden/${name}.board.json`);
      await expect(boardToSvg(r.board, r.assets)).toMatchFileSnapshot(`./golden/${name}.svg`);
    });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/test/svg.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `export/svg.ts`**

```ts
import { boardBounds } from '../geometry/bounds';
import { strokeOutline } from '../geometry/outline';
import { rgbaToCss } from '../model/color';
import type { Bbox, Board, BoardObject, Stroke, TextureName } from '../model/types';
import { GALAXY_BASE, RAINBOW_STOPS, TEXTURE_TILE, galaxyStars } from '../textures';
import { bytesToBase64 } from '../util/base64';
import { mimeForAsset } from '../util/image';
import { round4 } from '../util/round';

const n = (v: number) => String(round4(v));
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function textureDef(name: TextureName): string {
  const T = TEXTURE_TILE;
  if (name === 'galaxy') {
    const stars = galaxyStars().map((s) => `<circle cx="${n(s.x)}" cy="${n(s.y)}" r="${n(s.r)}" fill="#ffffff" fill-opacity="${n(s.alpha)}"/>`).join('');
    return `<pattern id="chalksmith-galaxy" patternUnits="userSpaceOnUse" width="${T}" height="${T}"><rect width="${T}" height="${T}" fill="${GALAXY_BASE}"/>${stars}</pattern>`;
  }
  const stops = RAINBOW_STOPS.map((c, i) => `<stop offset="${n(i / (RAINBOW_STOPS.length - 1))}" stop-color="${c}"/>`).join('');
  return `<linearGradient id="chalksmith-rainbow" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${T}" y2="0" spreadMethod="repeat">${stops}</linearGradient>`;
}

function placeholder(b: Bbox | null, label: string): string {
  const x = b?.x ?? 0, y = b?.y ?? 0, w = Math.max(b?.w ?? 0, 24), h = Math.max(b?.h ?? 0, 24);
  return `<g><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="none" stroke="#888888" stroke-dasharray="4 3"/><text x="${n(x + 4)}" y="${n(y + 14)}" font-family="sans-serif" font-size="10" fill="#666666">${esc(label)}</text></g>`;
}

function strokeSvg(s: Stroke, defs: Set<TextureName>): string {
  const d = strokeOutline(s);
  if (!d) return '';
  let fill = rgbaToCss(s.color);
  if (s.brush.kind === 'texture') {
    defs.add(s.brush.name);
    fill = `url(#chalksmith-${s.brush.name})`;
  }
  return `<path d="${esc(d)}" fill="${fill}"/>`;
}

function objectSvg(o: BoardObject, assets: Map<string, Uint8Array>, defs: Set<TextureName>): string {
  switch (o.kind) {
    case 'stroke':
      return strokeSvg(o, defs);
    case 'group':
      return `<g transform="matrix(${o.transform.map(n).join(' ')})">${o.children.map((c) => strokeSvg(c, defs)).join('')}</g>`;
    case 'image': {
      const bytes = assets.get(o.asset);
      if (!bytes) return placeholder({ x: o.x, y: o.y, w: o.w, h: o.h }, 'missing image');
      return `<image href="data:${mimeForAsset(o.asset)};base64,${bytesToBase64(bytes)}" x="${n(o.x)}" y="${n(o.y)}" width="${n(o.w)}" height="${n(o.h)}" preserveAspectRatio="none"/>`;
    }
    case 'unsupported':
      return placeholder(o.bbox, o.sourceType);
  }
}

export function boardToSvg(board: Board, assets: Map<string, Uint8Array>): string {
  const b = boardBounds(board.objects);
  const m = 16;
  const vb = b ? { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m } : { x: 0, y: 0, w: 100, h: 100 };
  const defs = new Set<TextureName>();
  const body = board.objects.map((o) => objectSvg(o, assets, defs)).filter(Boolean).join('\n');
  const defsXml = defs.size ? `<defs>${[...defs].map(textureDef).join('')}</defs>\n` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(vb.x)} ${n(vb.y)} ${n(vb.w)} ${n(vb.h)}" width="${n(vb.w)}" height="${n(vb.h)}">
${defsXml}<rect x="${n(vb.x)}" y="${n(vb.y)}" width="${n(vb.w)}" height="${n(vb.h)}" fill="${rgbaToCss(board.background.color)}"/>
${body}
</svg>
`;
}
```

Add to `src/index.ts`: `export * from './export/svg';`

- [ ] **Step 4: Run tests and create the golden files**

Run: `npx vitest run packages/core/test/svg.test.ts packages/core/test/golden.test.ts`
Expected: PASS; on first run vitest writes `packages/core/test/golden/*.board.json` and `*.svg`.

Open `packages/core/test/golden/pen-basic.svg` in a browser and check visually that it shows one short dark horizontal stroke. Open `multi-group-order.svg` and check it shows a stroke, a small blue-ish image, an orange translucent highlighter, and a dashed "StickyNote" box. Check that `multi-group-order.board.json` does not contain "secret text".

- [ ] **Step 5: Run the full core suite and typecheck**

Run: `npx vitest run packages/core && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): SVG export with golden-file tests"
```

---

### Task 10: Desktop app scaffold with Tauri shell

**Prerequisite (owner approval #4):** Rust must be installed. Ask the project owner before running these commands.

```powershell
winget install --id Rustlang.Rustup -e
rustup default stable
rustc -V; cargo -V
```
Windows also needs the MSVC C++ build tools. Check with `where link.exe` from a "Developer PowerShell for VS". If they're missing, ask the owner to install "Visual Studio Build Tools" with the "Desktop development with C++" workload. WebView2 is already present on Windows 11. On macOS, run `xcode-select --install`. On Linux, see the CI workflow (Task 15) for the packages.

**Files:**
- Create: `apps/desktop/package.json`, `tsconfig.json`, `vite.config.ts`, `svelte.config.js`, `index.html`, `src/main.ts`, `src/app.css`, `src/ui/App.svelte` (placeholder, replaced in Task 14), `scripts/make-icon.ts`, `app-icon.png` (generated), `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/icons/*` (generated)
- Modify: root `package.json` (typecheck script)
- Test: Rust unit test in `src-tauri/src/lib.rs`

**Interfaces:**
- Produces Tauri commands: `read_file { path: string } → ArrayBuffer`; `write_atomic` (raw body = file bytes, header `x-path` = `encodeURIComponent(path)`) → `null`.

- [ ] **Step 1: Create the frontend package**

Check licences first:
```bash
for p in svelte @sveltejs/vite-plugin-svelte svelte-check vite @tsconfig/svelte @tauri-apps/cli @tauri-apps/api @tauri-apps/plugin-dialog; do echo "$p: $(npm view $p license)"; done
```

`apps/desktop/package.json`:
```json
{
  "name": "@chalksmith/desktop",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "license": "Apache-2.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "check": "svelte-check --tsconfig ./tsconfig.json",
    "tauri": "tauri",
    "icon": "tsx scripts/make-icon.ts && tauri icon app-icon.png"
  },
  "dependencies": {
    "@chalksmith/core": "*"
  }
}
```
Then:
```bash
npm install -w @chalksmith/desktop @tauri-apps/api@2 @tauri-apps/plugin-dialog@2
npm install -w @chalksmith/desktop -D svelte@5 @sveltejs/vite-plugin-svelte svelte-check vite @tsconfig/svelte @tauri-apps/cli@2
```

`apps/desktop/tsconfig.json`:
```json
{
  "extends": "@tsconfig/svelte/tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "src/**/*.svelte", "scripts/**/*.ts"]
}
```

`apps/desktop/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  build: { target: 'es2022' },
});
```

`apps/desktop/svelte.config.js`:
```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default { preprocess: vitePreprocess() };
```

`apps/desktop/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ChalkSmith</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`apps/desktop/src/main.ts`:
```ts
import { mount } from 'svelte';
import App from './ui/App.svelte';
import './app.css';

mount(App, { target: document.getElementById('app')! });
```

`apps/desktop/src/app.css`:
```css
:root { font-family: system-ui, sans-serif; color: #1f1f1f; background: #f4f4f5; }
html, body, #app { margin: 0; height: 100%; overflow: hidden; }
button { font: inherit; padding: 4px 10px; border: 1px solid #c8c8cc; border-radius: 6px; background: #fff; cursor: pointer; }
button:disabled { opacity: 0.4; cursor: default; }
button.active { background: #1f1f1f; color: #fff; border-color: #1f1f1f; }
```

`apps/desktop/src/ui/App.svelte` (temporary; replaced in Task 14):
```svelte
<script lang="ts">
  import { CHALK_VERSION } from '@chalksmith/core';
</script>

<main style="padding: 24px">ChalkSmith — format v{CHALK_VERSION}</main>
```

- [ ] **Step 2: Create the original app icon**

`apps/desktop/scripts/make-icon.ts`:
```ts
import { writeFileSync } from 'node:fs';
import { makePng } from '../../../packages/core/fixtures/build';

// Original ChalkSmith icon: slate background with a diagonal chalk stroke.
const S = 1024;
const png = makePng(S, S, (x, y) => {
  const d = Math.abs(x - y) / Math.SQRT2;
  const inBand = d < 70 && x > 180 && x < 844;
  return inBand ? [245, 245, 240] : [38, 52, 64];
});
writeFileSync(new URL('../app-icon.png', import.meta.url), png);
console.log('wrote app-icon.png');
```

- [ ] **Step 3: Create the Rust shell**

`apps/desktop/src-tauri/Cargo.toml`:
```toml
[package]
name = "chalksmith"
version = "0.1.0"
edition = "2021"
license = "Apache-2.0"

[lib]
name = "chalksmith_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
percent-encoding = "2"
```

`apps/desktop/src-tauri/build.rs`:
```rust
fn main() {
    tauri_build::build()
}
```

`apps/desktop/src-tauri/src/main.rs`:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    chalksmith_lib::run()
}
```

`apps/desktop/src-tauri/src/lib.rs`:
```rust
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request, Response};

#[tauri::command]
fn read_file(path: String) -> Result<Response, String> {
    fs::read(&path)
        .map(Response::new)
        .map_err(|e| format!("Could not read {path}: {e}"))
}

#[tauri::command]
fn write_atomic(request: Request<'_>) -> Result<(), String> {
    let raw = request
        .headers()
        .get("x-path")
        .ok_or("missing x-path header")?
        .to_str()
        .map_err(|e| e.to_string())?;
    let path = percent_encoding::percent_decode_str(raw)
        .decode_utf8()
        .map_err(|e| e.to_string())?
        .into_owned();
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".into());
    };
    write_atomic_impl(Path::new(&path), bytes).map_err(|e| format!("Could not save {path}: {e}"))
}

/// Write to a temporary file in the same folder, flush to disk, then rename over the target.
pub fn write_atomic_impl(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let dir = target
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let name = target
        .file_name()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "no file name"))?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp: PathBuf = dir.join(format!(
        ".{}.tmp-{}-{}",
        name.to_string_lossy(),
        std::process::id(),
        nonce
    ));
    let result = (|| {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        fs::rename(&tmp, target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_file, write_atomic])
        .run(tauri::generate_context!())
        .expect("error while running ChalkSmith");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_replaces_and_leaves_no_temp_files() {
        let dir = std::env::temp_dir().join(format!("chalksmith-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join("a.chalk");
        write_atomic_impl(&p, b"one").unwrap();
        write_atomic_impl(&p, b"two").unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"two");
        let leftovers = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(".tmp-"))
            .count();
        assert_eq!(leftovers, 0);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn fails_cleanly_when_folder_is_missing() {
        let p = std::env::temp_dir().join("chalksmith-no-such-dir-xyz").join("a.chalk");
        assert!(write_atomic_impl(&p, b"x").is_err());
    }
}
```

`apps/desktop/src-tauri/tauri.conf.json`:
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "ChalkSmith",
  "version": "0.1.0",
  "identifier": "io.github.franklavigne.chalksmith",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [{ "label": "main", "title": "ChalkSmith", "width": 1200, "height": 800 }],
    "security": {
      "csp": "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; connect-src ipc: http://ipc.localhost"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]
  }
}
```
(Beyond the spec's base CSP, Tauri IPC needs `connect-src ipc: http://ipc.localhost`, and Svelte's dev-mode styles need `style-src 'unsafe-inline'`. No network origins are allowed.)

`apps/desktop/src-tauri/capabilities/default.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Main window: dialogs and window title only; no network, no general file system access.",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-set-title",
    "core:window:allow-destroy",
    "dialog:allow-open",
    "dialog:allow-save",
    "dialog:allow-message",
    "dialog:allow-ask"
  ]
}
```

Update the root `package.json` `typecheck` script:
```json
"typecheck": "tsc -p packages/core/tsconfig.json && npm run check -w @chalksmith/desktop"
```

- [ ] **Step 4: Generate icons, run the Rust tests, and launch**

```bash
npm run icon -w @chalksmith/desktop
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
npm run typecheck
npm run tauri -w @chalksmith/desktop -- dev
```
Expected: icons appear in `src-tauri/icons/`; 2 Rust tests pass; typecheck is clean. A window titled "ChalkSmith" opens showing "ChalkSmith — format v0". Close it.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json apps/desktop
git commit -m "feat(desktop): Tauri 2 + Svelte 5 scaffold with atomic file writes"
```

---

### Task 11: Engine: camera, document, commands, history

**Files:**
- Create: `apps/desktop/src/engine/camera.ts`, `document.ts`, `commands.ts`, `history.ts`
- Test: `apps/desktop/src/engine/model.test.ts`

**Interfaces:**
- Consumes: `GridIndex`, `objectBounds`, `translateObject`, `randomId`, `WHITE`, `ItemRef`, types from `@chalksmith/core`.
- Produces:
  - `MIN_ZOOM`, `MAX_ZOOM`, `clampZoom(z)`, `class Camera { x; y; zoom; static from(v?); toView(); screenToWorld(sx, sy); worldToScreen(wx, wy); panBy(dsx, dsy); zoomAt(sx, sy, factor); fit(b, vw, vh, margin = 32) }`
  - `type DocSource = { kind: 'chalk'; path } | { kind: 'whiteboard-zip'; path } | { kind: 'new' }`; `class EditorDoc { board; assets; extensions; createdAt?; source; dirty; index: GridIndex; constructor(init); static empty(); reindex() }`
  - `interface Command { apply(doc); revert(doc) }`; `AddObject(obj)`, `RemoveItems(refs: ItemRef[])`, `MoveItems(ids, dx, dy)`
  - `class History { constructor(getDoc, onChange, limit = 500); execute(c); undo(): boolean; redo(): boolean; clear(); canUndo; canRedo }`

- [ ] **Step 1: Write the failing tests**

`apps/desktop/src/engine/model.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/desktop/src/engine/model.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/desktop/src/engine/camera.ts`:
```ts
import type { Bbox, View } from '@chalksmith/core';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 20;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(z) ? z : 1));
}

/** x, y: world coordinates at the viewport's top-left; zoom: screen px per world px. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  static from(v?: View): Camera {
    const c = new Camera();
    if (v) { c.x = v.x; c.y = v.y; c.zoom = clampZoom(v.zoom); }
    return c;
  }

  toView(): View {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [this.x + sx / this.zoom, this.y + sy / this.zoom];
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x) * this.zoom, (wy - this.y) * this.zoom];
  }

  panBy(dsx: number, dsy: number): void {
    this.x -= dsx / this.zoom;
    this.y -= dsy / this.zoom;
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.zoom = clampZoom(this.zoom * factor);
    this.x = wx - sx / this.zoom;
    this.y = wy - sy / this.zoom;
  }

  fit(b: Bbox | null, vw: number, vh: number, margin = 32): void {
    if (!b || vw <= 0 || vh <= 0) return;
    const z = clampZoom(Math.min((vw - 2 * margin) / Math.max(b.w, 1), (vh - 2 * margin) / Math.max(b.h, 1)));
    this.zoom = z;
    this.x = b.x + b.w / 2 - vw / (2 * z);
    this.y = b.y + b.h / 2 - vh / (2 * z);
  }
}
```

`apps/desktop/src/engine/document.ts`:
```ts
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
```

`apps/desktop/src/engine/commands.ts`:
```ts
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
```

`apps/desktop/src/engine/history.ts`:
```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/desktop/src/engine/model.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/engine
git commit -m "feat(engine): camera, document, undoable commands and history"
```

---

### Task 12: Engine: tools and editor

**Files:**
- Create: `apps/desktop/src/engine/tools.ts`, `apps/desktop/src/engine/editor.ts`
- Test: `apps/desktop/src/engine/tools.test.ts`

**Interfaces:**
- Consumes: Task 11 classes; `hitTest`, `strokesUnderPath`, `boardBounds`, `round4`, `randomId`, `IdGen`, `RGBA`, `Stroke`.
- Produces:
  - `tools.ts`: `PEN_COLORS: RGBA[]` (8), `PEN_WIDTHS = [2, 4, 8, 16]`, `HIGHLIGHTER_COLORS: RGBA[]` (4, α 0.4), `HIGHLIGHTER_WIDTHS = [12, 24]`, `defaultSettings(): ToolSettings`; interfaces `ToolPointer { wx; wy; sx; sy; pressure; pointerType }`, `ToolSettings { penColor; penWidth; highlighterColor; highlighterWidth }`, `LiveOverlay { stroke: Stroke | null; eraserPath: number[] | null; moveOffset: [number, number] | null }`, `ToolHost`, `Tool`; classes `DrawTool(kind, idGen)`, `EraserTool`, `SelectTool`, `HandTool`.
  - `editor.ts`: `type ToolName = 'pen' | 'highlighter' | 'eraser' | 'select' | 'hand'`; `class Editor implements ToolHost` with `doc`, `camera`, `history`, `selection`, `live`, `settings`, `toolName`, `viewport`, `constructor(renderFn?, idGen?)`, `render()`, `onChange(cb): () => void`, `setViewport(w, h)`, `load(doc)`, `fitToBoard()`, `viewChanged()`, `setTool(name)`, `setSettings(partial)`, `setSelection(ids)`, `deleteSelection()`, `undo()`, `redo()`, `pointerDown/Move/Up(p)`, `pointerCancel()`, `captureView()`, `markSaved(source)`.

- [ ] **Step 1: Write the failing tests**

`apps/desktop/src/engine/tools.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/desktop/src/engine/tools.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `tools.ts`**

```ts
import { hitTest, randomId, round4, strokesUnderPath, type IdGen, type RGBA, type Stroke } from '@chalksmith/core';
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
    const refs = strokesUnderPath(h.doc.board.objects, this.path, 8 / h.camera.zoom);
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
```

- [ ] **Step 4: Implement `editor.ts`**

```ts
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
    this.history.execute(new RemoveItems([...this.selection].map((id) => ({ groupId: null, id }))));
    this.setSelection([]);
  }

  undo(): void { if (this.history.undo()) this.afterHistory(); }
  redo(): void { if (this.history.redo()) this.afterHistory(); }

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
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run apps/desktop/src/engine && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/engine
git commit -m "feat(engine): pen, highlighter, eraser, select and hand tools"
```

---

### Task 13: Engine: Canvas renderer, textures, input

**Files:**
- Create: `apps/desktop/src/engine/textures.ts`, `renderer.ts`, `input.ts`

**Interfaces:**
- Consumes: `Editor`, `EditorDoc`, core `strokeOutline`, `objectBounds`, `rgbaToCss`, `mimeForAsset`, `galaxyStars`, `GALAXY_BASE`, `RAINBOW_STOPS`, `TEXTURE_TILE`.
- Produces: `createTexturePattern(ctx, name): CanvasPattern | null`; `class Renderer { constructor(canvas, invalidate); resize(cssW, cssH); draw(ed) }`; `attachInput(canvas, ed): () => void` (returns detach).

These modules need a real browser canvas, so they are verified manually in Task 14's smoke test. Their logic is kept thin; the decisions live in the unit-tested modules above.

- [ ] **Step 1: Implement `textures.ts`**

```ts
import { GALAXY_BASE, RAINBOW_STOPS, TEXTURE_TILE, galaxyStars, type TextureName } from '@chalksmith/core';

/** Original ChalkSmith texture tiles, drawn from code (no image files). */
export function createTexturePattern(ctx: CanvasRenderingContext2D, name: TextureName): CanvasPattern | null {
  const c = document.createElement('canvas');
  c.width = c.height = TEXTURE_TILE;
  const t = c.getContext('2d');
  if (!t) return null;
  if (name === 'galaxy') {
    t.fillStyle = GALAXY_BASE;
    t.fillRect(0, 0, TEXTURE_TILE, TEXTURE_TILE);
    t.fillStyle = '#ffffff';
    for (const s of galaxyStars()) {
      t.globalAlpha = s.alpha;
      t.beginPath();
      t.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      t.fill();
    }
    t.globalAlpha = 1;
  } else {
    const g = t.createLinearGradient(0, 0, TEXTURE_TILE, 0);
    RAINBOW_STOPS.forEach((col, i) => g.addColorStop(i / (RAINBOW_STOPS.length - 1), col));
    t.fillStyle = g;
    t.fillRect(0, 0, TEXTURE_TILE, TEXTURE_TILE);
  }
  return ctx.createPattern(c, 'repeat');
}
```

- [ ] **Step 2: Implement `renderer.ts`**

```ts
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
    createImageBitmap(new Blob([bytes], { type: mimeForAsset(asset) }))
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
```

- [ ] **Step 3: Implement `input.ts`**

```ts
import type { Editor } from './editor';
import type { ToolPointer } from './tools';

/** Wires pointer, wheel and keyboard input on the canvas to the editor. Returns a detach function. */
export function attachInput(canvas: HTMLCanvasElement, ed: Editor): () => void {
  let spaceDown = false;
  let panning: { id: number; x: number; y: number } | null = null;
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; mx: number; my: number } | null = null;
  canvas.style.touchAction = 'none';

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const toPointer = (e: PointerEvent): ToolPointer => {
    const [sx, sy] = local(e);
    const [wx, wy] = ed.camera.screenToWorld(sx, sy);
    return { sx, sy, wx, wy, pressure: e.pressure, pointerType: e.pointerType };
  };
  const pinchState = () => {
    const [a, b] = [...touches.values()];
    const [ax, ay] = local({ clientX: a.x, clientY: a.y });
    const [bx, by] = local({ clientX: b.x, clientY: b.y });
    return { dist: Math.hypot(bx - ax, by - ay) || 1, mx: (ax + bx) / 2, my: (ay + by) / 2 };
  };

  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { ed.pointerCancel(); pinch = pinchState(); return; }
    }
    if (e.button === 1 || (spaceDown && e.button === 0)) {
      panning = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    ed.pointerDown(toPointer(e));
  };

  const onMove = (e: PointerEvent) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) {
      const now = pinchState();
      ed.camera.panBy(now.mx - pinch.mx, now.my - pinch.my);
      ed.camera.zoomAt(now.mx, now.my, now.dist / pinch.dist);
      pinch = now;
      ed.viewChanged();
      return;
    }
    if (panning && panning.id === e.pointerId) {
      ed.camera.panBy(e.clientX - panning.x, e.clientY - panning.y);
      panning.x = e.clientX;
      panning.y = e.clientY;
      ed.viewChanged();
      return;
    }
    if (e.buttons === 0 && e.pointerType === 'mouse') return;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ce of events.length ? events : [e]) ed.pointerMove(toPointer(ce));
  };

  const onUp = (e: PointerEvent) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    if (panning?.id === e.pointerId) { panning = null; return; }
    ed.pointerUp(toPointer(e));
  };

  const onCancel = (e: PointerEvent) => {
    touches.delete(e.pointerId);
    pinch = null;
    panning = null;
    ed.pointerCancel();
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const [sx, sy] = local(e);
    if (e.ctrlKey || e.metaKey) ed.camera.zoomAt(sx, sy, Math.exp(-e.deltaY * 0.01));
    else ed.camera.panBy(-e.deltaX, -e.deltaY);
    ed.viewChanged();
  };

  const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  const onKeyDown = (e: KeyboardEvent) => { if (e.key === ' ' && !isTyping(e.target)) { spaceDown = true; e.preventDefault(); } };
  const onKeyUp = (e: KeyboardEvent) => { if (e.key === ' ') spaceDown = false; };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  };
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/engine
git commit -m "feat(engine): Canvas 2D renderer, original textures and input handling"
```

---

### Task 14: UI: platform, actions, menu, app shell, rescue report

**Files:**
- Create: `apps/desktop/src/platform.ts`, `src/ui/actions.ts`, `src/ui/actions.test.ts`, `src/ui/menu.ts`, `src/ui/Toolbar.svelte`, `src/ui/RescueReport.svelte`
- Replace: `apps/desktop/src/ui/App.svelte`

**Interfaces:**
- Consumes: `Editor`, `EditorDoc`, `Renderer`, `attachInput`, tool constants, core `readChalk`, `writeChalk`, `rescueWhiteboardZip`, `boardToSvg`, `ChalkError`, `rgbaToCss`.
- Produces: `interface Platform { pickOpen(); pickSave(defaultPath, kind); readFile(path); writeFile(path, bytes); error(title, text); confirm(title, text) }`; `tauriPlatform`; actions `APP_VERSION`, `defaultChalkPath(p)`, `defaultSvgPath(p)`, `displayName(source)`, `samePath(a, b)`, `errorText(e)`, `confirmDiscard(ed, pf)`, `openBoard(ed, pf)`, `saveBoard(ed, pf)`, `saveBoardAs(ed, pf)`, `exportSvg(ed, pf)`; `installMenu(handlers)`.

- [ ] **Step 1: Write the failing tests**

`apps/desktop/src/ui/actions.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readChalk } from '@chalksmith/core';
import { FIXTURES } from '../../../../packages/core/fixtures/catalog';
import { Editor } from '../engine/editor';
import type { Platform } from '../platform';
import { defaultChalkPath, exportSvg, openBoard, saveBoard, saveBoardAs } from './actions';

class FakePlatform implements Platform {
  files = new Map<string, Uint8Array>();
  writes: string[] = [];
  errors: string[] = [];
  openPath: string | null = null;
  savePaths: (string | null)[] = [];
  saveDefaults: string[] = [];
  confirmAnswer = true;
  async pickOpen() { return this.openPath; }
  async pickSave(def: string) { this.saveDefaults.push(def); return this.savePaths.shift() ?? null; }
  async readFile(p: string) { const b = this.files.get(p); if (!b) throw new Error('missing'); return b; }
  async writeFile(p: string, b: Uint8Array) { this.writes.push(p); this.files.set(p, b); }
  async error(_t: string, text: string) { this.errors.push(text); }
  async confirm() { return this.confirmAnswer; }
}

const ZIP = 'C:\\Users\\me\\Exports\\My.Board.zip';
const setup = () => {
  const pf = new FakePlatform();
  pf.files.set(ZIP, FIXTURES['multi-group-order']());
  pf.openPath = ZIP;
  const ed = new Editor();
  ed.setViewport(800, 600);
  return { pf, ed };
};

describe('default paths', () => {
  it('replaces only the final extension, for Windows and POSIX paths', () => {
    expect(defaultChalkPath(ZIP)).toBe('C:\\Users\\me\\Exports\\My.Board.chalk');
    expect(defaultChalkPath('/home/me/a.b/board')).toBe('/home/me/a.b/board.chalk');
  });
});

describe('rescue and save', () => {
  it('opens a ZIP as an unsaved rescued board with a report', async () => {
    const { pf, ed } = setup();
    const r = await openBoard(ed, pf);
    expect(r?.report?.counts.groups).toBe(2);
    expect(ed.doc.dirty).toBe(true);
    expect(ed.doc.source).toEqual({ kind: 'whiteboard-zip', path: ZIP });
  });
  it('Save after rescue acts as Save As with a .chalk default, and never writes the ZIP', async () => {
    const { pf, ed } = setup();
    await openBoard(ed, pf);
    pf.savePaths = ['C:\\Users\\me\\Exports\\My.Board.chalk'];
    expect(await saveBoard(ed, pf)).toBe(true);
    expect(pf.saveDefaults).toEqual(['C:\\Users\\me\\Exports\\My.Board.chalk']);
    expect(pf.writes).toEqual(['C:\\Users\\me\\Exports\\My.Board.chalk']);
    expect(ed.doc.dirty).toBe(false);
    expect(ed.doc.source).toEqual({ kind: 'chalk', path: 'C:\\Users\\me\\Exports\\My.Board.chalk' });
    const saved = readChalk(pf.files.get('C:\\Users\\me\\Exports\\My.Board.chalk')!);
    expect(saved.board.objects.map((o) => o.kind)).toEqual(['group', 'image', 'group', 'unsupported']);
  });
  it('refuses to save over the original export, whatever the extension case', async () => {
    const { pf, ed } = setup();
    await openBoard(ed, pf);
    pf.savePaths = ['c:/users/me/exports/my.board.zip'];
    expect(await saveBoardAs(ed, pf)).toBe(false);
    expect(pf.writes).toEqual([]);
    expect(pf.errors[0]).toMatch(/never overwrites the original export/);
  });
  it('appends .chalk when the user omits it', async () => {
    const { pf, ed } = setup();
    await openBoard(ed, pf);
    pf.savePaths = ['C:\\Users\\me\\Exports\\copy'];
    await saveBoardAs(ed, pf);
    expect(pf.writes).toEqual(['C:\\Users\\me\\Exports\\copy.chalk']);
  });
  it('saves a .chalk board in place and keeps createdAt', async () => {
    const { pf, ed } = setup();
    await openBoard(ed, pf);
    pf.savePaths = ['C:\\b.chalk'];
    await saveBoard(ed, pf);
    const first = readChalk(pf.files.get('C:\\b.chalk')!).manifest.createdAt;
    pf.openPath = 'C:\\b.chalk';
    await openBoard(ed, pf);
    ed.doc.dirty = true;
    await saveBoard(ed, pf);
    expect(pf.writes).toEqual(['C:\\b.chalk', 'C:\\b.chalk']);
    expect(readChalk(pf.files.get('C:\\b.chalk')!).manifest.createdAt).toBe(first);
  });
  it('asks before discarding unsaved changes', async () => {
    const { pf, ed } = setup();
    await openBoard(ed, pf);
    pf.confirmAnswer = false;
    expect(await openBoard(ed, pf)).toBeNull();
  });
  it('reports unreadable files without changing the open board', async () => {
    const { pf, ed } = setup();
    pf.files.set('C:\\bad.zip', new TextEncoder().encode('nope'));
    pf.openPath = 'C:\\bad.zip';
    expect(await openBoard(ed, pf)).toBeNull();
    expect(pf.errors[0]).toMatch(/not a valid Whiteboard export/);
    expect(ed.doc.source).toEqual({ kind: 'new' });
  });
  it('exports SVG next to the source', async () => {
    const { pf, ed } = setup();
    await openBoard(ed, pf);
    pf.savePaths = ['C:\\Users\\me\\Exports\\My.Board.svg'];
    expect(await exportSvg(ed, pf)).toBe(true);
    expect(pf.saveDefaults).toEqual(['C:\\Users\\me\\Exports\\My.Board.svg']);
    expect(new TextDecoder().decode(pf.files.get('C:\\Users\\me\\Exports\\My.Board.svg')!)).toContain('<svg');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/desktop/src/ui/actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `platform.ts`**

```ts
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
```

- [ ] **Step 4: Implement `ui/actions.ts`**

```ts
import { ChalkError, boardToSvg, readChalk, rescueWhiteboardZip, writeChalk, type RescueReport } from '@chalksmith/core';
import { EditorDoc, type DocSource } from '../engine/document';
import type { Editor } from '../engine/editor';
import type { Platform } from '../platform';

export const APP_VERSION = '0.1.0';

const stripExt = (p: string) => p.replace(/\.[^./\\]*$/, '');
export const defaultChalkPath = (p: string) => `${stripExt(p)}.chalk`;
export const defaultSvgPath = (p: string | null) => (p ? `${stripExt(p)}.svg` : 'board.svg');
export const samePath = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();
export const displayName = (s: DocSource) => (s.kind === 'new' ? 'Untitled' : s.path.split(/[\\/]/).pop() ?? s.path);

export function errorText(e: unknown): string {
  if (e instanceof ChalkError || e instanceof Error) return e.message;
  return String(e);
}

export interface OpenResult { report?: RescueReport; warnings: string[] }

export async function confirmDiscard(ed: Editor, pf: Platform): Promise<boolean> {
  if (!ed.doc.dirty) return true;
  return pf.confirm('Unsaved changes', 'This board has unsaved changes. Discard them?');
}

export async function openBoard(ed: Editor, pf: Platform): Promise<OpenResult | null> {
  if (!(await confirmDiscard(ed, pf))) return null;
  const path = await pf.pickOpen();
  if (!path) return null;
  try {
    const bytes = await pf.readFile(path);
    if (path.toLowerCase().endsWith('.chalk')) {
      const f = readChalk(bytes);
      ed.load(new EditorDoc({ board: f.board, assets: f.assets, extensions: f.extensions, createdAt: f.createdAt, source: { kind: 'chalk', path } }));
      return { warnings: f.warnings };
    }
    const r = rescueWhiteboardZip(bytes);
    const doc = new EditorDoc({ board: r.board, assets: r.assets, extensions: r.extensions, source: { kind: 'whiteboard-zip', path } });
    doc.dirty = true;
    ed.load(doc);
    return { report: r.report, warnings: [] };
  } catch (e) {
    await pf.error('Could not open file', errorText(e));
    return null;
  }
}

/** Refuses any path that is the original Whiteboard export. */
async function guardOriginal(ed: Editor, pf: Platform, path: string): Promise<boolean> {
  const s = ed.doc.source;
  if (s.kind === 'whiteboard-zip' && samePath(path, s.path)) {
    await pf.error('Choose another name', 'ChalkSmith never overwrites the original export. Please choose a different file name.');
    return false;
  }
  return true;
}

async function writeTo(ed: Editor, pf: Platform, path: string): Promise<boolean> {
  ed.captureView();
  const now = new Date();
  try {
    const bytes = writeChalk(
      { board: ed.doc.board, assets: ed.doc.assets, extensions: ed.doc.extensions, createdAt: ed.doc.createdAt },
      { appVersion: APP_VERSION, now },
    );
    await pf.writeFile(path, bytes);
    ed.doc.createdAt ??= now.toISOString();
    ed.markSaved({ kind: 'chalk', path });
    return true;
  } catch (e) {
    await pf.error('Could not save', errorText(e));
    return false;
  }
}

export async function saveBoard(ed: Editor, pf: Platform): Promise<boolean> {
  const s = ed.doc.source;
  return s.kind === 'chalk' ? writeTo(ed, pf, s.path) : saveBoardAs(ed, pf);
}

export async function saveBoardAs(ed: Editor, pf: Platform): Promise<boolean> {
  const s = ed.doc.source;
  let path = await pf.pickSave(s.kind === 'new' ? 'Untitled.chalk' : defaultChalkPath(s.path), 'chalk');
  if (!path) return false;
  if (!(await guardOriginal(ed, pf, path))) return false; // check the name the user picked, before adding .chalk
  if (!path.toLowerCase().endsWith('.chalk')) path += '.chalk';
  return writeTo(ed, pf, path);
}

export async function exportSvg(ed: Editor, pf: Platform): Promise<boolean> {
  const s = ed.doc.source;
  const path = await pf.pickSave(defaultSvgPath(s.kind === 'new' ? null : s.path), 'svg');
  if (!path || !(await guardOriginal(ed, pf, path))) return false;
  try {
    await pf.writeFile(path, new TextEncoder().encode(boardToSvg(ed.doc.board, ed.doc.assets)));
    return true;
  } catch (e) {
    await pf.error('Could not export', errorText(e));
    return false;
  }
}
```

- [ ] **Step 5: Run the action tests**

Run: `npx vitest run apps/desktop/src/ui/actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Implement the menu and Svelte components**

`apps/desktop/src/ui/menu.ts`:
```ts
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';

export interface MenuHandlers {
  open: () => void;
  save: () => void;
  saveAs: () => void;
  exportSvg: () => void;
  close: () => void;
  quit: () => void;
}

export async function installMenu(h: MenuHandlers): Promise<void> {
  const file = await Submenu.new({
    text: 'File',
    items: [
      await MenuItem.new({ id: 'open', text: 'Open…', accelerator: 'CmdOrCtrl+O', action: h.open }),
      await MenuItem.new({ id: 'save', text: 'Save', accelerator: 'CmdOrCtrl+S', action: h.save }),
      await MenuItem.new({ id: 'saveas', text: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', action: h.saveAs }),
      await MenuItem.new({ id: 'export', text: 'Export SVG…', accelerator: 'CmdOrCtrl+E', action: h.exportSvg }),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await MenuItem.new({ id: 'close', text: 'Close Board', accelerator: 'CmdOrCtrl+W', action: h.close }),
      await MenuItem.new({ id: 'quit', text: 'Quit', accelerator: 'CmdOrCtrl+Q', action: h.quit }),
    ],
  });
  const menu = await Menu.new({ items: [file] });
  await menu.setAsAppMenu();
}
```

`apps/desktop/src/ui/Toolbar.svelte`:
```svelte
<script lang="ts">
  import { rgbaToCss, type RGBA } from '@chalksmith/core';
  import type { Editor, ToolName } from '../engine/editor';
  import { HIGHLIGHTER_COLORS, HIGHLIGHTER_WIDTHS, PEN_COLORS, PEN_WIDTHS } from '../engine/tools';

  let { editor, tick }: { editor: Editor; tick: number } = $props();

  const s = $derived.by(() => {
    void tick;
    return {
      tool: editor.toolName,
      settings: editor.settings,
      canUndo: editor.history.canUndo,
      canRedo: editor.history.canRedo,
      zoom: Math.round(editor.camera.zoom * 100),
    };
  });
  const tools: [ToolName, string, string][] = [
    ['pen', 'Pen', 'P'], ['highlighter', 'Highlighter', 'H'], ['eraser', 'Eraser', 'E'],
    ['select', 'Select', 'V'], ['hand', 'Hand', 'Space'],
  ];
  const same = (a: RGBA, b: RGBA) => a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
</script>

<div class="toolbar" role="toolbar" aria-label="Tools">
  {#each tools as [name, label, key]}
    <button class:active={s.tool === name} title="{label} ({key})" onclick={() => editor.setTool(name)}>{label}</button>
  {/each}
  <span class="sep"></span>
  {#if s.tool === 'highlighter'}
    {#each HIGHLIGHTER_COLORS as c}
      <button class="swatch" class:active={same(c, s.settings.highlighterColor)} style="background:{rgbaToCss(c)}"
        aria-label="Highlighter colour" onclick={() => editor.setSettings({ highlighterColor: c })}></button>
    {/each}
    {#each HIGHLIGHTER_WIDTHS as w}
      <button class:active={w === s.settings.highlighterWidth} onclick={() => editor.setSettings({ highlighterWidth: w })}>{w}px</button>
    {/each}
  {:else}
    {#each PEN_COLORS as c}
      <button class="swatch" class:active={same(c, s.settings.penColor)} style="background:{rgbaToCss(c)}"
        aria-label="Pen colour" onclick={() => editor.setSettings({ penColor: c })}></button>
    {/each}
    {#each PEN_WIDTHS as w}
      <button class:active={w === s.settings.penWidth} onclick={() => editor.setSettings({ penWidth: w })}>{w}px</button>
    {/each}
  {/if}
  <span class="sep"></span>
  <button disabled={!s.canUndo} onclick={() => editor.undo()} title="Undo (Ctrl+Z)">Undo</button>
  <button disabled={!s.canRedo} onclick={() => editor.redo()} title="Redo (Ctrl+Shift+Z)">Redo</button>
  <span class="sep"></span>
  <span class="zoom">{s.zoom}%</span>
  <button onclick={() => editor.fitToBoard()}>Fit</button>
</div>

<style>
  .toolbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px; background: #fff; border-bottom: 1px solid #e2e2e6; }
  .sep { width: 1px; height: 24px; background: #e2e2e6; margin: 0 4px; }
  .swatch { width: 24px; height: 24px; padding: 0; border-radius: 50%; }
  .swatch.active { outline: 2px solid #2f6fed; outline-offset: 2px; }
  .zoom { min-width: 48px; text-align: right; font-variant-numeric: tabular-nums; }
</style>
```

`apps/desktop/src/ui/RescueReport.svelte`:
```svelte
<script lang="ts">
  import type { RescueReport } from '@chalksmith/core';

  let { report, onSave, onClose }: { report: RescueReport; onSave: () => void; onClose: () => void } = $props();
  const unsupported = $derived(Object.entries(report.counts.unsupported));
</script>

<div class="backdrop">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rr-title">
    <h2 id="rr-title">Board rescued</h2>
    <ul>
      <li>{report.counts.groups} ink groups, {report.counts.strokes} strokes ({report.counts.points} points)</li>
      <li>{report.counts.images} images</li>
      {#each unsupported as [type, n]}
        <li>{n} × {type} shown as placeholders (not supported yet)</li>
      {/each}
      {#each report.substitutions as sub}
        <li>{sub.strokes} {sub.texture} strokes use ChalkSmith's own {sub.texture} texture</li>
      {/each}
    </ul>
    {#if report.skipped.length}
      <h3>Skipped ({report.skipped.length})</h3>
      <ul class="small">{#each report.skipped as k}<li>{k.reason}</li>{/each}</ul>
    {/if}
    {#if report.warnings.length}
      <h3>Warnings</h3>
      <ul class="small">{#each report.warnings as w}<li>{w}</li>{/each}</ul>
    {/if}
    <p class="note">The original export file has not been changed.</p>
    <div class="actions">
      <button onclick={onClose}>Close</button>
      <button class="active" onclick={onSave}>Save as .chalk…</button>
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.3); display: grid; place-items: center; }
  .dialog { background: #fff; border-radius: 10px; padding: 20px 24px; max-width: 520px; max-height: 80vh; overflow: auto; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25); }
  h2 { margin: 0 0 12px; font-size: 18px; }
  h3 { font-size: 14px; margin: 14px 0 6px; }
  .small { font-size: 13px; color: #555; }
  .note { font-size: 13px; color: #555; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
```

Replace `apps/desktop/src/ui/App.svelte`:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import type { RescueReport as Report } from '@chalksmith/core';
  import { EditorDoc } from '../engine/document';
  import { Editor, type ToolName } from '../engine/editor';
  import { attachInput } from '../engine/input';
  import { Renderer } from '../engine/renderer';
  import { tauriPlatform as pf } from '../platform';
  import { confirmDiscard, displayName, exportSvg, openBoard, saveBoard, saveBoardAs } from './actions';
  import { installMenu } from './menu';
  import RescueReport from './RescueReport.svelte';
  import Toolbar from './Toolbar.svelte';

  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let renderer: Renderer | null = null;
  let frame = 0;
  let tick = $state(0);
  let report = $state<Report | null>(null);

  const editor = new Editor(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      renderer?.draw(editor);
    });
  });

  async function doOpen() {
    const r = await openBoard(editor, pf);
    if (!r) return;
    if (r.report) report = r.report;
    if (r.warnings.length) await pf.error('Opened with warnings', r.warnings.join('\n'));
  }

  async function doClose() {
    if (await confirmDiscard(editor, pf)) editor.load(EditorDoc.empty());
  }

  async function doSaveFromReport() {
    if (await saveBoardAs(editor, pf)) report = null;
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); editor.undo(); }
    else if ((mod && k === 'z' && e.shiftKey) || (mod && k === 'y')) { e.preventDefault(); editor.redo(); }
    else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); editor.deleteSelection(); }
    else if (!mod && !e.altKey) {
      const map: Record<string, ToolName> = { p: 'pen', h: 'highlighter', e: 'eraser', v: 'select' };
      if (map[k]) editor.setTool(map[k]);
    }
  }

  function updateTitle() {
    const d = editor.doc;
    void getCurrentWindow().setTitle(`${d.dirty ? '• ' : ''}${displayName(d.source)} — ChalkSmith`);
  }

  onMount(() => {
    renderer = new Renderer(canvas, () => editor.render());
    const resize = () => {
      editor.setViewport(host.clientWidth, host.clientHeight);
      renderer!.resize(host.clientWidth, host.clientHeight);
      editor.render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    const detach = attachInput(canvas, editor);
    const off = editor.onChange(() => { tick++; updateTitle(); });
    updateTitle();
    void installMenu({
      open: () => void doOpen(),
      save: () => void saveBoard(editor, pf),
      saveAs: () => void saveBoardAs(editor, pf),
      exportSvg: () => void exportSvg(editor, pf),
      close: () => void doClose(),
      quit: () => void getCurrentWindow().close(),
    });
    const unlisten = getCurrentWindow().onCloseRequested(async (e) => {
      if (!(await confirmDiscard(editor, pf))) e.preventDefault();
    });
    window.addEventListener('keydown', onKey);
    return () => {
      ro.disconnect();
      detach();
      off();
      void unlisten.then((u) => u());
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="app">
  <Toolbar {editor} {tick} />
  <div class="stage" bind:this={host}>
    <canvas bind:this={canvas}></canvas>
  </div>
  {#if report}
    <RescueReport {report} onSave={doSaveFromReport} onClose={() => (report = null)} />
  {/if}
</div>

<style>
  .app { display: flex; flex-direction: column; height: 100%; }
  .stage { position: relative; flex: 1; overflow: hidden; }
  canvas { display: block; }
</style>
```

- [ ] **Step 7: Run all tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS; svelte-check reports 0 errors.

- [ ] **Step 8: Manual smoke test (record results in the commit message body)**

```bash
npm run fixtures
npm run tauri -w @chalksmith/desktop -- dev
```
In the app:
1. Draw with the pen (mouse). Change colour and width, switch to the highlighter, draw. Undo and redo with Ctrl+Z / Ctrl+Shift+Z.
2. File → Open… `packages/core/fixtures/out/multi-group-order.zip`. Confirm the rescue report shows 2 ink groups, 1 image, and 1 StickyNote placeholder. Close the report and confirm the title shows `• multi-group-order.zip — ChalkSmith`.
3. Pan (space+drag, middle-drag, trackpad), zoom (Ctrl+wheel or pinch), then press Fit.
4. Select tool: click the image and drag it; press Delete; undo.
5. Eraser: erase one stroke; undo.
6. File → Save. Confirm the dialog suggests `multi-group-order.chalk` and that the ZIP is unchanged on disk (its modified time didn't change). Close and reopen the `.chalk`, and confirm it looks the same.
7. File → Export SVG…, then open the SVG in a browser.
8. Open `texture-galaxy.zip` and confirm the stroke shows ChalkSmith's starry texture.
9. Draw something, then try to close the window. Confirm the unsaved-changes prompt appears, and that cancelling keeps the window open.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop
git commit -m "feat(desktop): open/rescue/save/export UI with rescue report"
```

---

### Task 15: Continuous integration

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Linux system packages for Tauri
        if: matrix.os == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf build-essential libssl-dev
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: apps/desktop/src-tauri
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
      - run: npm run tauri -w @chalksmith/desktop -- build --no-bundle
```

- [ ] **Step 2: Validate locally where possible**

Run: `npm ci && npm run typecheck && npm test && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml && npm run tauri -w @chalksmith/desktop -- build --no-bundle`
Expected: all succeed on Windows.

- [ ] **Step 3: Commit, push, and check the run**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: test and build on Windows, macOS and Linux"
git push origin main
gh run watch --exit-status
```
Expected: all three matrix jobs succeed. If one fails, fix it before moving on and report the failure output.

---

### Task 16: Private acceptance check against a real export (local only, never committed)

**Files:**
- Create: `private/evidence/expected.json` and `private/acceptance.ts`. Both are git-ignored; confirm with `git check-ignore private/acceptance.ts`.

The expected values come from the owner's private evidence notes (`private/evidence/sample-a.md`). They must never appear in any committed file, including this plan.

- [ ] **Step 1: Record the expected values privately**

Create `private/evidence/expected.json` from the figures in `private/evidence/sample-a.md`:
```json
{ "sha256": "<sha-256 of the export ZIP>", "groups": 0, "strokes": 0, "points": 0, "images": 0 }
```
(Replace the placeholders with the real values from the private notes.)

- [ ] **Step 2: Write the script**

```ts
// PRIVATE. Never commit. Run: npx tsx private/acceptance.ts "<path to export zip>"
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { rescueWhiteboardZip, type Group } from '../packages/core/src/index';

const EXPECTED = JSON.parse(readFileSync(new URL('./evidence/expected.json', import.meta.url), 'utf8')) as
  { sha256: string; groups: number; strokes: number; points: number; images: number };

const path = process.argv[2];
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const bytes = new Uint8Array(readFileSync(path));
if (sha(bytes) !== EXPECTED.sha256) throw new Error('This is not the expected sample export.');

const r = rescueWhiteboardZip(bytes);
const c = r.report.counts;
const fails: string[] = [];
for (const k of ['groups', 'strokes', 'points', 'images'] as const) {
  if (c[k] !== EXPECTED[k]) fails.push(`${k}: got ${c[k]}, expected ${EXPECTED[k]}`);
}

// Independent outline check: each number in the original path, divided by 128, equals the imported
// outline's number (arc flags and rotation are copied unscaled, so equal raw values also pass).
const html = strFromU8(Object.entries(unzipSync(bytes)).find(([n]) => n.endsWith('.html'))![1]);
const originals = [...html.matchAll(/<g class="inkStroke[^>]*>\s*<path d="([^"]*)"/g)].map((m) => m[1]);
const imported = r.board.objects.filter((o): o is Group => o.kind === 'group').flatMap((g) => g.children.map((s) => s.sourceOutline!));
if (originals.length !== imported.length) fails.push(`outline count ${imported.length} vs ${originals.length}`);
const nums = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
originals.forEach((d, i) => {
  const a = nums(d), b = nums(imported[i] ?? '');
  if (a.length !== b.length || a.some((v, j) => Math.abs(v / 128 - b[j]) > 1e-4 && v !== b[j])) fails.push(`outline ${i} differs`);
});

if (sha(new Uint8Array(readFileSync(path))) !== EXPECTED.sha256) fails.push('INPUT FILE CHANGED');

console.log(JSON.stringify({ counts: c, substitutions: r.report.substitutions, skipped: r.report.skipped.length, warnings: r.report.warnings }, null, 2));
console.log(fails.length ? `FAIL\n${fails.join('\n')}` : 'PASS: counts match, outlines identical, input unchanged');
process.exit(fails.length ? 1 : 0);
```

- [ ] **Step 3: Run it**

Run: `npx tsx private/acceptance.ts "<path to the owner's export ZIP>"` (the owner gives you the path).
Expected: `PASS: counts match, outlines identical, input unchanged`. Save the output to `private/evidence/acceptance-<date>.txt`.

- [ ] **Step 4: Open the real export in the app (local)**

Run `npm run tauri -w @chalksmith/desktop -- dev`, open the ZIP, and compare it by eye with the original. Do not commit screenshots.

- [ ] **Step 5: Confirm nothing private is staged**

Run: `git status --short` and `git check-ignore -v private/acceptance.ts`
Expected: no `private/` paths listed as changes; the check-ignore line names `.gitignore`. There is no commit for this task.
