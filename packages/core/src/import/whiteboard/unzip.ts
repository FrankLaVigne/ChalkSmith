import { strFromU8 } from 'fflate';
import { ChalkError } from '../../errors';
import { DEFAULT_LIMITS, unzipLimited, type ExportLimits } from '../../util/unzip';

export { DEFAULT_LIMITS, type ExportLimits } from '../../util/unzip';

export interface ExportEntries { htmlName: string; html: string; comments: Uint8Array | null }

export function readExportZip(bytes: Uint8Array, limits: ExportLimits = DEFAULT_LIMITS): ExportEntries {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new ChalkError('NotAZip', 'This file is not a valid Whiteboard export (it is not a ZIP archive).');
  }
  const files = unzipLimited(bytes, limits, 'The export',
    () => new ChalkError('NotAZip', 'This file is not a valid Whiteboard export (the ZIP archive could not be read).'));
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
