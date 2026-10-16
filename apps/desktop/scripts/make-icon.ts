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
