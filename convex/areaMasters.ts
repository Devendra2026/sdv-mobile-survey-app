/**
 * Area-detail step — floor numbers, usage factor/type, construction, and plot/plinth rules.
 */
import type { MutationCtx } from "./_generated/server";

export type MasterOption = { value: string; label: string };

export const FLOOR_NAMES: MasterOption[] = [
  { value: "basement", label: "Basement" },
  { value: "ground_floor", label: "Ground floor" },
  { value: "first_floor", label: "First floor" },
  { value: "second_floor", label: "Second floor" },
  { value: "third_floor", label: "Third floor" },
  { value: "fourth_floor", label: "Fourth floor" },
  { value: "fifth_floor", label: "Fifth floor" },
  { value: "open_land", label: "Open land" },
];

/** Usage factor — how the floor area is used (Area wizard). */
export const FLOOR_USAGE_FACTORS: MasterOption[] = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "open_land_under_construction", label: "Open land / under construction" },
  { value: "mix", label: "Mix" },
  { value: "agriculture", label: "Agriculture" },
  { value: "godown", label: "Godown" },
];

/** Usage type — occupancy (self-occupied vs rented). */
export const FLOOR_USAGE_TYPES: MasterOption[] = [
  { value: "self_occupied", label: "Self-Occupied" },
  { value: "rented", label: "Rented" },
];

export const CONSTRUCTION_TYPES: MasterOption[] = [
  { value: "pakka_rcc_rb", label: "Pakka Building with RCC roof/ R.B Roof" },
  { value: "tin_shed", label: "Tin Shed" },
  { value: "open_land_plot", label: "Open Land (plot)" },
  { value: "under_construction", label: "Under construction" },
  { value: "kaccha_building", label: "Kaccha building" },
];

const FLOOR_SET = new Set(FLOOR_NAMES.map((o) => o.value));
const USAGE_FACTOR_SET = new Set(FLOOR_USAGE_FACTORS.map((o) => o.value));
const USAGE_TYPE_SET = new Set(FLOOR_USAGE_TYPES.map((o) => o.value));
const CONSTRUCTION_SET = new Set(CONSTRUCTION_TYPES.map((o) => o.value));

export function normalizeFloorFields(input: { usageFactor?: string; usageType?: string }): {
  usageFactor: string;
  usageType: string;
} {
  let usageFactor = (input.usageFactor ?? "").trim();
  let usageType = (input.usageType ?? "").trim();
  if (!usageFactor && USAGE_FACTOR_SET.has(usageType)) {
    return { usageFactor: usageType, usageType: "" };
  }
  return { usageFactor, usageType };
}

export function usageTypeToOccupied(usageType: string): boolean {
  return usageType === "self_occupied" || usageType === "rented";
}

/** Normalize floor usage fields for API responses (legacy rows may omit `usageFactor`). */
export function presentFloorRow<T extends { usageFactor?: string; usageType: string; isOccupied: boolean }>(
  row: T,
): T & { usageFactor: string; usageType: string; isOccupied: boolean } {
  const normalized = normalizeFloorFields({
    usageFactor: row.usageFactor,
    usageType: row.usageType,
  });
  return {
    ...row,
    usageFactor: normalized.usageFactor,
    usageType: normalized.usageType,
    isOccupied: normalized.usageType ? usageTypeToOccupied(normalized.usageType) : row.isOccupied,
  };
}

export function isOpenLandFloor(floorName: string | undefined): boolean {
  return floorName === "open_land";
}

export function validateFloorRow(input: {
  floorName?: string;
  usageFactor?: string;
  usageType?: string;
  constructionType?: string;
  areaSqft?: number;
}): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  const { usageFactor, usageType } = normalizeFloorFields(input);

  if (!input.floorName || !FLOOR_SET.has(input.floorName)) {
    details.floorName = ["Select a valid floor"];
  }
  if (!usageFactor || !USAGE_FACTOR_SET.has(usageFactor)) {
    details.usageFactor = ["Select a valid usage factor"];
  }
  if (!usageType || !USAGE_TYPE_SET.has(usageType)) {
    details.usageType = ["Select a valid usage type"];
  }
  if (!input.constructionType || !CONSTRUCTION_SET.has(input.constructionType)) {
    details.constructionType = ["Select a valid construction type"];
  }
  const area = input.areaSqft;
  if (typeof area !== "number" || !(area > 0)) {
    details.areaSqft = ["Enter floor area greater than 0"];
  }
  return details;
}

export function validatePlotSection(input: { plotSqft?: number; plinthSqft?: number }): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  const plot = input.plotSqft;
  if (typeof plot !== "number" || !(plot > 0)) {
    details.plotSqft = ["Enter plot area greater than 0"];
  }
  const plinth = input.plinthSqft ?? 0;
  if (typeof plinth === "number" && plinth < 0) {
    details.plinthSqft = ["Plinth area cannot be negative"];
  }
  if (typeof plot === "number" && typeof plinth === "number" && plinth > plot) {
    details.plinthSqft = ["Plinth area cannot exceed plot area"];
  }
  return details;
}

