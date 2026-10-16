# ChalkSmith

ChalkSmith is an open-source, offline-first whiteboard for sketching, thinking, and organizing ideas in files you own. It runs on Windows, macOS, and Linux.

ChalkSmith is an independent project licensed under Apache-2.0. It is not affiliated with, endorsed by, or sponsored by Microsoft.

## Why I made this

ChalkSmith began because Microsoft retired a whiteboard app I loved. I wanted to put that experience back in users' hands through an open-source alternative they could keep, improve, and control. The tedious work of manually preserving my boards reinforced the goal: an offline, cross-platform whiteboard with locally owned files and portable, editable drawings.

## Status: first build

What works today:

- **Rescue** a Microsoft Whiteboard *Full Export* ZIP into an editable ChalkSmith board: ink groups, pen and highlighter strokes (with their original outlines and per-point widths), textured pens (shown with original substitute textures), embedded images, and the comments file (kept as-is). Anything else becomes a labelled placeholder showing where it was. Every rescue ends with a report of what was imported, substituted, or skipped.
- **View and edit**: pan and zoom, draw with pen and highlighter (pressure on pen devices), erase whole strokes, select and move or delete objects, undo and redo.
- **Save** boards as `.chalk` files (an open, documented ZIP + JSON format), and open them again.
- **Export** a board as SVG.

Not supported yet:

- Text boxes, sticky notes, shapes, connectors, tables, and other Whiteboard object types (imported as placeholders only; their content is not copied).
- Inserting images or PDFs, partial (geometry) erase, PNG or PDF export.
- Reading `.whiteboard` files directly, collaboration or sync, installers and code signing.

## Getting a Whiteboard export

In the Whiteboard app, open the board, then open **Settings → Export** and choose the full export option, which saves a ZIP file. Open that ZIP in ChalkSmith with **File → Open**. ChalkSmith never modifies or overwrites the ZIP; save the rescued board as a new `.chalk` file.

## Building from source

Prerequisites:

- Node.js 20 or later (with npm).
- Rust, stable toolchain (via [rustup](https://rustup.rs)).
- Platform dependencies for [Tauri 2](https://tauri.app/start/prerequisites/):
  - **Windows**: Microsoft Edge WebView2 (preinstalled on Windows 10/11) and the Microsoft C++ Build Tools ("Desktop development with C++").
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`).
  - **Linux**: WebKitGTK 4.1 and related packages, for example on Debian/Ubuntu:
    `sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf build-essential libssl-dev`

Commands (from the repository root):

```sh
npm ci                                            # install dependencies
npm test                                          # run the test suite (Vitest)
npm run typecheck                                 # TypeScript + svelte-check
npm run fixtures                                  # write synthetic sample exports to packages/core/fixtures/out/
npm run tauri -w @chalksmith/desktop -- dev       # run the app in development mode
npm run tauri -w @chalksmith/desktop -- build     # build a release app
```

The repository is an npm workspace: `packages/core` is a pure TypeScript library (format, import, geometry, SVG export) and `apps/desktop` is the Tauri 2 + Svelte 5 desktop app.

## Documentation

- [`docs/spec/chalk-format.md`](docs/spec/chalk-format.md): the `.chalk` file format.
- [`docs/spec/whiteboard-html-export.md`](docs/spec/whiteboard-html-export.md): the observed structure of Whiteboard Full Export ZIPs.
- [`docs/research/`](docs/research/): research notes on import feasibility, architecture, and the file-format spike.

## Privacy

ChalkSmith works entirely offline. The importer never contacts the network: images that an export only links to are never downloaded, and nothing is uploaded anywhere. Note that a Whiteboard export can contain personal content. Never commit real exports (or files derived from them) to this repository; the tests use synthetic fixtures only.

## Original work

ChalkSmith is an original implementation. This repository contains no Microsoft binaries, proprietary code, CSS, textures, icons, fonts, or other assets, and no personal whiteboards or secrets.

## License

Licensed under the [Apache License 2.0](LICENSE).
