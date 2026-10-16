# Microsoft Whiteboard "Full Export" ZIP — Observed Format

Status: draft specification of **observed behavior**, written for
interoperability. It was derived from one real export (kept private) plus the
CSS rules bundled inside that export. It is not an official specification;
Microsoft may change it at any time. Statements are marked **[C]** (confirmed in
observed data) or **[H]** (hypothesis, untested on other exports).

## 1. Container

- **[C]** A ZIP archive (entries stored, no compression) with two entries:
  - `<BoardName>.html` — the board, as a serialized DOM snapshot.
  - `<BoardName>-comments.json` — the comment threads.
- **[C]** Example `-comments.json` with no comments:

  ```json
  {
    "description": "The comment thread IDs in this file correspond to the IDs presented in the HTML file.",
    "commentThreads": []
  }
  ```

- **[H]** With comments present, the HTML contains
  `div.anchor[data-whiteboard-type="CommentThread"]` elements whose ids match
  `commentThreads[*]`. The CSS has rules for this selector; no example has
  been observed yet.

## 2. HTML document

The file is the web app's live canvas DOM, serialized. It is **not** a
semantic file format: it is what the browser rendered at export time.

```
<html><head>
  <meta charSet="utf-8"> …
  <style> … (~870 KB of the web app's CSS) … </style>
</head><body>
  div.transformComponent  style="transform: translate(Tx px, Ty px) scale(Z)"
    svg.canvasBackground   (background colour rect + grid pattern)
    div#canvasContent.contentOrigin  data-blueprint-type="Canvas" data-identity-key=…
      div.anchor … (one per canvas object, in z-order)
    div#sharedDescribedBy   (a11y strings)
    div.wetInkContainer     (empty in-progress-ink layers)
    div#canvasCursor
    svg#effect-resources    <defs><image id="rainbow-pen" href=…><image id="galaxy-pen" href=…></defs>
</body></html>
```

- **[C]** `transformComponent` records the **viewport at export time** (pan +
  zoom). Importers should ignore it for geometry. It is useful only to
  restore the last view.
- **[C]** `canvasBackground` → `rect.canvasBackgroundColor fill="#FFFFFF"` is
  the background colour. The grid pattern is a `<pattern id>` (the observed
  one was empty, id `Neutral`).
- **[C]** Attributes are serialized React-style in places (`charSet`,
  `httpEquiv`). The `<style>` contains a nested literal `<style type="text/css">`
  string. Parse leniently with an HTML5 parser; do not expect XHTML.

## 3. Coordinate system

- **[C]** Canvas space is CSS px with its origin at `#canvasContent`.
  `div.anchor` is `position:absolute`, so `left/top` are canvas coordinates.
- **[C]** Anchor-local placement:
  - `.align` is a 0×0 flex box.
  - `.topLeft` puts the child's top-left corner at the anchor point.
  - `.center` adds `transform: translate(-50%,-50%)`, which **centres** the child
    on the anchor point.
  - The inline `transform: matrix(a,b,c,d,e,f)` on the anchor applies on top
    of that. Rotation and scale are in `a..d`. All observed values are
    identity plus a small translation.
- **[C]** Ink sub-units: each `g.inkStroke` has
  `transform="matrix(0.0078125,0,0,0.0078125,0,0)"`. Stroke coordinates are
  integers in **1/128 px**.

## 4. Object types

Identified by `div.anchor[data-whiteboard-type]` and the child
`div.canvasChild[data-content-blueprint-type]`.

| `data-whiteboard-type` | blueprint | Observed |
|---|---|---|
| `InkGroup` | `BpInkGroup` | **[C]** |
| `AzureImage` | `Image` | **[C]** |
| `CommentThread` | ? | **[H]** (CSS only) |
| Notes, text, shapes, connectors, tables, reactions, Loop, templates | ? | **[H]** CSS class names present; markup unknown — needs synthetic exports |

Common attributes **[C]**:

- `data-apikey` (anchor) equals `data-identity-key` (canvasChild): the object id.
- `data-content-identity-key`: the content id (equals the inner `svg` id for ink).
- All ids are 40 hex chars, SHA-1-shaped. **[H]** opaque.

### 4.1 Ink group

```html
<div class="anchor includedInExportedPdf align topLeft" data-whiteboard-type="InkGroup"
     data-apikey="{objId}" style="left: Lpx; top: Tpx; transform: matrix(1,0,0,1,e,f);">
  <div id="id{contentId}" data-content-blueprint-type="BpInkGroup" data-blueprint-type="CanvasChild"
       data-identity-key="{objId}" data-content-identity-key="{contentId}" class="canvasChild …">
    <svg class="inkGroup ink {Tool}" viewBox="vx vy vw vh" width="vw" height="vh" overflow="visible" …>
      <g class="inkStroke interactive" id="{strokeId}" transform="matrix(0.0078125,0,0,0.0078125,0,0)"
         data-apikey="__{groupKey}_{strokeId2}">
        <path d="…outline…" fill="{paint}" opacity="{'' | 1}"></path>
        [<defs><pattern …><use href="#galaxy-pen"/></pattern></defs>]
        <polyline class="inkHitTestOverlay" stroke-linecap="round" stroke-width="{W}" points="x,y x,y …"/>
      </g> …
    </svg>
  </div>
</div>
```

- **[C]** `{Tool}` ∈ `PenStroke`, `Highlighter`. This is per group, so a group
  holds strokes of one tool.
