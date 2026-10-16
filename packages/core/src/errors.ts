export type ChalkErrorCode =
  | 'NotAZip'
  | 'NoBoardHtml'
  | 'TooLarge'
  | 'BadChalk'
  | 'UnsupportedVersion'
  | 'SchemaInvalid';

export class ChalkError extends Error {
  readonly code: ChalkErrorCode;
  constructor(code: ChalkErrorCode, message: string) {
    super(message);
    this.name = 'ChalkError';
    this.code = code;
  }
}
