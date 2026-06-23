/**
 * Field-level wizard validation — drives review missing-field summaries
 * and three-state step indicators (complete / in progress / incomplete).
 */
import { validateGpsCapture } from '@/convex/lib/gpsValidation';
import {
  altMobileError,
  constructedYearError,
  parcelNoError,
  primaryMobileError,
  unitNoError,
} from '@/convex/surveyFieldValidation';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import { stepCompletion } from '@/hooks/useWizardDraft';
import type { StepConfig } from '@/hooks/wizardSteps';
import { WIZARD_STEPS } from '@/hooks/wizardSteps';
import { isValidPinFormat } from '@/utils/addressValidation';
import { servicesStepComplete } from '@/utils/services';
import { surveyPhotosComplete } from '@/utils/surveyPhotos';
import { propertyUseRequiresSubcategory, taxationSubcategoryFieldLabel } from '@/utils/taxation';

export type StepStatus = 'complete' | 'in_progress' | 'incomplete';

export type StepValidationDetail = {
  key: StepConfig['key'];
  label: string;
  status: StepStatus;
  missingFields: string[];
};

function startMissing(d: WizardDraft): string[] {
  const missing: string[] = [];
  if (!d.assessmentYear) missing.push('Assessment year');
  if (!d.districtId) missing.push('District');
  if (!d.municipalityId) missing.push('ULB / municipality');
  return missing;
}

function propertyMissing(d: WizardDraft): string[] {
  const missing: string[] = [];
  if (!d.wardNo?.trim()) missing.push('Ward');
  const parcelErr = parcelNoError(d.parcelNo);
  if (parcelErr) missing.push(parcelErr);
  const unitErr = unitNoError(d.unitNo);
  if (unitErr) missing.push(unitErr);
  const yearErr = constructedYearError(d.constructedYear);
  if (yearErr) missing.push(yearErr);
  return missing;
}

function ownerMissing(d: WizardDraft): string[] {
  const missing: string[] = [];
  const owners = d.owners ?? [];
  if (!owners.length) {
    missing.push('Owner details');
    return missing;
  }
  const primaryErr = primaryMobileError(owners[0]?.mobileNo);
  if (primaryErr) missing.push(primaryErr);
  for (let i = 0; i < owners.length; i++) {
    const o = owners[i]!;
    const mobile = o.mobileNo?.trim();
    if (mobile && mobile.length > 0 && mobile.length !== 10) {
      missing.push(`Owner ${i + 1}: valid 10-digit mobile`);
    }
    const altErr = altMobileError(o.altMobileNo, o.mobileNo);
    if (altErr) missing.push(`Owner ${i + 1}: ${altErr}`);
  }
  if (d.familySize != null && (!Number.isInteger(d.familySize) || d.familySize < 1)) {
    missing.push('Family size must be at least 1');
  }
  return missing;
}

function addressMissing(d: WizardDraft): string[] {
  const missing: string[] = [];
  if (!d.locality?.trim()) missing.push('Locality');
  if (!d.colonyName?.trim()) missing.push('Colony name');
  const pin = (d.pinCode ?? '').replace(/\D/g, '').slice(0, 6);
  if (!isValidPinFormat(pin)) missing.push('PIN code (6 digits, not starting with 0)');
  else if (d.ulbPostalCode && pin !== d.ulbPostalCode) {
    missing.push(`PIN must match ULB postal code (${d.ulbPostalCode})`);
  }
  return missing;
}

function taxationMissing(d: WizardDraft): string[] {
  const missing: string[] = [];
  if (!d.ownershipType) missing.push('Ownership type');
  if (!d.propertyUse) missing.push('Property use');
  if (propertyUseRequiresSubcategory(d.propertyUse) && !d.propertyType?.trim()) {
    missing.push(taxationSubcategoryFieldLabel(d.propertyUse));
  }
  if (!d.situation) missing.push('Situation');
  if (!d.roadType) missing.push('Road type');
  if (!d.taxRateZone) missing.push('Tax rate zone');
  return missing;
}

