/**
 * Flat question catalog for one-question-at-a-time wizard flow.
 * Complex steps (floors, photos, GPS) remain on dedicated wizard screens.
 */
import {
  isValidParcelNo,
  isValidUnitNo,
  parcelNoError,
  primaryMobileError,
  sanitizeFixedDigits,
  unitNoError,
} from '../../convex/surveyFieldValidation';
import type { WizardDraft } from '@/hooks/useWizardDraft';

export type QuestionKind = 'text' | 'number' | 'redirect';

export interface SurveyQuestion {
  id: string;
  section: string;
  label: string;
  helper?: string;
  kind: QuestionKind;
  /** Draft field key for text/number questions */
  field?: keyof WizardDraft | 'owners.0.mobileNo';
  required?: boolean;
  keyboard?: 'default' | 'number-pad' | 'phone-pad';
  /** Route to open for redirect steps */
  redirectRoute?: string;
}

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  { id: 'parcel', section: 'Property', label: 'Parcel / plot number', field: 'parcelNo', kind: 'text', required: true },
  { id: 'unit', section: 'Property', label: 'Unit / house number', field: 'unitNo', kind: 'text', required: true },
  {
    id: 'property_details',
    section: 'Property',
    label: 'Property details',
    helper: 'Ward, ULB, and assessment fields',
    kind: 'redirect',
    redirectRoute: '/(app)/wizard/property',
  },
  {
    id: 'owner_mobile',
    section: 'Owner',
    label: 'Owner mobile number',
    field: 'owners.0.mobileNo',
    kind: 'text',
    required: true,
    keyboard: 'phone-pad',
  },
  {
    id: 'owner_details',
    section: 'Owner',
    label: 'Owner & respondent details',
    kind: 'redirect',
    redirectRoute: '/(app)/wizard/owner',
  },
  {
    id: 'address',
    section: 'Address',
    label: 'Property address',
    kind: 'redirect',
    redirectRoute: '/(app)/wizard/address',
  },
  {
    id: 'taxation',
    section: 'Taxation',
    label: 'Taxation parameters',
    kind: 'redirect',
    redirectRoute: '/(app)/wizard/taxation',
  },
  {
    id: 'floors',
    section: 'Area',
    label: 'Floors & built-up area',
    kind: 'redirect',
    redirectRoute: '/(app)/wizard/floors',
  },
  {
    id: 'services',
    section: 'Services',
    label: 'Municipal services',
    kind: 'redirect',
    redirectRoute: '/(app)/wizard/services',
  },
  { id: 'gps', section: 'GPS', label: 'GPS capture', kind: 'redirect', redirectRoute: '/(app)/wizard/gps' },
  {
    id: 'photos',
    section: 'Photos',
    label: 'Property photos',
    kind: 'redirect',
    redirectRoute: '/(app)/wizard/photos',
  },
  {
    id: 'review',
    section: 'Review',
    label: 'Review & submit',
    kind: 'redirect',
    redirectRoute: '/(app)/wizard/review',
  },
];

export function questionProgress(index: number): { current: number; total: number; pct: number } {
  const total = SURVEY_QUESTIONS.length;
  return { current: index + 1, total, pct: Math.round(((index + 1) / total) * 100) };
}

export function readQuestionValue(draft: WizardDraft, field: SurveyQuestion['field']): string {
  if (!field) return '';
  if (field === 'owners.0.mobileNo') return draft.owners?.[0]?.mobileNo ?? '';
  const v = draft[field as keyof WizardDraft];
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return '';
}

export function writeQuestionValue(
  draft: WizardDraft,
  field: SurveyQuestion['field'],
  value: string,
): Partial<WizardDraft> {
  if (!field) return {};
  if (field === 'owners.0.mobileNo') {
    const owners = draft.owners?.length ? [...draft.owners] : [{ clientOwnerId: `ow_${Date.now()}` }];
    owners[0] = { ...owners[0]!, mobileNo: sanitizeFixedDigits(value, 10) };
    return { owners };
  }
  if (field === 'parcelNo') {
    return { parcelNo: sanitizeFixedDigits(value, 5) };
  }
  if (field === 'unitNo') {
    return { unitNo: sanitizeFixedDigits(value, 3) };
  }
  return { [field]: field === 'constructedYear' ? Number(value) || undefined : value } as Partial<WizardDraft>;
}

export function questionFieldError(draft: WizardDraft, q: SurveyQuestion): string | undefined {
  if (q.kind === 'redirect' || !q.field) return undefined;
  const value = readQuestionValue(draft, q.field);
  if (q.field === 'parcelNo') return parcelNoError(value || undefined);
  if (q.field === 'unitNo') return unitNoError(value || undefined);
  if (q.field === 'owners.0.mobileNo') return primaryMobileError(value || undefined);
  if (q.required && !value.trim()) return 'This field is required';
  return undefined;
}

export function isQuestionComplete(draft: WizardDraft, q: SurveyQuestion): boolean {
  if (q.kind === 'redirect') return true;
  if (!q.required) return true;
  if (q.field === 'parcelNo') return isValidParcelNo(readQuestionValue(draft, q.field));
  if (q.field === 'unitNo') return isValidUnitNo(readQuestionValue(draft, q.field));
  if (q.field === 'owners.0.mobileNo') return !primaryMobileError(readQuestionValue(draft, q.field));
  return readQuestionValue(draft, q.field).trim().length > 0;
}
