export type RGBA = { r: number; g: number; b: number; a: number };
/** CSS-style affine matrix [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Affine = [number, number, number, number, number, number];
export interface Bbox { x: number; y: number; w: number; h: number }
export interface Source { system: 'ms-whiteboard'; id: string }
export type TextureName = 'galaxy' | 'rainbow';
export type Brush =
  | { kind: 'solid' }
  | { kind: 'texture'; name: TextureName; origin: [number, number]; scale: number };

interface Base {
  id: string;
  source?: Source;
  ext?: Record<string, unknown>;
}

export interface Stroke extends Base {
  kind: 'stroke';
  tool: 'pen' | 'highlighter';
  color: RGBA;
  /** Nominal width, px. */
  width: number;
  /** Flat [x0, y0, x1, y1, …] in px, in the parent's space. */
  points: number[];
  /** Per-point width in px, one per point. */
  widths?: number[];
  brush: Brush;
  /** SVG path data in px (parent space). Used for rendering while editedAt is absent. */
  sourceOutline?: string;
  editedAt?: string;
}

export interface Group extends Base {
  kind: 'group';
  transform: Affine;
  children: Stroke[];
}

export interface ImageObj extends Base {
  kind: 'image';
  /** "assets/<sha256>.<ext>" */
  asset: string;
  x: number;
  y: number;
  w: number;
  h: number;
  intrinsic: { w: number; h: number };
}

export interface Unsupported extends Base {
  kind: 'unsupported';
  sourceType: string;
  bbox: Bbox | null;
}

export type BoardObject = Group | Stroke | ImageObj | Unsupported;

/** x, y: world coordinates shown at the viewport's top-left corner. */
export interface View { x: number; y: number; zoom: number }

export interface Board {
  id: string;
  background: { color: RGBA };
  view?: View;
  /** Paint order: first is bottom. */
  objects: BoardObject[];
  ext?: Record<string, unknown>;
}

export interface Manifest {
  format: 'chalk';
  version: number;
  createdBy: string;
  createdAt: string;
  modifiedAt: string;
}

export type IdGen = () => string;
export const randomId: IdGen = () => crypto.randomUUID();
/** Deterministic ids for tests: "id-1", "id-2", … */
export function seqIds(prefix = 'id'): IdGen {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