function floorsMissing(d: WizardDraft): string[] {
  const missing: string[] = [];
  if ((d.plotSqft ?? 0) <= 0) missing.push('Plot area (sq ft)');
  const floors = d.floors ?? [];
  if (floors.length === 0) {
    missing.push('At least one floor');
    return missing;
  }
  floors.forEach((f, i) => {
    const label = f.floorName?.trim() || `Floor ${i + 1}`;
    if (!f.floorName?.trim()) missing.push(`${label}: name`);
    if (!(f.areaSqft > 0)) missing.push(`${label}: area`);
    if (!f.usageFactor) missing.push(`${label}: usage factor`);
    if (!f.usageType) missing.push(`${label}: usage type`);
    if (!f.constructionType) missing.push(`${label}: construction type`);
  });
  return missing;
}

function servicesMissing(d: WizardDraft): string[] {
  if (servicesStepComplete(d)) return [];
  const missing: string[] = [];
  if (d.municipalWaterConnection == null) missing.push('Municipal water connection');
  if (!d.waterSource) missing.push('Water source');
  if (!d.sanitationType) missing.push('Sanitation type');
  if (d.municipalWasteCollection == null) missing.push('Municipal waste collection');
  return missing;
}

function gpsMissing(d: WizardDraft): string[] {
  if (!d.gps) return ['GPS capture'];
  return validateGpsCapture(d.gps, { strict: true });
}

function photosMissing(d: WizardDraft): string[] {
  const missing: string[] = [];
  const photos = d.photos ?? [];
  const hasFront = photos.some((p) => p.slot === 'front');
  const hasSide = photos.some((p) => p.slot === 'side');
  if (!hasFront) missing.push('Front photo');
  if (!hasSide) missing.push('Side photo');
  if (!surveyPhotosComplete(photos) && hasFront && hasSide) missing.push('Required photos');
  return missing;
}

const MISSING_BY_STEP: Record<StepConfig['key'], (d: WizardDraft) => string[]> = {
  start: startMissing,
  property: propertyMissing,
  owner: ownerMissing,
  address: addressMissing,
  taxation: taxationMissing,
  floors: floorsMissing,
  services: servicesMissing,
  gps: gpsMissing,
  photos: photosMissing,
};

/** True when the step has meaningful partial data but is not complete. */
export function stepHasProgress(d: WizardDraft, key: StepConfig['key']): boolean {
  if (stepCompletion(d)[key]) return false;
  switch (key) {
    case 'start':
      return !!(d.assessmentYear || d.districtId || d.municipalityId);
    case 'property':
      return !!(d.wardNo || d.parcelNo || d.unitNo || d.constructedYear != null);
    case 'owner':
      return (d.owners ?? []).some((o) => !!(o.name?.trim() || o.mobileNo?.trim() || o.fatherOrHusbandName?.trim()));
    case 'address':
      return !!(d.locality?.trim() || d.colonyName?.trim() || d.pinCode?.trim() || d.houseNo?.trim());
    case 'taxation':
      return !!(d.ownershipType || d.propertyUse || d.situation || d.roadType || d.taxRateZone);
    case 'floors':
      return (d.plotSqft ?? 0) > 0 || (d.floors?.length ?? 0) > 0;
    case 'services':
      return (
        d.municipalWaterConnection != null ||
        !!d.waterSource ||
        !!d.sanitationType ||
        d.municipalWasteCollection != null
      );
    case 'gps':
      return !!d.gps;
    case 'photos':
      return (d.photos?.length ?? 0) > 0;
    default:
      return false;
  }
}

export function stepStatus(d: WizardDraft, key: StepConfig['key']): StepStatus {
  if (stepCompletion(d)[key]) return 'complete';
  if (stepHasProgress(d, key)) return 'in_progress';
  return 'incomplete';
}

export function stepValidationDetails(d: WizardDraft): StepValidationDetail[] {
  return WIZARD_STEPS.map((step) => {
    const status = stepStatus(d, step.key);
    const missingFields = status === 'complete' ? [] : MISSING_BY_STEP[step.key](d);
    return { key: step.key, label: step.label, status, missingFields };
  });
}

export function allMissingFields(d: WizardDraft): string[] {
  return stepValidationDetails(d).flatMap((s) => s.missingFields);
}

export function firstIncompleteStepRoute(d: WizardDraft): string | null {
  const incomplete = stepValidationDetails(d).find((s) => s.status !== 'complete');
  if (!incomplete) return null;
  const step = WIZARD_STEPS.find((s) => s.key === incomplete.key);
  return step?.route ?? null;
}
