/**
 * Taxation-step canonical dropdown values and idempotent masters seed.
 * Property-use subcategories are keyed by parent `property_use` value.
 */
import type { MutationCtx } from './_generated/server';

export type MasterOption = { value: string; label: string };

export const OWNERSHIP_TYPES: MasterOption[] = [
  { value: 'individual', label: 'Individual' },
  { value: 'joint', label: 'Joint' },
  { value: 'limited_company_firm', label: 'Limited company / firm' },
  { value: 'trust_society', label: 'Trust / Society' },
  { value: 'religious_body', label: 'Religious body' },
  { value: 'state_government_body', label: 'State government body' },
  { value: 'central_government_body', label: 'Central government body' },
  { value: 'municipal_council_town_panchayat', label: 'Municipal council / Town Panchayat' },
  { value: 'lease_property', label: 'Lease property' },
];

export const PROPERTY_USES: MasterOption[] = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'open_land', label: 'Open land' },
  { value: 'agricultural_land', label: 'Agricultural land' },
  { value: 'religious_property', label: 'Religious property' },
  { value: 'mix_property', label: 'Mix property' },
];

export const PROPERTY_USE_SUBCATEGORIES: Record<string, MasterOption[]> = {
  residential: [
    { value: 'residential_self', label: 'Residential self' },
    { value: 'residential_rented', label: 'Residential rented' },
  ],
  commercial: [
    { value: 'bank', label: 'Bank' },
    { value: 'shop', label: 'Shop' },
    { value: 'showroom', label: 'Showroom' },
    { value: 'godown', label: 'Godown' },
    { value: 'office', label: 'Office' },
    { value: 'mall', label: 'Mall' },
    { value: 'hospital', label: 'Hospital' },
    { value: 'school_college', label: 'School / College' },
    { value: 'petrol_pumps', label: 'Petrol pumps' },
    { value: 'marriage_home', label: 'Marriage home' },
    { value: 'hotel_restaurant', label: 'Hotel & restaurant' },
  ],
  mix_property: [{ value: 'residential_and_commercial', label: 'Residential & commercial' }],
};

export const PROPERTY_USES_REQUIRING_SUBCATEGORY = Object.keys(PROPERTY_USE_SUBCATEGORIES);

export const ROAD_TYPES: MasterOption[] = [
  { value: 'rcc', label: 'RCC' },
  { value: 'dambar', label: 'Dambar' },
  { value: 'kaccha', label: 'Kaccha' },
];

export const TAX_RATE_ZONES: MasterOption[] = [
  { value: 'below_9m', label: 'Below 9 meter' },
  { value: '9_to_12m', label: '9 to 12 meter' },
  { value: '12_to_24m', label: '12 to 24 meter' },
  { value: 'above_24m', label: '24 meter above' },
];

export const SITUATIONS: MasterOption[] = [
  { value: 'main_market', label: 'Main market' },
  { value: 'main_road', label: 'Main road' },
  { value: 'interior', label: 'Interior' },
];

const OWNERSHIP_SET = new Set(OWNERSHIP_TYPES.map((o) => o.value));
const PROPERTY_USE_SET = new Set(PROPERTY_USES.map((o) => o.value));
const ROAD_TYPE_SET = new Set(ROAD_TYPES.map((o) => o.value));
const TAX_ZONE_SET = new Set(TAX_RATE_ZONES.map((o) => o.value));
const SITUATION_SET = new Set(SITUATIONS.map((o) => o.value));

/** Retired mix subcategories — still accepted on read for older surveys. */
const LEGACY_MIX_SUBCATEGORIES = new Set(['mix_residential', 'mix_commercial']);

const SUBCATEGORY_BY_USE = new Map<string, Set<string>>();
for (const [use, opts] of Object.entries(PROPERTY_USE_SUBCATEGORIES)) {
  SUBCATEGORY_BY_USE.set(use, new Set(opts.map((o) => o.value)));
}

export function propertyUseRequiresSubcategory(propertyUse: string): boolean {
  return SUBCATEGORY_BY_USE.has(propertyUse);
}

export function isValidPropertyUseSubcategory(propertyUse: string, subcategory: string): boolean {
  if (propertyUse === 'mix_property' && LEGACY_MIX_SUBCATEGORIES.has(subcategory)) return true;
  const allowed = SUBCATEGORY_BY_USE.get(propertyUse);
  return allowed ? allowed.has(subcategory) : false;
}

export function validateTaxationSection(input: {
  ownershipType?: string;
  propertyUse?: string;
  propertyType?: string;
  situation?: string;
  roadType?: string;
  taxRateZone?: string;
}): Record<string, string[]> {
  const details: Record<string, string[]> = {};

  if (!input.ownershipType || !OWNERSHIP_SET.has(input.ownershipType)) {
    details.ownershipType = ['Select a valid ownership type'];
  }
  if (!input.propertyUse || !PROPERTY_USE_SET.has(input.propertyUse)) {
    details.propertyUse = ['Select a valid property use'];
  }
  const sub = input.propertyType?.trim() ?? '';
  if (input.propertyUse && propertyUseRequiresSubcategory(input.propertyUse)) {
    if (!sub || !isValidPropertyUseSubcategory(input.propertyUse, sub)) {
      details.propertyType = ['Select a valid property use subcategory'];
    }
  } else if (sub && input.propertyUse && !isValidPropertyUseSubcategory(input.propertyUse, sub)) {
    details.propertyType = ['Subcategory is not valid for this property use'];
  }
  if (!input.situation || !SITUATION_SET.has(input.situation)) {
    details.situation = ['Select a valid situation'];
  }
  if (!input.roadType || !ROAD_TYPE_SET.has(input.roadType)) {
    details.roadType = ['Select a valid road type'];
  }
  if (!input.taxRateZone || !TAX_ZONE_SET.has(input.taxRateZone)) {
    details.taxRateZone = ['Select a valid road size tax zone'];
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

/** Idempotent seed for taxation dropdown masters (dev + admin reference data). */
export async function seedTaxationMasters(ctx: MutationCtx) {
  await upsertMasterCategory(
    ctx,
    'ownership_type',
    OWNERSHIP_TYPES.map((o, i) => ({ ...o, position: i + 1 })),
  );
  await upsertMasterCategory(
    ctx,
    'property_use',
    PROPERTY_USES.map((o, i) => ({ ...o, position: i + 1 })),
  );
  let subPos = 1;
  for (const opts of Object.values(PROPERTY_USE_SUBCATEGORIES)) {
    for (const o of opts) {
      await upsertMasterCategory(ctx, 'property_use_subcategory', [{ ...o, position: subPos }]);
      subPos += 1;
    }
  }
  await upsertMasterCategory(
    ctx,
    'road_type',
    ROAD_TYPES.map((o, i) => ({ ...o, position: i + 1 })),
  );
  await upsertMasterCategory(
    ctx,
    'tax_rate_zone',
    TAX_RATE_ZONES.map((o, i) => ({ ...o, position: i + 1 })),
  );
  await upsertMasterCategory(
    ctx,
    'situation',
    SITUATIONS.map((o, i) => ({ ...o, position: i + 1 })),
  );

  for (const value of LEGACY_MIX_SUBCATEGORIES) {
    const row = await ctx.db
      .query('masters')
      .withIndex('by_category_value', (q) => q.eq('category', 'property_use_subcategory').eq('value', value))
      .unique();
    if (row?.isActive) await ctx.db.patch(row._id, { isActive: false });
  }
}
