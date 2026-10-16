# ChalkSmith first build — design spec

- Date: 2026-10-16
- Status: approved design, spec awaiting review
- Related: `docs/spec/whiteboard-html-export.md`,
  `docs/research/import-feasibility.md`, `docs/plan/implementation-plan.md`

## 1. Intent

**Goal.** Build a cross-platform desktop app (Windows, macOS, Linux) that
rescues Microsoft Whiteboard Full Export ZIPs into open, editable ChalkSmith
boards. The user can view a board, draw on it, save it as `.chalk`, and export
it as SVG.

**Primary user.** The project owner, rescuing their own exports. Correctness
on real exports matters more than packaging polish.

**Constraints (from the project owner).**
- Apache-2.0. Original code only. No Microsoft code, CSS, textures, icons,
  fonts, or branding.
- Public tests use synthetic fixtures. Real exports and derived evidence stay
  in the git-ignored `private/` folder.
- The app never modifies an input export and never fetches remote resources
  referenced by one.
- Stack: TypeScript core, Tauri 2 shell, Svelte 5 UI, Canvas 2D rendering.

**Success criteria.**
1. Importing a real export locally reproduces its object, stroke, point, and
   image counts exactly. Unedited strokes render from geometry identical to
   the source outlines. This is checked by a private, uncommitted script.
2. All synthetic-fixture tests pass in CI on Windows, macOS, and Linux.
3. In the app, a user can open a ZIP, read the rescue report, pan and zoom,
   draw with pen and highlighter, erase, select, move, delete, undo and redo,
   save as `.chalk`, reopen it unchanged, and export SVG.

## 2. Scope

**In.** Whiteboard ZIP import (ink groups, strokes, highlighters, textured
pens, images, comments JSON pass-through, unknown-object placeholders);
the `.chalk` v0 format; the viewer and editor tools listed in §6; SVG export;
CI.

**Out (later milestones).** Text boxes, sticky notes, shapes, connectors,
image/PDF insert, partial (geometry) erase, PNG/PDF export, collaboration,
reading `.whiteboard` files directly, a command-line interface, and installer
signing or release packaging.

## 3. Repository layout

npm workspaces (Node ≥ 20, npm ≥ 10), no other package manager.

```
package.json                  workspaces: ["packages/*", "apps/*"]
packages/core/                @chalksmith/core — pure TS, no DOM, ESM
  src/model/                  types, defaults, ids
  src/format/                 .chalk read/write, schema validation
  src/import/whiteboard/      Full Export ZIP importer
  src/geometry/               outline generation, bbox, hit-testing, width recovery
  src/export/svg.ts           board → SVG string
  test/                       vitest tests + golden files
  fixtures/                   synthetic-fixture generator + generated ZIPs
apps/desktop/                 Tauri 2 + Vite + Svelte 5
  src/engine/                 framework-free: camera, input, renderer, tools, history
  src/ui/                     Svelte components (toolbar, dialogs, rescue report)
  src-tauri/                  Rust shell: dialogs, file read, atomic write
docs/spec/chalk-format.md     published .chalk v0 format and JSON Schema
.github/workflows/ci.yml
```

**Unit boundaries.** `core` has no knowledge of DOM, Tauri, or Svelte.
`engine` depends on `core` and on DOM canvas/pointer APIs, but not on Svelte.
`ui` depends on `engine` and `core`. Only `src-tauri` and a thin
`apps/desktop/src/platform.ts` touch the file system.

**Third-party libraries** (all permissive licences, compatible with
Apache-2.0; each is verified before it is added):
- `fflate` (MIT): ZIP read and write.
- `parse5` (MIT): HTML5 parsing.
- `perfect-freehand` (MIT): variable-width outlines.
- `ajv` (MIT): JSON Schema validation.
- `vitest` (MIT): tests.
- Tauri 2 (Apache-2.0/MIT) with the dialog and fs plugins.
- Svelte 5 (MIT) and Vite (MIT).

## 4. Data model and `.chalk` v0

### 4.1 Container

A ZIP file (deflate) with the extension `.chalk`:

| Entry | Content |
|---|---|
| `manifest.json` | `{ "format": "chalk", "version": 0, "createdBy": "ChalkSmith <semver>", "createdAt": ISO-8601, "modifiedAt": ISO-8601 }` |
| `board.json` | the board (below) |
| `assets/<sha256>.<ext>` | binary assets, named by the SHA-256 of their bytes; `ext` comes from the sniffed type |
| `extensions/…` | optional pass-through data, e.g. `extensions/ms-whiteboard/comments.json` |

