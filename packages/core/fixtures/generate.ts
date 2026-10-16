import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FIXTURES } from './catalog';

const out = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(out, { recursive: true });
for (const [name, make] of Object.entries(FIXTURES)) {
  writeFileSync(`${out}${name}.zip`, make());
  console.log(`wrote fixtures/out/${name}.zip`);
}
