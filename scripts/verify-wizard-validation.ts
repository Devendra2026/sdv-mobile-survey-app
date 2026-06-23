/**
 * Validates wizard step completion and field-level missing summaries.
 * Run via: npm run verify:wizard
 */
import type { WizardDraft } from '../src/hooks/useWizardDraft';
import { stepCompletion } from '../src/hooks/useWizardDraft';
import { allMissingFields, stepHasProgress, stepValidationDetails } from '../src/utils/wizardValidation';

let failed = false;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[verify-wizard-validation] FAIL — ${msg}`);
    failed = true;
  }
}

function emptyDraft(): WizardDraft {
  return {
    localId: 'ls_test',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    floors: [],
    photos: [],
    owners: [{ clientOwnerId: 'ow_1' }],
  };
}

const d = emptyDraft();
assert(
  stepValidationDetails(d).every((s) => s.status === 'incomplete'),
  'empty draft steps are incomplete',
);
assert(allMissingFields(d).length > 0, 'empty draft has missing fields');
assert(!Object.values(stepCompletion(d)).every(Boolean), 'empty draft is not complete');

const partial: WizardDraft = {
  ...d,
  assessmentYear: '2024-25',
  districtId: 'district1' as WizardDraft['districtId'],
};
assert(stepHasProgress(partial, 'start'), 'partial start has progress');
assert(stepValidationDetails(partial).find((s) => s.key === 'start')?.status === 'in_progress', 'start in progress');

const completeStart: WizardDraft = {
  ...partial,
  municipalityId: 'muni1' as WizardDraft['municipalityId'],
};
assert(stepCompletion(completeStart).start, 'start complete when tenancy set');
assert(
  stepValidationDetails(completeStart).find((s) => s.key === 'start')?.status === 'complete',
  'start marked complete',
);

const badParcel: WizardDraft = {
  ...completeStart,
  wardNo: '1',
  parcelNo: '12',
  unitNo: '001',
};
const propertyDetail = stepValidationDetails(badParcel).find((s) => s.key === 'property');
assert(propertyDetail?.status === 'in_progress', 'invalid parcel is in progress');
assert(propertyDetail?.missingFields.some((m) => /5 digits/i.test(m)) ?? false, 'parcel error mentions 5 digits');

const goodProperty: WizardDraft = {
  ...badParcel,
  parcelNo: '00012',
};
assert(stepCompletion(goodProperty).property, 'valid parcel completes property step');

if (failed) {
  process.exit(1);
}

console.log('[verify-wizard-validation] OK — step status and missing-field summaries behave as expected.');
