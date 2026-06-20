/** Client-side taxation step helpers (mirrors convex/taxationMasters rules). */

const RETIRED_PROPERTY_USE_VALUES = ['agricultural_land'] as const;

const PROPERTY_USES_REQUIRING_SUBCATEGORY = [
  'residential',
  'commercial',
  'open_land',
  'religious_property',
  'mix_property',
] as const;

export function propertyUseRequiresSubcategory(propertyUse?: string): boolean {
  if (!propertyUse) return false;
  return (PROPERTY_USES_REQUIRING_SUBCATEGORY as readonly string[]).includes(propertyUse);
}

export function taxationSubcategoryFieldLabel(propertyUse?: string): string {
  if (propertyUse === 'residential') return 'Residential type';
  if (propertyUse === 'commercial') return 'Commercial type';
  if (propertyUse === 'open_land') return 'Open land';
  if (propertyUse === 'religious_property') return 'Religious property';
  if (propertyUse === 'mix_property') return 'Mix type';
  return 'Property type';
}

export function filterActivePropertyUses<T extends { value: string }>(options: T[]): T[] {
  return options.filter((o) => !(RETIRED_PROPERTY_USE_VALUES as readonly string[]).includes(o.value));
}

export function taxationSubcategoryComplete(propertyUse?: string, propertyType?: string): boolean {
  if (!propertyUseRequiresSubcategory(propertyUse)) return true;
  return Boolean(propertyType?.trim());
}
