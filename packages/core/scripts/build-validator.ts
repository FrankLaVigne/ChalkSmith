import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateValidatorSource } from './validator-source';

const out = fileURLToPath(new URL('../src/format/board-validator.generated.js', import.meta.url));
writeFileSync(out, generateValidatorSource());
console.log(`wrote ${out}`);
