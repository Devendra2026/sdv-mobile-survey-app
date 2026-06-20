/**
 * Services-step canonical dropdown values, validators, and idempotent masters seed.
 */
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";

export type MasterOption = { value: string; label: string };

/** Canonical options always win; guarantees dropdown values match survey validators. */
export function mergeMasterOptions(canonical: MasterOption[], fromDb?: MasterOption[]): MasterOption[] {
  const byValue = new Map<string, MasterOption>();
  for (const o of fromDb ?? []) {
    const value = o.value?.trim();
    if (value) byValue.set(value, { value, label: o.label });
  }
  for (const o of canonical) {
    byValue.set(o.value, o);
  }
  return canonical.map((c) => byValue.get(c.value)!);
}

/** Source of water — stored value → display label. */
export const WATER_SOURCES: MasterOption[] = [
  { value: "government_tap", label: "Government Tap" },
  { value: "dug_well", label: "Dug well" },
  { value: "borewell", label: "Borewell" },
  { value: "other", label: "Other." },
];

/** Sanitation type — stored value → display label. */
export const SANITATION_TYPES: MasterOption[] = [
  { value: "sewer_system", label: "Connect to sewer system" },
  { value: "septic_tank", label: "Connected to Septic Tank." },
  { value: "surface_drain", label: "Connected to Surface drain." },
  { value: "no_toilet", label: "No Toilet" },
  { value: "other", label: "Other." },
];

export const WATER_SOURCE_VALUES = WATER_SOURCES.map((o) => o.value) as [
  "government_tap",
  "dug_well",
  "borewell",
  "other",
];

export const SANITATION_TYPE_VALUES = SANITATION_TYPES.map((o) => o.value) as [
  "sewer_system",
  "septic_tank",
  "surface_drain",
  "no_toilet",
  "other",
];

export const waterSource = v.union(
  v.literal("government_tap"),
  v.literal("dug_well"),
  v.literal("borewell"),
  v.literal("other"),
);

export const sanitationType = v.union(
  v.literal("sewer_system"),
  v.literal("septic_tank"),
  v.literal("surface_drain"),
  v.literal("no_toilet"),
  v.literal("other"),
);

const WATER_SOURCE_SET = new Set<string>(WATER_SOURCE_VALUES);
const SANITATION_SET = new Set<string>(SANITATION_TYPE_VALUES);

export function isValidWaterSource(value: string): boolean {
  return WATER_SOURCE_SET.has(value);
}

export function isValidSanitationType(value: string): boolean {
  return SANITATION_SET.has(value);
}

export function validateWaterAndSanitation(input: {
  waterSource?: string;
  sanitationType?: string;
}): Record<string, string[]> {
  const details: Record<string, string[]> = {};

  const water = input.waterSource?.trim() ?? "";
  if (!water) {
    details.waterSource = ["Source of water is required"];
  } else if (!isValidWaterSource(water)) {
    details.waterSource = ["Select a valid source of water"];
  }

  const sanitation = input.sanitationType?.trim() ?? "";
  if (!sanitation) {
    details.sanitationType = ["Sanitation type is required"];
  } else if (!isValidSanitationType(sanitation)) {
    details.sanitationType = ["Select a valid sanitation type"];
  }

  return details;
}

export function validateServicesSection(
  input: {
    municipalWaterConnection?: boolean;
    waterSource?: string;
    sanitationType?: string;
    municipalWasteCollection?: boolean;
  },
  mode: "draft" | "submit" = "submit",
): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  const strict = mode === "submit";

  if (strict && typeof input.municipalWaterConnection !== "boolean") {
    details.municipalWaterConnection = ["Select Yes or No for municipal water connection"];
  }

  if (strict) {
    Object.assign(details, validateWaterAndSanitation(input));
  } else {
    const water = input.waterSource?.trim() ?? "";
    if (water && !isValidWaterSource(water)) {
      details.waterSource = ["Select a valid water source"];
    }
    const sanitation = input.sanitationType?.trim() ?? "";
    if (sanitation && !isValidSanitationType(sanitation)) {
      details.sanitationType = ["Select a valid sanitation type"];
    }
  }

  if (strict && typeof input.municipalWasteCollection !== "boolean") {
    details.municipalWasteCollection = ["Select Yes or No for door-to-door waste collection"];
  }

  return details;
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

/** Idempotent seed for services dropdown masters (dev + admin reference data). */
export async function seedServiceMasters(ctx: MutationCtx) {
  await Promise.all([
    upsertMasterCategory(
      ctx,
      "water_source",
      WATER_SOURCES.map((o, i) => ({ ...o, position: i + 1 })),
    ),
    upsertMasterCategory(
      ctx,
      "sanitation_type",
      SANITATION_TYPES.map((o, i) => ({ ...o, position: i + 1 })),
    ),
  ]);

  const legacySolidWaste = (await ctx.db.query("masters").collect()).filter((m) => m.category === "solid_waste_type");
  await Promise.all(
    legacySolidWaste.map(async (row) => {
      if (row.isActive) await ctx.db.patch(row._id, { isActive: false });
    }),
  );
}
