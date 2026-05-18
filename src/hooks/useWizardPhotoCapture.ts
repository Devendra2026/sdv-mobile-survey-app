/**
 * Shared capture / remove / replace for wizard photos (step 8 + review).
 */
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import { pickSurveyPhotoFromCamera, uploadSurveyPhotoBytes } from '@/utils/captureSurveyPhoto';
import { toPhotoErrorMessage } from '@/utils/convex-storage';
import {
  filterSurveyPhotos,
  REQUIRED_SURVEY_PHOTO_SLOTS,
  SURVEY_PHOTO_SLOT_LABEL,
  type SurveyPhotoSlot,
  type WizardPhotoEntry,
} from '@/utils/surveyPhotos';
import { useMutation } from 'convex/react';
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

export function useWizardPhotoCapture({
  draft,
  update,
  serverSurveyId,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => Promise<void>;
  serverSurveyId?: Id<'surveys'>;
}) {
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl);
  const releaseStorage = useMutation(api.photos.releaseStorage);
  const linkPhoto = useMutation(api.photos.linkPhoto);
  const removeBySurveySlot = useMutation(api.photos.removeBySurveySlot);

  const [uploadingSlot, setUploadingSlot] = useState<SurveyPhotoSlot | null>(null);
  const [previewBySlot, setPreviewBySlot] = useState<Partial<Record<SurveyPhotoSlot, string>>>({});
  const captureInFlight = useRef(false);

  const surveyPhotos = filterSurveyPhotos(draft.photos);
  const photoBySlot = new Map(surveyPhotos.map((p) => [p.slot, p]));

  const syncPhotoToServer = useCallback(
    async (photo: WizardPhotoEntry & { slot: SurveyPhotoSlot }) => {
      if (!serverSurveyId) return;
      await linkPhoto({
        surveyId: serverSurveyId,
        slot: photo.slot,
        storageId: photo.storageId,
        sizeKb: photo.sizeKb,
        width: photo.width,
        height: photo.height,
        capturedAt: photo.capturedAt,
      });
    },
    [linkPhoto, serverSurveyId],
  );

  const releasePhoto = useCallback(
    async (photo: WizardPhotoEntry) => {
      if (serverSurveyId && (photo.slot === 'front' || photo.slot === 'side')) {
        await removeBySurveySlot({ surveyId: serverSurveyId, slot: photo.slot });
        return;
      }
      await releaseStorage({ storageId: photo.storageId });
    },
    [releaseStorage, removeBySurveySlot, serverSurveyId],
  );

  const capture = useCallback(
    async (slot: SurveyPhotoSlot) => {
      if (captureInFlight.current) return;
      captureInFlight.current = true;
      try {
        const picked = await pickSurveyPhotoFromCamera();
        if (picked.canceled) return;

        const existing = photoBySlot.get(slot);
        setUploadingSlot(slot);

        const uploadUrl = await generateUploadUrl({});
        const { storageId, sizeKb } = await uploadSurveyPhotoBytes(uploadUrl, picked.jpegBytes);

        const entry: WizardPhotoEntry & { slot: SurveyPhotoSlot } = {
          slot,
          storageId,
          sizeKb,
          width: picked.width,
          height: picked.height,
          capturedAt: Date.now(),
        };

        if (existing && existing.storageId !== storageId) {
          await releasePhoto(existing);
        }

        const next = surveyPhotos.filter((p) => p.slot !== slot);
        next.push(entry);
        await update({ photos: next });
        await syncPhotoToServer(entry);

        setPreviewBySlot((prev) => ({ ...prev, [slot]: picked.uri }));
        return { ok: true as const, label: SURVEY_PHOTO_SLOT_LABEL[slot] };
      } catch (e) {
        return {
          ok: false as const,
          message: toPhotoErrorMessage(e),
        };
      } finally {
        setUploadingSlot(null);
        captureInFlight.current = false;
      }
    },
    [generateUploadUrl, photoBySlot, releasePhoto, surveyPhotos, syncPhotoToServer, update],
  );

  const remove = useCallback(
    async (slot: SurveyPhotoSlot) => {
      const existing = photoBySlot.get(slot);
      if (!existing) return;
      await releasePhoto(existing);
      await update({ photos: surveyPhotos.filter((p) => p.slot !== slot) });
      setPreviewBySlot((prev) => {
        const next = { ...prev };
        delete next[slot];
        return next;
      });
    },
    [photoBySlot, releasePhoto, surveyPhotos, update],
  );

  const confirmRemove = (slot: SurveyPhotoSlot) => {
    Alert.alert(`Remove ${SURVEY_PHOTO_SLOT_LABEL[slot]}?`, 'You can capture a new photo afterward.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void remove(slot),
      },
    ]);
  };

  const capturedCount = REQUIRED_SURVEY_PHOTO_SLOTS.filter((s) => photoBySlot.has(s)).length;

  return {
    surveyPhotos,
    photoBySlot,
    previewBySlot,
    uploadingSlot,
    capturedCount,
    requiredCount: REQUIRED_SURVEY_PHOTO_SLOTS.length,
    capture,
    confirmRemove,
  };
}