export function builtUpSqftFromFloors(floors: { floorName: string; areaSqft: number }[]): number {
  return floors.reduce((sum, f) => {
    if (isOpenLandFloor(f.floorName)) return sum;
    return sum + (f.areaSqft > 0 ? f.areaSqft : 0);
  }, 0);
}

export function openLandSqftFromFloors(floors: { floorName: string; areaSqft: number }[]): number {
  return floors.reduce((sum, f) => {
    if (!isOpenLandFloor(f.floorName)) return sum;
    return sum + (f.areaSqft > 0 ? f.areaSqft : 0);
  }, 0);
}

export function plinthSqftFromFloors(floors: { floorName: string; areaSqft: number }[]): number {
  const ground = floors.find((f) => f.floorName === "ground_floor");
  return ground && ground.areaSqft > 0 ? ground.areaSqft : 0;
}

export function validateAreaSection(input: {
  plotSqft?: number;
  plinthSqft?: number;
  floorAreasSqft?: number[];
  floors?: { floorName: string; areaSqft: number }[];
}): Record<string, string[]> {
  const details = validatePlotSection(input);
  const floorRows = input.floors ?? (input.floorAreasSqft ?? []).map((areaSqft) => ({ floorName: "", areaSqft }));
  if (floorRows.length === 0) {
    details.floors = ["Add at least one floor row"];
  }
  const builtUp = builtUpSqftFromFloors(floorRows);
  const openLand = openLandSqftFromFloors(floorRows);
  if (floorRows.length > 0 && builtUp <= 0 && openLand <= 0) {
    details.floors = ["Each floor must have area greater than 0"];
  }
  return details;
}

/** When plot was not saved on the survey row, infer it from floor rows (open land / mobile sync). */
export function derivePlotSqftForSubmit(
  plotSqft: number | undefined,
  floors: { floorName: string; areaSqft: number }[],
): number {
  if (typeof plotSqft === "number" && plotSqft > 0) return plotSqft;
  const openLand = openLandSqftFromFloors(floors);
  const builtUp = builtUpSqftFromFloors(floors);
  if (openLand > 0 && builtUp <= 0) return openLand;
  if (builtUp > 0) return Math.max(builtUp, openLand);
  return 0;
}

type SeedRow = MasterOption & { position: number };

async function upsertMasterCategory(ctx: MutationCtx, category: string, rows: SeedRow[]) {
  await Promise.all(
    rows.map(async (row) => {
      const existing = await ctx.db
        .query("masters")
        .withIndex("by_category_value", (q) => q.eq("category", category).eq("value", row.value))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { label: row.label, position: row.position, isActive: true });
      } else {
        await ctx.db.insert("masters", {
          category,
          value: row.value,
          label: row.label,
          position: row.position,
          isActive: true,
        });
      }
    }),
  );
}

/** Idempotent seed for area-detail dropdown masters. */
export async function seedAreaMasters(ctx: MutationCtx) {
  await Promise.all([
    upsertMasterCategory(
      ctx,
      "floor_name",
      FLOOR_NAMES.map((o, i) => ({ ...o, position: i + 1 })),
    ),
    upsertMasterCategory(
      ctx,
      "usage_factor",
      FLOOR_USAGE_FACTORS.map((o, i) => ({ ...o, position: i + 1 })),
    ),
    upsertMasterCategory(
      ctx,
      "floor_usage_type",
      FLOOR_USAGE_TYPES.map((o, i) => ({ ...o, position: i + 1 })),
    ),
    upsertMasterCategory(
      ctx,
      "construction_type",
      CONSTRUCTION_TYPES.map((o, i) => ({ ...o, position: i + 1 })),
    ),
  ]);
  const legacyUsageTypeRows = (await ctx.db.query("masters").collect()).filter((m) => m.category === "usage_type");
  await Promise.all(
    legacyUsageTypeRows.map(async (row) => {
      if (row.isActive) await ctx.db.patch(row._id, { isActive: false });
    }),
  );
  await migrateFloorUsageFields(ctx);
}

/** Backfill `usageFactor` on floor rows created before the field existed. */
export async function migrateFloorUsageFields(ctx: MutationCtx) {
  const rows = await ctx.db.query("floors").collect();
  await Promise.all(
    rows.map(async (row) => {
      const normalized = normalizeFloorFields({
        usageFactor: row.usageFactor,
        usageType: row.usageType,
      });
      const nextOccupied = usageTypeToOccupied(normalized.usageType);
      if (
        row.usageFactor === normalized.usageFactor &&
        row.usageType === normalized.usageType &&
        row.isOccupied === nextOccupied
      ) {
        return;
      }
      await ctx.db.patch(row._id, {
        usageFactor: normalized.usageFactor || undefined,
        usageType: normalized.usageType,
        isOccupied: nextOccupied,
      });
    }),
  );
}