Readers reject an unknown `format` and reject a `version` greater than
supported, with a clear error message.

### 4.2 Board

```ts
interface Board {
  id: string;                       // random UUID v4
  background: { color: RGBA };
  view?: { x: number; y: number; zoom: number };  // last viewport
  objects: BoardObject[];           // paint order, first = bottom
  ext?: Record<string, unknown>;    // unknown fields preserved verbatim
}

type RGBA = { r: number; g: number; b: number; a: number }; // r,g,b 0–255 ints; a 0–1, rounded to 4 dp

type BoardObject = Group | Stroke | ImageObj | Unsupported;

interface Base {
  id: string;                        // random UUID v4
  source?: { system: "ms-whiteboard"; id: string };
  ext?: Record<string, unknown>;
}

interface Group extends Base {
  kind: "group";
  transform: [number, number, number, number, number, number]; // a b c d e f, canvas px
  children: Stroke[];               // paint order
}

interface Stroke extends Base {
  kind: "stroke";
  tool: "pen" | "highlighter";
  color: RGBA;
  width: number;                    // nominal width, px
  points: number[];                 // flat [x0,y0,x1,y1,…], px, in parent space
  widths?: number[];                // per-point width, px; same length as points/2
  brush: { kind: "solid" } | { kind: "texture"; name: "galaxy" | "rainbow"; origin: [number, number]; scale: number };
  sourceOutline?: string;           // SVG path data, px, in parent space; valid only while editedAt is absent
  editedAt?: string;                // set when geometry changes; renderer then ignores sourceOutline
}

interface ImageObj extends Base {
  kind: "image";
  asset: string;                    // "assets/<sha256>.<ext>"
  x: number; y: number;             // top-left, canvas px
  w: number; h: number;             // display size, px
  intrinsic: { w: number; h: number };
}

interface Unsupported extends Base {
  kind: "unsupported";
  sourceType: string;               // e.g. the data-whiteboard-type value
  bbox: { x: number; y: number; w: number; h: number } | null;
}
```

**Coordinates.** Canvas space uses CSS px, with y pointing down.
Top-level stroke points are in canvas space. Group children are in group
space, mapped by `transform`. Numbers are written with at most 4 decimal
places.

**Validation.** `docs/spec/chalk-format.md` publishes the JSON Schema
(draft 2020-12). `core` validates on read with `ajv`. A schema violation is a
read error. Unknown object `kind`s are a read error in v0.

## 5. Whiteboard rescue pipeline (`core/import/whiteboard`)

`rescueWhiteboardZip(bytes: Uint8Array): RescueResult`. It is a pure function:
no I/O and no network.

```ts
interface RescueResult {
  board: Board;
  assets: Map<string, Uint8Array>;      // path → bytes
  extensions: Map<string, Uint8Array>;  // e.g. comments.json
  report: RescueReport;
}
interface RescueReport {
  counts: { groups: number; strokes: number; points: number; images: number; unsupported: Record<string, number> };
  substitutions: { texture: string; strokes: number }[];
  skipped: { sourceId: string | null; reason: string }[];
  warnings: string[];
}
```

**Steps.**
1. **Unzip** in memory with `fflate`. Limits: ≤ 64 entries, ≤ 256 MB total
   uncompressed, ≤ 128 MB per entry; each limit gives a `TooLarge` error.
   Require exactly one top-level `*.html` entry (`NoBoardHtml` otherwise). The
   optional `*-comments.json` is kept as an extension, unparsed beyond a JSON
   validity check.
2. **Parse** with `parse5`. Ignore `<style>` and `<script>` contents. Never
   dereference any URL other than `data:`.
3. **Background**: `rect.canvasBackgroundColor@fill`, defaulting to white.
   **View**: from the `div.transformComponent` translate and scale.
