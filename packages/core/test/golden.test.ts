import { describe, expect, it } from 'vitest';
import { rescueWhiteboardZip, boardToSvg, seqIds } from '../src/index';
import { FIXTURES } from '../fixtures/catalog';

describe('golden output', () => {
  it('unknown-type export leaks no source text or external URLs', () => {
    const r = rescueWhiteboardZip(FIXTURES['unknown-type'](), { idGen: seqIds() });
    const svg = boardToSvg(r.board, r.assets);
    expect(svg).not.toContain('secret text');
    expect(svg).not.toContain('example.invalid');
  });
  for (const name of ['pen-basic', 'texture-galaxy', 'multi-group-order']) {
    it(name, async () => {
      const r = rescueWhiteboardZip(FIXTURES[name](), { idGen: seqIds() });
      await expect(JSON.stringify(r.board, null, 2) + '\n').toMatchFileSnapshot(`./golden/${name}.board.json`);
      await expect(boardToSvg(r.board, r.assets)).toMatchFileSnapshot(`./golden/${name}.svg`);
    });
  }
});
