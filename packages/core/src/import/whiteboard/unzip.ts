import { strFromU8, unzipSync } from 'fflate';
import { ChalkError } from '../../errors';

export interface ExportLimits { maxEntries: number; maxTotalBytes: number; maxEntryBytes: number }
export const DEFAULT_LIMITS: ExportLimits = { maxEntries: 64, maxTotalBytes: 256 * 2 ** 20, maxEntryBytes: 128 * 2 ** 20 };

export interface ExportEntries { htmlName: string; html: string; comments: Uint8Array | null }

const mb = (n: number) => Math.round(n / 2 ** 20);

export function readExportZip(bytes: Uint8Array, limits: ExportLimits = DEFAULT_LIMITS): ExportEntries {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new ChalkError('NotAZip', 'This file is not a valid Whiteboard export (it is not a ZIP archive).');
  }
  let count = 0;
  let total = 0;
  const tooLarge = (msg: string) => new ChalkError('TooLarge', msg);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        count++;
        if (count > limits.maxEntries) throw tooLarge(`The export contains more than ${limits.maxEntries} files.`);
        if (f.originalSize > limits.maxEntryBytes) throw tooLarge(`"${f.name}" is larger than ${mb(limits.maxEntryBytes)} MB.`);
        total += f.originalSize;
        if (total > limits.maxTotalBytes) throw tooLarge(`The export is larger than ${mb(limits.maxTotalBytes)} MB when unpacked.`);
        return true;
      },
    });
  } catch (e) {
    if (e instanceof ChalkError) throw e;
    throw new ChalkError('NotAZip', 'This file is not a valid Whiteboard export (the ZIP archive could not be read).');
  }
  let actual = 0;
  for (const [name, data] of Object.entries(files)) {
    if (data.length > limits.maxEntryBytes) throw tooLarge(`"${name}" is larger than ${mb(limits.maxEntryBytes)} MB.`);
    actual += data.length;
    if (actual > limits.maxTotalBytes) throw tooLarge(`The export is larger than ${mb(limits.maxTotalBytes)} MB when unpacked.`);
  }
  const top = Object.keys(files).filter((n) => !n.includes('/') && !n.endsWith('/'));
  const htmls = top.filter((n) => /\.html?$/i.test(n));
  if (htmls.length !== 1) {
    throw new ChalkError('NoBoardHtml', htmls.length === 0
      ? 'The ZIP does not contain a Whiteboard board (.html file).'
      : 'The ZIP contains more than one .html file; expected exactly one board.');
  }
  const commentsName = top.find((n) => n.toLowerCase().endsWith('-comments.json')) ?? null;
  return { htmlName: htmls[0], html: strFromU8(files[htmls[0]]), comments: commentsName ? files[commentsName] : null };
}
