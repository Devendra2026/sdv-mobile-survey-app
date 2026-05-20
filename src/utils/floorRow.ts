/**
 * Floor row helpers — mirrors convex/areaMasters.ts for wizard drafts.
 */

const USAGE_FACTOR_VALUES = new Set([
  'residential',
  'commercial',
  'open_land_under_construction',
  'mix',
  'agriculture',
  'godown',
]);

export function normalizeFloorFields(input: { usageFactor?: string; usageType?: string }): {
  usageFactor: string;
  usageType: string;
} {
  let usageFactor = (input.usageFactor ?? '').trim();
  let usageType = (input.usageType ?? '').trim();
  if (!usageFactor && USAGE_FACTOR_VALUES.has(usageType)) {
    return { usageFactor: usageType, usageType: '' };
  }
  return { usageFactor, usageType };
}

/** Occupied when usage type is self-occupied or rented. */
export function usageTypeToOccupied(usageType: string): boolean {
  return usageType === 'self_occupied' || usageType === 'rented';
}
