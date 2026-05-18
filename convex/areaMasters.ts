/**
 * Area-detail step — floor numbers, usage, construction, and plot/plinth rules.
 */
import type { MutationCtx } from './_generated/server';

export type MasterOption = { value: string; label: string };

export const FLOOR_NAMES: MasterOption[] = [
  { value: 'basement', label: 'Basement' },
  { value: 'ground_floor', label: 'Ground floor' },
  { value: 'first_floor', label: 'First floor' },
  { value: 'second_floor', label: 'Second floor' },
  { value: 'third_floor', label: 'Third floor' },
  { value: 'fourth_floor', label: 'Fourth floor' },
  { value: 'fifth_floor', label: 'Fifth floor' },
  { value: 'open_land', label: 'Open land' },
];

export const FLOOR_USAGE_TYPES: MasterOption[] = [
  { value: 'self_occupied', label: 'Self-Occupied' },
  { value: 'rented', label: 'Rented' },
];

export const CONSTRUCTION_TYPES: MasterOption[] = [
  { value: 'pakka_rcc_rb', label: 'Pakka Building with RCC roof/ R.B Roof' },
  { value: 'tin_shed', label: 'Tin Shed' },
  { value: 'open_land_plot', label: 'Open Land (plot)' },
  { value: 'under_construction', label: 'Under construction' },
  { value: 'kaccha_building', label: 'Kaccha building' },
];

const FLOOR_SET = new Set(FLOOR_NAMES.map((o) => o.value));
const USAGE_SET = new Set(FLOOR_USAGE_TYPES.map((o) => o.value));
const CONSTRUCTION_SET = new Set(CONSTRUCTION_TYPES.map((o) => o.value));

export function usageTypeToOccupied(usageType: string): boolean {
  return usageType === 'self_occupied' || usageType === 'rented';
}

export function isOpenLandFloor(floorName: string | undefined): boolean {
  return floorName === 'open_land';
}

export function validateFloorRow(input: {
  floorName?: string;
  usageType?: string;
  constructionType?: string;
  areaSqft?: number;
}): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  if (!input.floorName || !FLOOR_SET.has(input.floorName)) {
    details.floorName = ['Select a valid floor'];
  }
  const openLand = isOpenLandFloor(input.floorName);
  if (!openLand) {
    if (!input.usageType || !USAGE_SET.has(input.usageType)) {
      details.usageType = ['Select a valid usage type'];
    }
    if (!input.constructionType || !CONSTRUCTION_SET.has(input.constructionType)) {
      details.constructionType = ['Select a valid construction type'];
    }
  }
  const area = input.areaSqft;
  if (typeof area !== 'number' || !(area > 0)) {
    details.areaSqft = ['Enter floor area greater than 0'];
  }
  return details;
}

export function validatePlotSection(input: { plotSqft?: number; plinthSqft?: number }): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  const plot = input.plotSqft;
  if (typeof plot !== 'number' || !(plot > 0)) {
    details.plotSqft = ['Enter plot area greater than 0'];
  }
  const plinth = input.plinthSqft ?? 0;
  if (typeof plinth === 'number' && plinth < 0) {
    details.plinthSqft = ['Plinth area cannot be negative'];
  }
  if (typeof plot === 'number' && typeof plinth === 'number' && plinth > plot) {
    details.plinthSqft = ['Plinth area cannot exceed plot area'];
  }
  return details;
}

export function validateAreaSection(input: {
  plotSqft?: number;
  plinthSqft?: number;
  floorAreasSqft?: number[];
}): Record<string, string[]> {
  const details = validatePlotSection(input);
  const floors = input.floorAreasSqft ?? [];
  if (floors.length === 0) {
    details.floors = ['Add at least one floor row'];
  }
  const builtUp = floors.reduce((s, a) => s + (a > 0 ? a : 0), 0);
  if (floors.length > 0 && builtUp <= 0) {
    details.floors = ['Each floor must have area greater than 0'];
  }
  return details;
}

type SeedRow = MasterOption & { position: number };

async function upsertMasterCategory(ctx: MutationCtx, category: string, rows: SeedRow[]) {
  for (const row of rows) {
    const existing = await ctx.db
      .query('masters')
      .withIndex('by_category_value', (q) => q.eq('category', category).eq('value', row.value))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { label: row.label, position: row.position, isActive: true });
    } else {
      await ctx.db.insert('masters', {
        category,
        value: row.value,
        label: row.label,
        position: row.position,
        isActive: true,
      });
    }
  }
}

/** Idempotent seed for area-detail dropdown masters. */
export async function seedAreaMasters(ctx: MutationCtx) {
  await upsertMasterCategory(
    ctx,
    'floor_name',
    FLOOR_NAMES.map((o, i) => ({ ...o, position: i + 1 })),
  );
  await upsertMasterCategory(
    ctx,
    'usage_type',
    FLOOR_USAGE_TYPES.map((o, i) => ({ ...o, position: i + 1 })),
  );
  await upsertMasterCategory(
    ctx,
    'construction_type',
    CONSTRUCTION_TYPES.map((o, i) => ({ ...o, position: i + 1 })),
  );
}
