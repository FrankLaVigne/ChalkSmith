import type { ErrorObject } from 'ajv';

export interface BoardValidateFunction {
  (data: unknown): boolean;
  errors?: ErrorObject[] | null;
}
export const validate: BoardValidateFunction;
export default validate;