4. **Objects**: walk `#canvasContent > div.anchor` in document order.
   - `InkGroup` → `Group`. Transform: `a..d` come from the anchor matrix, and
     the translation is `(L+e−vx, T+f−vy)`. Each `g.inkStroke` → `Stroke`:
     - `points` = polyline points ÷ 128 (group space);
     - `tool` = `highlighter` if the svg class contains `Highlighter`, else `pen`;
     - `color` from `fill` `rgba()` (alpha rounded to 4 dp). For a texture
       fill, the colour is opaque white and `brush` is the texture: the name
       comes from `<use href="#galaxy-pen|#rainbow-pen">`, origin from the
       pattern translate ÷ 128, scale from the pattern scale;
     - `sourceOutline` = path `d` with every coordinate and arc radius ÷ 128;
     - `width` = 2 × the maximum arc radius ÷ 128 for pens. For highlighters,
       it is the **longer** side of the first subpath ÷ 128, provided that
       subpath is an axis-aligned rectangle and the outline has more than one
       subpath. (In real exports the chisel tip is a 1:2 rectangle and the
       stroke body is as thick as its long side.) If there is no rectangle,
       it is 2 × the maximum centerline-to-outline distance;
     - `widths` = 2 × the distance from each centerline point to the outline
       polygon (arcs approximated by their endpoints), clamped to
       `[0.1·width, width]`. Omitted for highlighters;
     - the polyline `stroke-width` is **never** read.
   - `AzureImage` → `ImageObj`. Decode the `data:` URI and sniff the type
     (PNG, JPEG, GIF, WebP) from magic bytes. Read the display size from the
     `imageComponent` style and the intrinsic size from the image header.
     Top-left = `(L+e−w/2, T+f−h/2)` (centre anchor).
   - Any other type → `Unsupported` with its bbox if one can be derived,
     counted by type.
   - A failure inside one object skips that object and adds an entry to
     `skipped`.
5. **Report.** Counts, texture substitutions (strokes per texture), skips,
   and warnings (e.g. a non-identity group rotation, or a missing comments
   file).

**Determinism.** For the same input, the importer produces identical output
apart from generated UUIDs. Tests inject a deterministic id generator.

## 6. Desktop app

### 6.1 Engine (`apps/desktop/src/engine`, framework-free)

- **Camera.** World↔screen transform, zoom range 0.05–20×. Pan with
  middle-drag, space+drag, two-finger trackpad, or touch-drag in the
  Hand tool. Zoom with Ctrl/⌘+wheel, trackpad pinch, or touch pinch, about
  the cursor.
- **Renderer.** Canvas 2D at `devicePixelRatio`. It redraws on change only
  (via `requestAnimationFrame`) and culls objects by bounding box.
  - Stroke fill path: `Path2D(sourceOutline)` when `editedAt` is absent.
    Otherwise the outline comes from `perfect-freehand` using `points` and
    `widths` (normalised to pressure), cached per stroke until it changes.
  - Highlighter: same path, filled with RGBA as stored. No special blend mode
    in v0.
  - Texture brush: `CanvasPattern` built from an **original ChalkSmith
    texture**, procedurally generated at startup from a fixed seed (galaxy:
    dark field with stars; rainbow: hue gradient). Placement follows
    `origin`/`scale`.
  - Images: `ImageBitmap` decoded from the asset, drawn at `x,y,w,h`.
  - Unsupported: a dashed grey box with its type label.
  - Selection: bounding-box outline with a move cursor.
- **Input.** Pointer Events with pointer capture. Pen pressure comes from
  `PointerEvent.pressure`; mouse and touch use a constant 0.5. Coalesced
  events are used where available.
- **Tools.**
  - Pen: colour from an 8-swatch palette; width presets 2, 4, 8, 16 px.
  - Highlighter: 4 swatches at α 0.4; width presets 12, 24 px.
  - Eraser: removes whole top-level strokes or group children under the
    pointer path.
  - Select: click picks the topmost group or top-level stroke or image.
    Drag moves it; Delete/Backspace removes it.
  - Hand: pans.
  - New pen/highlighter strokes are top-level objects appended to `objects`.
- **History.** A command stack covering add, remove, move, and erase, with
  undo (Ctrl/⌘+Z) and redo (Ctrl/⌘+Shift+Z or Ctrl+Y). It holds at most 500
  steps. Moving a group changes only its `transform`. Moving a top-level
  stroke translates its `points` and `sourceOutline` together and does
  **not** set `editedAt`, so a moved rescued stroke stays pixel-faithful.
  `editedAt` is set only by geometry changes other than translation. No v0
  tool makes such a change; partial erase, later, will.
