import { describe, expect, it } from 'vitest';
import { readChalk, rescueWhiteboardZip, seqIds, validateBoard, writeChalk, type RescueResult } from '../src/index';
import { buildExportHtml, buildExportZip, penOutline, type FxInk } from '../fixtures/build';
import { FIXTURES, PNG_80x40 } from '../fixtures/catalog';
import { dataUri } from '../fixtures/build';

const pen = (id: string): FxInk => ({
  kind: 'ink', id, left: 100, top: 50, viewBox: [-3, -3, 26, 6], tool: 'PenStroke',
  strokes: [{ fill: 'rgba(31,31,31,1)', points: [[0, 0], [1280, 0]], outline: penOutline([[0, 0], [1280, 0]], [256, 256]) }],
});
const galaxy = (id: string): FxInk => ({
  ...pen(id), strokes: [{ ...pen(id).strokes[0], fill: '', texture: 'galaxy' }],
});
const note = (type: string, w: number | string = 100, h: number | string = 80) =>
  `<div class="anchor includedInExportedPdf align topLeft" data-whiteboard-type="${type}" data-apikey="n-${type}" style="left: 10px; top: 20px; transform: matrix(1, 0, 0, 1, 0, 0);"><div class="canvasChild"><div style="width: ${w}px; height: ${h}px;">x</div></div></div>`;

const rescueHtml = (html: string) => rescueWhiteboardZip(buildExportZip(html), { idGen: seqIds() });

/** The rescued board must be savable: schema-valid after the same JSON round trip writeChalk does. */
function expectSavable(r: RescueResult): void {
  validateBoard(JSON.parse(JSON.stringify(r.board)));
  const back = readChalk(writeChalk(r, { appVersion: 'test', now: new Date(0) }));
  expect(back.board.objects).toHaveLength(r.board.objects.length);
}

describe('imported objects are validated individually', () => {
  it('skips an image with a negative size and does not keep its bytes', () => {
    const html = buildExportHtml({ objects: [pen('ok'), { kind: 'image', id: 'neg', left: 0, top: 0, w: -40, h: -20, src: dataUri(PNG_80x40) }] });
    const r = rescueHtml(html);
    expect(r.board.objects.map((o) => o.kind)).toEqual(['group']);
    expect(r.report.skipped).toEqual([{ sourceId: 'neg', reason: expect.stringMatching(/size/) }]);
    expect(r.assets.size).toBe(0);
    expect(r.report.counts.images).toBe(0);
    expectSavable(r);
  });

  it('skips a group whose transform overflows to Infinity', () => {
    const html = buildExportHtml({ objects: [pen('ok'), pen('inf')] });
    const bad = html.replace(/(data-apikey="inf" style="[^"]*)matrix\(1, 0, 0, 1, -3, -3\)/, '$1matrix(1e999, 0, 0, 1, -3, -3)');
    expect(bad).not.toBe(html);
    const r = rescueHtml(bad);
    expect(r.board.objects.map((o) => o.source?.id)).toEqual(['ok']);
    expect(r.report.skipped).toEqual([{ sourceId: 'inf', reason: expect.stringMatching(/invalid/) }]);
    expectSavable(r);
  });

  it('skips a textured stroke whose origin overflows', () => {
    const html = buildExportHtml({ objects: [galaxy('tex'), pen('ok')] });
    const bad = html.replace('patternTransform="translate(0 0)', 'patternTransform="translate(1e999 0)');
    expect(bad).not.toBe(html);
    const r = rescueHtml(bad);
    expect(r.board.objects.map((o) => o.source?.id)).toEqual(['ok']);
    expect(r.report.skipped.map((s) => s.sourceId)).toEqual(['texs0', 'tex']);
    expectSavable(r);
  });

  it('counts unsupported types named like Object.prototype members and drops impossible boxes', () => {
    const r = rescueHtml(buildExportHtml({ objects: [
      { kind: 'raw', html: note('constructor') }, { kind: 'raw', html: note('__proto__') },
      { kind: 'raw', html: note('toString', -100, 80) }, { kind: 'raw', html: note('StickyNote', '1e999', 80) },
    ] }));
    expect(Object.entries(r.report.counts.unsupported).sort()).toEqual([['StickyNote', 1], ['__proto__', 1], ['constructor', 1], ['toString', 1]]);
    expect(r.board.objects.map((o) => o.kind === 'unsupported' && o.bbox)).toEqual([
      { x: 10, y: 20, w: 100, h: 80 }, { x: 10, y: 20, w: 100, h: 80 }, null, null,
    ]);
    expectSavable(r);
  });

  it('drops an out-of-range view', () => {
    const html = buildExportHtml({ objects: [pen('ok')], view: { tx: 0, ty: 0, scale: 1 } })
      .replace('translate(0px, 0px) scale(1)', 'translate(1e999px, 0px) scale(1)');
    const r = rescueHtml(html);
    expect(r.board.view).toBeUndefined();
    expectSavable(r);
  });

  it('every catalog fixture that rescues yields a savable, schema-valid board', () => {
    let ok = 0;
    for (const [name, make] of Object.entries(FIXTURES)) {
      let r: RescueResult;
      try { r = rescueWhiteboardZip(make(), { idGen: seqIds() }); } catch { continue; }
      expect(() => expectSavable(r), name).not.toThrow();
      ok++;
    }
    expect(ok).toBeGreaterThan(10);
  });
});
