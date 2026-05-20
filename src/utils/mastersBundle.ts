import type { FunctionReturnType } from 'convex/server';

import { api } from '@/convex/_generated/api';
import { mergeMasterOptions, SANITATION_TYPES, WATER_SOURCES } from '@/utils/services';

export type MastersBundle = FunctionReturnType<typeof api.masters.bundle>;

type MasterOption = { value: string; label: string };

const emptyOptions: MasterOption[] = [];

/** Ensures list fields exist — safe when Convex cache predates `districts` on bundle. */
export function normalizeMastersBundle(bundle: MastersBundle): MastersBundle {
  return {
    ...bundle,
    districts: bundle.districts ?? [],
    ulbs: bundle.ulbs ?? [],
    wards: bundle.wards ?? [],
    assessmentYears: bundle.assessmentYears ?? emptyOptions,
    ownershipTypes: bundle.ownershipTypes ?? emptyOptions,
    propertyUses: bundle.propertyUses ?? emptyOptions,
    propertyUseSubcategories: bundle.propertyUseSubcategories ?? {},
    propertyUsesRequiringSubcategory: bundle.propertyUsesRequiringSubcategory ?? [],
    situations: bundle.situations ?? emptyOptions,
    roadTypes: bundle.roadTypes ?? emptyOptions,
    taxRateZones: bundle.taxRateZones ?? emptyOptions,
    relationships: bundle.relationships ?? emptyOptions,
    waterSources: mergeMasterOptions([...WATER_SOURCES], bundle.waterSources),
    sanitationTypes: mergeMasterOptions([...SANITATION_TYPES], bundle.sanitationTypes),
    usageFactors: bundle.usageFactors ?? bundle.usageTypes ?? emptyOptions,
    usageTypes: bundle.usageTypes ?? emptyOptions,
    constructionTypes: bundle.constructionTypes ?? emptyOptions,
    floors: bundle.floors ?? emptyOptions,
  };
}