- **Hit-testing.** From `core/geometry`: bounding boxes kept in a uniform
  grid index (cell 256 px) for the coarse pass, then an exact test of
  distance to the centerline ≤ max(width/2, 4 screen px).

### 6.2 UI (`apps/desktop/src/ui`, Svelte 5)

- Toolbar: tools, palette, width presets, undo/redo, zoom percentage with
  "fit board".
- Menu (Tauri native menu): Open…, Save, Save As…, Export SVG…, Close, Quit.
- **Rescue report** dialog: shown after a ZIP import, listing counts,
  substitutions, skips, and warnings, with a "Save as .chalk…" action.
- A dirty indicator in the title; a prompt on close or open when there are
  unsaved changes.

### 6.3 Platform and files (`src-tauri`, `platform.ts`)

- Tauri dialog plugin for Open (`.chalk`, `.zip`), Save As (`.chalk`), and
  Export (`.svg`). File access is limited to paths the user picked.
- Reads: bytes via a Tauri command. Writes: a Rust command `write_atomic(path,
  bytes)` that writes `<path>.tmp-<rand>`, fsyncs, then renames over the
  target.
- A rescued ZIP has no save path: Save acts as Save As, and the default name
  is `<zip basename>.chalk` in the ZIP's folder. The ZIP is never written to.
- Tauri capabilities allow only the dialog plugin and the app's own
  commands, with no network permissions. The CSP is `default-src 'self';
  img-src 'self' blob: data:`.

## 7. Error handling

| Situation | Behaviour |
|---|---|
| Not a ZIP / corrupt ZIP | Error dialog "This file is not a valid Whiteboard export". Nothing opened. |
| `NoBoardHtml`, `TooLarge` | Error dialog with the specific reason. |
| Per-object parse failure | Object skipped, listed in the report; import continues. |
| `.chalk` schema or version error | Error dialog naming the problem; nothing opened. |
| Asset missing in `.chalk` | Image is shown as an unsupported-style placeholder; warning shown. |
| Read/write I/O error | Error dialog; the in-memory board is kept and stays dirty. |
| Unexpected exception | Caught at the UI boundary and shown in a dialog; the board stays in memory. |

Core functions throw typed errors (`ChalkError` with a `code`). The UI maps
codes to messages.

## 8. Testing

- **core (vitest, Node)**
  - Fixture generator `packages/core/fixtures/generate.ts` writes synthetic
    export ZIPs that follow the observed spec, with invented geometry:
    `pen-basic`, `pen-variable-width`, `highlighter`, `texture-galaxy`,
    `image-centered`, `multi-group-order`, `unknown-type`,
    `malformed-stroke`, `not-a-zip`, `no-html`, `oversized` (limits checked
    with an injected small limit).
  - Golden tests: import → `board.json` (deterministic ids) and → SVG,
    compared with committed golden files.
  - Width recovery: synthetic strokes with known widths are recovered within
    ±5%.
  - `.chalk` round-trip: write → read → deep-equal; schema rejection cases.
  - Safety: an assertion that importing a fixture referencing `https://`
    resources causes no network access (global `fetch` stubbed to throw), and
    that output contains no external URLs.
- **engine (vitest + jsdom where needed)**: camera maths, the grid index,
  hit-testing, history undo/redo, and the translate-keeps-outline behaviour.
- **private acceptance (not committed)**: `private/acceptance.ts` imports the
  real sample. It checks the counts recorded in `private/evidence`, and that
  every `sourceOutline` equals the original path ÷ 128.
- **CI**: GitHub Actions matrix (windows-latest, macos-latest,
  ubuntu-latest). It runs `npm ci`, `npm test`, and `npm run build -w
  apps/desktop` (Tauri build, unsigned, no artefact upload in this build).

## 9. Prerequisites

- Rust stable toolchain (rustup) on the developer machine. Needs the owner's
  approval before installation.
- On Linux CI: WebKitGTK 4.1 development packages, installed in the workflow.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Real exports contain markup not seen in the one sample | Unknown types become placeholders; per-object failures are skipped and reported |
| Width recovery is wrong for some brushes | `sourceOutline` keeps rendering exact until an edit; recovery is covered by tests |
| WebKitGTK/WKWebView differ in pressure support | Pressure is optional; falls back to constant |
| Large boards are slow | Bbox culling and outline caching; performance work deferred until measured |