- **[C]** Placement of a stroke point `(u,v)` (1/128 units) on the canvas,
  following CSS/SVG semantics:

  ```
  X = L + e + (u/128 − vx)
  Y = T + f + (v/128 − vy)
  ```

  The SVG viewport is `vw×vh` px with `viewBox` origin `(vx,vy)`, so there is
  no extra scale. `overflow="visible"` means geometry outside the viewBox
  still renders.
  **[C]** Across all observed groups, `e − vx` and `f − vy` lie in [0, 1]
  (median ≈ 0), so in practice `X ≈ L + u/128` and `L,T` is the group's local
  origin in canvas space. Use the full formula anyway.
  **[C]** `(vx,vy,vw,vh)` is the outline bounding box rounded outward to
  integers. Measured padding is about 1 px, and a few px at most; arc bulges
  can exceed it, hence `overflow="visible"`.

#### Stroke paint **[C]**

| Case | `fill` | `opacity` |
|---|---|---|
| Solid pen | `rgba(r,g,b,1)` | `""` |
| Highlighter | `rgba(r,g,b,0.4000000059604645)` (alpha is float32 0.4) | `""` |
| Textured pen | `url(#-N)`, a `<pattern>` in the stroke's own `<defs>` | `"1"` |

The textured pattern observed:

```html
<pattern id="-N" width="540" height="540" x="0" y="0" patternUnits="userSpaceOnUse"
         patternTransform="translate(Su Sv) scale(0.5 0.5) matrix(128,0,0,128,0,0)">
  <use href="#galaxy-pen"/>
</pattern>
```

- The pattern is anchored at the stroke's first centerline point `(Su,Sv)`.
- The texture tile is 540 px rendered at 0.5×.
- The texture image is **not embedded**. `#galaxy-pen` / `#rainbow-pen` are
  `<image href="https://…/blueboard/assets/{name}.{hash}.jpg">`, which are remote
  Microsoft assets. Importers must not fetch them automatically and must not
  redistribute them.

#### Outline geometry `<path d>` **[C]**

- Integer 1/128-px coordinates using only `M`, `L`, `A`, `Z`-less subpaths.
- **Pen**: a closed-looking outline of the variable-width stroke. Joins and caps
  are circular arcs `A r,r 0 0 0 x,y`. The arc radius is the **local
  half-width** at that vertex. A dot-like start cap appears as a full circle
  (`M a A r r … A r r …`).
- **Highlighter**: a polygonal (chisel / rectangular-tip) outline with **no
  arcs**. Vertices are often duplicated (`L p L p`), and the tip appears as a
  rectangle subpath.
- This is the rendered result. The input samples (pressure, tilt, timestamps)
  are **not present**.

#### Centerline `<polyline points>` **[C]**

- Space-separated `x,y` integer pairs in 1/128 px: the stroke's centerline
  samples after any app-side smoothing or resampling (**[H]**, smoothing
  unknown).
- **`stroke-width` is NOT the pen width.** It is a hit-test width. Observed:
  the same value on every stroke, equal to exactly `16 ÷ Z × 128`, where `Z` is
  the `transformComponent` export zoom. The observed value matches this
  formula to every printed digit. In other words, a 16
  screen-pixel touch target. CSS sets `stroke-opacity: 0`. Ignore it.

#### Recovering pen width **[C + H]**

- **[C]** In the observed export, the per-stroke **maximum** arc radius
  clusters at a few exact values that double from one to the next.
  Arc radii vary along a stroke (median max/min ratio ≈ 2.6).
- **[H]** Nominal pen width = 2 × max arc radius. Below-max radii reflect
  pressure or speed modulation baked into the outline.
- **[H]** Per-point width can be estimated by measuring the outline's distance
  from each centerline point (×2). That makes the variable width editable.
- Highlighter width/height comes from the tip rectangle subpath (**[H]**).

### 4.2 Image

```html
<div class="anchor includedInExportedPdf align center" data-whiteboard-type="AzureImage"
     data-apikey="{objId}" style="left: Lpx; top: Tpx; transform: matrix(1,0,0,1,e,f);">
  <div id="id{contentId}" data-content-blueprint-type="Image" class="canvasChild …">
    <div class="content imageComponent interactive" role="img" style="height: Hpx; width: Wpx;">
      <div class="ms-Image …"><img src="data:image/*;base64,…" style="max-height: Hpx; max-width: Wpx;"></div>
```

- **[C]** The image is embedded as a `data:` URI with the non-standard media
  type `image/*`. Sniff the real type from magic bytes (the observed one was a
  PNG).
- **[C]** Display size is `W×H` CSS px. The intrinsic pixel size can be larger
  (observed: roughly 1.9× the display size). Keep the original bytes, and
  store both sizes.
- **[C]** Because the anchor is `.center`, the image's **centre** is at
  `(L+e, T+f)`, so its top-left is `(L+e−W/2, T+f−H/2)`.
- **[H]** Cropping, rotation and alt text, if any, appear as additional
  attributes. Not observed.

## 5. Z-order **[C]**

Anchors appear in document order inside `#canvasContent`. CSS gives no
z-index to ink or images, so **document order is paint order**. Within a group,
`g.inkStroke` order is paint order.

## 6. Things that are *not* in the export

Pressure, tilt and timestamps per point; the brush/pen preset id; the original
input sample rate; author/attribution; creation times; undo history; layers
other than DOM order; the textured-pen bitmaps; and fonts for any text
(not observed).

## 7. Safety notes for importers

- Treat the HTML as untrusted. Parse it; never render it in a browser
  context; never execute scripts; never follow `href`/`src` URLs except
  `data:`.
- Drop the embedded `<style>` block. It is Microsoft's stylesheet and must not
  be redistributed.
- Bound memory: a real export can be several MB. The CSS alone is close to
  1 MB, and each image adds its base64 size.
