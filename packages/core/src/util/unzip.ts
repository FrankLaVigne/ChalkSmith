import { unzipSync } from 'fflate';
import { ChalkError } from '../errors';

export interface ExportLimits { maxEntries: number; maxTotalBytes: number; maxEntryBytes: number }
export const DEFAULT_LIMITS: ExportLimits = { maxEntries: 64, maxTotalBytes: 256 * 2 ** 20, maxEntryBytes: 128 * 2 ** 20 };

const mb = (n: number) => Math.round(n / 2 ** 20);

/**
 * Unzip with entry-count and size limits, checked against the declared sizes before inflating
 * and against the actual sizes afterwards. `what` names the archive in messages ("The export").
 * Any other failure becomes `notZip()`.
 */
export function unzipLimited(bytes: Uint8Array, limits: ExportLimits, what: string, notZip: () => ChalkError): Record<string, Uint8Array> {
  let count = 0;
  let total = 0;
  const tooLarge = (msg: string) => new ChalkError('TooLarge', msg);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        count++;
        if (count > limits.maxEntries) throw tooLarge(`${what} contains more than ${limits.maxEntries} files.`);
        if (f.originalSize > limits.maxEntryBytes) throw tooLarge(`"${f.name}" is larger than ${mb(limits.maxEntryBytes)} MB.`);
        total += f.originalSize;
        if (total > limits.maxTotalBytes) throw tooLarge(`${what} is larger than ${mb(limits.maxTotalBytes)} MB when unpacked.`);
        return true;
      },
    });
  } catch (e) {
    if (e instanceof ChalkError) throw e;
    throw notZip();
  }
  let actual = 0;
  for (const [name, data] of Object.entries(files)) {
    if (data.length > limits.maxEntryBytes) throw tooLarge(`"${name}" is larger than ${mb(limits.maxEntryBytes)} MB.`);
    actual += data.length;
    if (actual > limits.maxTotalBytes) throw tooLarge(`${what} is larger than ${mb(limits.maxTotalBytes)} MB when unpacked.`);
  }
  return files;
}
