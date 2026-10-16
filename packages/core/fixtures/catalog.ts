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
