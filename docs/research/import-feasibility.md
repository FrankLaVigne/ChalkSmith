# Import Feasibility: Whiteboard Full Export → editable ChalkSmith board

See `../spec/whiteboard-html-export.md` for the format. Evidence comes from
a private real export. Board-specific figures are kept out of this public
document.

## 1. Verification of prior findings

Each earlier finding was checked against a real export:

| Prior claim | Result |
|---|---|
| ZIP holds HTML with inline SVG + a comments JSON, not raw ink JSON | **Confirmed.** Two stored entries. |
| Object, stroke, point, and image counts | **Confirmed.** Every stroke has exactly one outline `path` and one centerline `polyline`. |
| No pressure, tilt, timestamps | **Confirmed** as explicit data. **Refinement:** effective per-point width (the visible result of pressure) *is* recoverable from the outline (see §2). |
| Original brush widths not found | **Refined.** No explicit width attribute exists, but nominal width is recoverable as 2 × max arc radius. The values cluster at a few doubling values. |
| Some strokes reference an external galaxy texture | **Confirmed.** `#galaxy-pen` is referenced as a remote JPEG; `#rainbow-pen` is declared too. |
| Hit-test widths ≠ pen widths | **Confirmed and explained.** One identical value on every stroke, equal to exactly 16 screen px at the export zoom. CSS makes the overlay invisible. |

Not present in the observed export: erase masks, clips, rotations, text,
notes, shapes, comments.

## 2. Import strategy (editable vectors)

Pipeline, in order. Everything is local and offline.

1. **Open safely.** Read the ZIP with entry-count and size limits. Never extract
   to disk. Parse the HTML with an HTML5 parser, without running scripts or
   fetching resources. Discard `<style>`.
2. **Canvas.** Read the background colour from `rect.canvasBackgroundColor`.
   Store the `transformComponent` translate/scale as an optional initial
   viewport.
3. **Walk `#canvasContent > div.anchor` in document order.** This becomes the
   z-order. For each anchor, keep `data-apikey` as `sourceId`, for
   traceability and re-import de-duplication.
4. **Ink groups → ChalkSmith `group` objects** holding `stroke` children. This
   preserves grouping, which Whiteboard uses for selection units.
   - Group origin `(L+e−vx, T+f−vy)` in canvas px. Stroke points are stored
     group-local in px (`u/128`, `v/128`) as float32. Group transform =
     anchor matrix `a..d` (identity in the observed export).
   - Tool from the svg class: `PenStroke` → `pen`; `Highlighter` →
     `highlighter` (blend: multiply or alpha; render beneath pens is **not**
     implied, so keep document order).
5. **Each stroke:**
   - `points`: from `polyline.points` (centerline). **Never** read
     `stroke-width`.
   - `color`: parse `rgba()` → RGBA8 + float alpha. Round float32 artefacts
     (0.4000000059604645 → 0.4).
   - `width` (nominal) = 2 × max arc radius in the outline. For highlighters,
     use the tip rectangle subpath's **long** side. Confirmed on a real
     export: tips are 1:2 rectangles, and the body thickness follows the long
     side.
   - `widths[]` (per point, optional) = 2 × distance from each centerline
     point to the outline polygon. Validated on a real export: for almost every
     pen stroke, max(widths) agrees closely with 2 × max arc radius.
     Smooth lightly and clamp to `[0.1·width, width]`.
   - `brush`: `solid`, or `texture:galaxy` / `texture:rainbow` from the
     pattern's `<use href>`. Keep `textureOrigin` (pattern translate) and
     `textureScale` (0.5) so placement can be reproduced.
   - `sourceOutline` (optional): the original `d` string, kept so the stroke
     renders **pixel-faithfully until it is edited**. After an edit, ChalkSmith
     regenerates the outline from `points + widths`.
6. **Images → `image` objects.** Sniff the type from magic bytes (ignore
   `image/*`) and store the bytes as an asset with a SHA-256 name. Record the
   display size `W×H`, the intrinsic size, and top-left
   `(L+e−W/2, T+f−H/2)` (the anchor is centred).
7. **Comments.** Attach `-comments.json` threads to the anchors with matching
   ids. Keep unknown fields verbatim in `extensions`.
8. **Unknown object types.** Keep them as `unsupported` placeholders with
   their bounding box and raw markup stored privately in the board file
   (never in logs). Report counts to the user.
9. **Import report.** Show counts per type, textures substituted, objects
   skipped, and the fidelity warnings below.

### Textures (galaxy/rainbow)

These are Microsoft assets on a remote origin. ChalkSmith must **not** fetch,
bundle, or redistribute them. Instead:

- record the semantic brush name;
- render with an **original ChalkSmith texture** (procedurally generated or
  authored by the project) at the same origin and scale;
- optionally let a user point ChalkSmith at a texture image they supply, for
  local use only.

## 3. Fidelity limitations

| Aspect | Fidelity | Notes |
|---|---|---|
| Stroke geometry (rendered) | **Exact** while unedited | Via `sourceOutline`. |
| Centerline / editing | High | Points as the app had them after its smoothing. Raw samples are lost. |
| Variable width | Good approximation | Derived from outline distance. Exact at arc vertices. |
| Nominal width | Good | 2 × max radius. Assumes at least one point hit full pressure. |
| Pressure, tilt, timing | **Lost** | Not in export. No replay, velocity effects, or handwriting-recognition input timing. |
| Colours / alpha | Exact | |
| Grouping, z-order | Exact | As in DOM order. |
| Image bytes and placement | Exact | Plus intrinsic size. Crop/rotate unobserved. |
| Textured pens | Approximate | Different texture art by necessity. |
| Highlighter tip shape | Medium | Outline is exact; regenerating after edit needs a chisel model (**[H]**). |
| Text, notes, shapes, connectors, tables, reactions, Loop | **Unknown** | No samples. Needs synthetic exports. |
| Erase (partial) | Unknown | CSS has `eraseMask`; unobserved. |
| Board metadata (title, authors, dates) | Mostly lost | Only the filename. |

## 4. Missing information (prioritised)

1. Markup for text boxes, sticky notes, shapes, connectors, tables, and
   comments. **Get synthetic Full Exports for each, before account access
   ends.** Work/school web access continues; personal accounts reportedly
   cannot create or edit boards since 2026-09-25.
2. Whether non-identity anchor matrices (rotation/scale) appear after a user
   rotates or resizes an object.
3. Eraser behaviour: does partial erase split strokes or use masks?
4. Highlighter width semantics and pen width presets (to confirm the
   observed doubling ladder).
5. Behaviour with very large boards: multiple images, embedded PDFs (pages as
   images?).

## 5. Feasibility verdict

**Feasible now** for ink and images, with high fidelity and full editability,
using only the export and original code. The remaining risk is object types
we have not observed. The importer must degrade gracefully (placeholders plus
a report) rather than fail.
