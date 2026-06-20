import type { Doc } from '../../convex/_generated/dataModel';
import type {
  DemandNoticeDocumentProps,
  DemandNoticeFloorRow,
  DemandNoticeMastersBundle,
  DemandNoticeTaxBreakdown,
} from './demand-notice-document-types';
import type { NormalizedTaxRates } from './tax-rate-defaults';
import { DEFAULT_TAX_RATES } from './tax-rate-defaults';

function labelFor(options: Array<{ value: string; label: string }>, value: string | undefined): string {
  if (!value) return '';
  return options.find((o) => o.value === value)?.label ?? value;
}

function resolveRateMatrix(
  rateConfig: NormalizedTaxRates | null,
  wardNo: string,
  taxRateZone: string,
  constructionType: string,
): number {
  const config = rateConfig ?? DEFAULT_TAX_RATES;
  const wardRates = config.wardRates[wardNo.trim()];
  const zoneRates = wardRates?.[taxRateZone] ?? config.rateMatrix[taxRateZone] ?? config.rateMatrix.below_9m;
  return zoneRates?.[constructionType] ?? 0;
}

function usageMultiplier(rateConfig: NormalizedTaxRates | null, usageFactor: string, propertyUse: string): number {
  const config = rateConfig ?? DEFAULT_TAX_RATES;
  const key = usageFactor || propertyUse;
  return config.usageMultipliers[key] ?? config.usageMultipliers.residential ?? 1;
}

function computeTax(
  survey: Doc<'surveys'>,
  floors: DemandNoticeFloorRow[],
  rateConfig: NormalizedTaxRates | null,
): DemandNoticeTaxBreakdown {
  let grossAlv = 0;
  for (const floor of floors) {
    const panelRate = resolveRateMatrix(rateConfig, survey.wardNo, survey.taxRateZone, floor.constructionType);
    const mult = usageMultiplier(rateConfig, floor.usageFactor, survey.propertyUse);
    grossAlv += floor.areaSqft * panelRate * 12 * mult;
  }

  const config = rateConfig ?? DEFAULT_TAX_RATES;
  const assessableAlv = grossAlv * 0.8;
  const propertyTax = assessableAlv * config.propertyTaxPct;
  const waterTax = assessableAlv * config.waterTaxPct;
  const drainageTax = assessableAlv * config.drainageTaxPct;

  return {
    grossAlv: Math.round(grossAlv),
    assessableAlv: Math.round(assessableAlv),
    propertyTax: Math.round(propertyTax),
    waterTax: Math.round(waterTax),
    drainageTax: Math.round(drainageTax),
    totalDemand: Math.round(propertyTax + waterTax + drainageTax),
  };
}

export function buildDemandNoticeDocumentProps(
  survey: Doc<'surveys'>,
  floors: DemandNoticeFloorRow[],
  masters: DemandNoticeMastersBundle,
  rateConfig: NormalizedTaxRates | null,
  reportDateMs: number,
  photoUrls: { front: string | null; side: string | null },
  signatureUrl: string | null,
): DemandNoticeDocumentProps {
  const muni = masters.ulbs[0];
  const district = masters.districts[0];
  const tax = computeTax(survey, floors, rateConfig);

  return {
    surveyId: survey._id,
    reportDateMs,
    municipality: {
      name: muni?.name ?? survey.city,
      code: muni?.code ?? '',
      bodyType: muni?.bodyType ?? 'municipal_council',
    },
    district: {
      name: district?.name ?? '',
      stateName: district?.stateName ?? 'Uttar Pradesh',
    },
    survey: {
      propertyId: survey.propertyId,
      parcelNo: survey.parcelNo,
      unitNo: survey.unitNo,
      wardNo: survey.wardNo,
      houseNo: survey.houseNo,
      locality: survey.locality,
      colonyName: survey.colonyName,
      city: survey.city,
      pinCode: survey.pinCode,
      assessmentYear: survey.assessmentYear,
      ownershipType: survey.ownershipType,
      propertyUse: survey.propertyUse,
      propertyType: survey.propertyType,
      situation: survey.situation,
      roadType: survey.roadType,
      taxRateZone: survey.taxRateZone,
      plotSqft: survey.plotSqft,
      plinthSqft: survey.plinthSqft,
      respondentName: survey.respondentName,
      mobileNo: survey.mobileNo,
      owners: survey.owners,
    },
    floors,
    tax,
    rateConfig: rateConfig ?? DEFAULT_TAX_RATES,
    photoUrls,
    signatureUrl,
    labels: {
      ownershipType: labelFor(masters.ownershipTypes, survey.ownershipType),
      propertyUse: labelFor(masters.propertyUses, survey.propertyUse),
      situation: labelFor(masters.situations, survey.situation),
      roadType: labelFor(masters.roadTypes, survey.roadType),
      taxRateZone: labelFor(masters.taxRateZones, survey.taxRateZone),
    },
  };
}

export type { DemandNoticeMastersBundle };
