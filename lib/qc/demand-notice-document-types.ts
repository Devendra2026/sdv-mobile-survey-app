import type { Doc } from '../../convex/_generated/dataModel';
import type { NormalizedTaxRates } from './tax-rate-defaults';

export type DemandNoticeMastersBundle = {
  updatedAt: number;
  districts: Array<{ _id: Doc<'districts'>['_id']; name: string; stateName: string }>;
  ulbs: Array<{
    _id: Doc<'municipalities'>['_id'];
    code: string;
    name: string;
    bodyType: Doc<'municipalities'>['bodyType'];
    districtId: Doc<'districts'>['_id'];
    stateName: string;
  }>;
  wards: Array<{ wardNo: string; name: string }>;
  tenantScope: null;
  assessmentYears: Array<{ value: string; label: string }>;
  ownershipTypes: Array<{ value: string; label: string }>;
  propertyUses: Array<{ value: string; label: string }>;
  propertyUseSubcategories: Record<string, Array<{ value: string; label: string }>>;
  propertyUsesRequiringSubcategory: string[];
  situations: Array<{ value: string; label: string }>;
  roadTypes: Array<{ value: string; label: string }>;
  taxRateZones: Array<{ value: string; label: string }>;
  relationships: Array<{ value: string; label: string }>;
  waterSources: Array<{ value: string; label: string }>;
  sanitationTypes: Array<{ value: string; label: string }>;
  usageFactors: Array<{ value: string; label: string }>;
  usageTypes: Array<{ value: string; label: string }>;
  constructionTypes: Array<{ value: string; label: string }>;
  floors: Array<{ value: string; label: string }>;
};

export type DemandNoticeFloorRow = {
  floorName: string;
  usageFactor: string;
  usageType: string;
  constructionType: string;
  isOccupied: boolean;
  areaSqft: number;
  position: number;
};

export type DemandNoticeTaxBreakdown = {
  grossAlv: number;
  assessableAlv: number;
  propertyTax: number;
  waterTax: number;
  drainageTax: number;
  totalDemand: number;
};

export type DemandNoticeDocumentProps = {
  surveyId: Doc<'surveys'>['_id'];
  reportDateMs: number;
  municipality: { name: string; code: string; bodyType: string };
  district: { name: string; stateName: string };
  survey: {
    propertyId?: string;
    parcelNo: string;
    unitNo: string;
    wardNo: string;
    houseNo?: string;
    locality: string;
    colonyName: string;
    city: string;
    pinCode: string;
    assessmentYear: string;
    ownershipType: string;
    propertyUse: string;
    propertyType: string;
    situation: string;
    roadType: string;
    taxRateZone: string;
    plotSqft: number;
    plinthSqft: number;
    respondentName?: string;
    mobileNo: string;
    owners?: Doc<'surveys'>['owners'];
  };
  floors: DemandNoticeFloorRow[];
  tax: DemandNoticeTaxBreakdown;
  rateConfig: NormalizedTaxRates;
  photoUrls: { front: string | null; side: string | null };
  signatureUrl: string | null;
  labels: Record<string, string>;
};
