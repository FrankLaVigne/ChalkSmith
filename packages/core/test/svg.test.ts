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
  it('strips characters invalid in XML 1.0', () => {
    const b: Board = { ...empty, objects: [{ kind: 'unsupported', id: 'u', sourceType: 'A\u0001B\uD800C', bbox: { x: 0, y: 0, w: 10, h: 10 } }] };
    const svg = boardToSvg(b, new Map());
    expect(svg).toContain('ABC');
    expect(svg).not.toContain('\u0001');
    expect(svg).not.toContain('\uD800');
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
