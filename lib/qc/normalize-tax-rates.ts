import type { Doc } from '../../convex/_generated/dataModel';
import {
  DEFAULT_RATE_MATRIX,
  DEFAULT_TAX_RATES,
  DEFAULT_USAGE_MULTIPLIERS,
  type NormalizedTaxRates,
} from './tax-rate-defaults';

type TaxRatesDoc = Doc<'taxRates'>;

function migrateLegacyZoneRates(zoneRates: Record<string, number>): Record<string, Record<string, number>> {
  const constructionKeys = Object.keys(DEFAULT_RATE_MATRIX.below_9m ?? {});
  const matrix: Record<string, Record<string, number>> = {};
  for (const [zone, rate] of Object.entries(zoneRates)) {
    matrix[zone] = {};
    for (const construction of constructionKeys) {
      matrix[zone]![construction] = rate;
    }
  }
  return Object.keys(matrix).length > 0 ? matrix : { ...DEFAULT_RATE_MATRIX };
}

/** Normalize stored taxRates rows, migrating legacy zoneRates when needed. */
export function normalizeStoredTaxRates(doc: TaxRatesDoc): NormalizedTaxRates {
  const rateMatrix =
    doc.rateMatrix && Object.keys(doc.rateMatrix).length > 0
      ? doc.rateMatrix
      : doc.zoneRates
        ? migrateLegacyZoneRates(doc.zoneRates)
        : DEFAULT_RATE_MATRIX;

  const wardRates = doc.wardRates ?? {};

  return {
    rateMatrix,
    wardRates,
    propertyTaxPct: doc.propertyTaxPct ?? DEFAULT_TAX_RATES.propertyTaxPct,
    waterTaxPct: doc.waterTaxPct ?? DEFAULT_TAX_RATES.waterTaxPct,
    drainageTaxPct: doc.drainageTaxPct ?? DEFAULT_TAX_RATES.drainageTaxPct,
    usageMultipliers:
      doc.usageMultipliers && Object.keys(doc.usageMultipliers).length > 0
        ? doc.usageMultipliers
        : DEFAULT_USAGE_MULTIPLIERS,
  };
}
