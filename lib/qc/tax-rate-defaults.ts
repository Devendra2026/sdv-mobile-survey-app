/** System-default tax rate configuration when a ULB has no custom row. */

export const DEFAULT_RATE_MATRIX: Record<string, Record<string, number>> = {
  below_9m: {
    pakka_rcc_rb: 6.12,
    tin_shed: 3.06,
    open_land_plot: 1.53,
    under_construction: 3.06,
    kaccha_building: 2.04,
  },
  '9_to_12m': {
    pakka_rcc_rb: 7.65,
    tin_shed: 3.83,
    open_land_plot: 1.91,
    under_construction: 3.83,
    kaccha_building: 2.55,
  },
  '12_to_24m': {
    pakka_rcc_rb: 9.18,
    tin_shed: 4.59,
    open_land_plot: 2.3,
    under_construction: 4.59,
    kaccha_building: 3.06,
  },
  above_24m: {
    pakka_rcc_rb: 10.71,
    tin_shed: 5.36,
    open_land_plot: 2.68,
    under_construction: 5.36,
    kaccha_building: 3.57,
  },
};

export const DEFAULT_USAGE_MULTIPLIERS: Record<string, number> = {
  residential: 1,
  commercial: 2,
  open_land_under_construction: 1,
  mix: 1.5,
  agriculture: 0.5,
  godown: 1.5,
  self_occupied: 1,
  rented: 1,
};

export const DEFAULT_TAX_RATES = {
  rateMatrix: DEFAULT_RATE_MATRIX,
  wardRates: {} as Record<string, Record<string, Record<string, number>>>,
  propertyTaxPct: 0.1,
  waterTaxPct: 0.05,
  drainageTaxPct: 0.03,
  usageMultipliers: DEFAULT_USAGE_MULTIPLIERS,
};

export type NormalizedTaxRates = typeof DEFAULT_TAX_RATES;
