import type { BoardObject, IdGen } from '../../model/types';

export interface RescueReport {
  counts: { groups: number; strokes: number; points: number; images: number; unsupported: Record<string, number> };
  substitutions: { texture: string; strokes: number }[];
  skipped: { sourceId: string | null; reason: string }[];
  warnings: string[];
}

export interface ImportCtx {
  idGen: IdGen;
  skipped: RescueReport['skipped'];
  warnings: Set<string>;
  substitutions: Map<string, number>;
  unsupported: Record<string, number>;
  transformed: number;
}

export function newCtx(idGen: IdGen): ImportCtx {
  return { idGen, skipped: [], warnings: new Set(), substitutions: new Map(), unsupported: {}, transformed: 0 };
}

export function skip(ctx: ImportCtx, sourceId: string | null, reason: string): void {
  ctx.skipped.push({ sourceId, reason });
}

export function buildReport(ctx: ImportCtx, objects: BoardObject[]): RescueReport {
  let groups = 0, strokes = 0, points = 0, images = 0;
  for (const o of objects) {
    if (o.kind === 'group') {
      groups++;
      strokes += o.children.length;
      for (const c of o.children) points += c.points.length / 2;
    } else if (o.kind === 'stroke') {
      strokes++;
      points += o.points.length / 2;
    } else if (o.kind === 'image') images++;
  }
  if (ctx.transformed > 0) ctx.warnings.add(`${ctx.transformed} object(s) are rotated or scaled; check their placement.`);
  return {
    counts: { groups, strokes, points, images, unsupported: { ...ctx.unsupported } },
    substitutions: [...ctx.substitutions].map(([texture, n]) => ({ texture, strokes: n })),
    skipped: ctx.skipped,
    warnings: [...ctx.warnings],
  };
}
