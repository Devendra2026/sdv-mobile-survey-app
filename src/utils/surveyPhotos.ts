import type { WizardDraft } from '@/hooks/useWizardDraft';

export type SurveyPhotoSlot = 'front' | 'side';

export function isSurveyPhotoSlot(value: string | null | undefined): value is SurveyPhotoSlot {
  return value === 'front' || value === 'side';
}

export const REQUIRED_SURVEY_PHOTO_SLOTS: SurveyPhotoSlot[] = ['front', 'side'];

export const SURVEY_PHOTO_SLOT_LABEL: Record<SurveyPhotoSlot, string> = {
  front: 'Front view',
  side: 'Side view',
};

export type WizardPhotoEntry = NonNullable<WizardDraft['photos']>[number];

export function filterSurveyPhotos(photos: WizardDraft['photos']): Array<WizardPhotoEntry & { slot: SurveyPhotoSlot }> {
  return (photos ?? []).filter(
    (p): p is WizardPhotoEntry & { slot: SurveyPhotoSlot } => p.slot === 'front' || p.slot === 'side',
  );
}

export function surveyPhotosComplete(photos: WizardDraft['photos']): boolean {
  const slots = new Set(filterSurveyPhotos(photos).map((p) => p.slot));
  return REQUIRED_SURVEY_PHOTO_SLOTS.every((s) => slots.has(s));
}
