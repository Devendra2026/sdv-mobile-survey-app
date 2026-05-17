/** Client-side taxation step helpers (mirrors convex/taxationMasters rules). */

export const PROPERTY_USES_REQUIRING_SUBCATEGORY = ['residential', 'commercial', 'mix_property'] as const;

export function propertyUseRequiresSubcategory(propertyUse?: string): boolean {
  if (!propertyUse) return false;
  return (PROPERTY_USES_REQUIRING_SUBCATEGORY as readonly string[]).includes(propertyUse);
}

export function taxationSubcategoryComplete(propertyUse?: string, propertyType?: string): boolean {
  if (!propertyUseRequiresSubcategory(propertyUse)) return true;
  return Boolean(propertyType?.trim());
}
