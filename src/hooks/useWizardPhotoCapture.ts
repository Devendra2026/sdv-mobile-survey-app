/**
 * Shared capture / remove / replace for wizard photos (step 8 + review).
 */
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import {
  filterSurveyPhotos,
  REQUIRED_SURVEY_PHOTO_SLOTS,
  SURVEY_PHOTO_SLOT_LABEL,
  type SurveyPhotoSlot,
  type WizardPhotoEntry,
} from '@/utils/surveyPhotos';
import { useMutation } from 'convex/react';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
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
      try {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera permission needed', 'Allow camera access in settings to capture survey photos.');
          return;
        }
        const picked = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.9,
          exif: false,
        });
        if (picked.canceled || picked.assets.length === 0) return;

        const existing = photoBySlot.get(slot);
        setUploadingSlot(slot);

        const compressed = await ImageManipulator.manipulateAsync(picked.assets[0].uri, [{ resize: { width: 1280 } }], {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
        });

        const uploadUrl = await generateUploadUrl({});
        const blob = await (await fetch(compressed.uri)).blob();
        const res = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg' },
          body: blob,
        });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };

        const entry: WizardPhotoEntry & { slot: SurveyPhotoSlot } = {
          slot,
          storageId,
          sizeKb: Math.round(blob.size / 1024),
          width: compressed.width,
          height: compressed.height,
          capturedAt: Date.now(),
        };

        if (existing && existing.storageId !== storageId) {
          await releasePhoto(existing);
        }

        const next = surveyPhotos.filter((p) => p.slot !== slot);
        next.push(entry);
        await update({ photos: next });
        await syncPhotoToServer(entry);

        setPreviewBySlot((prev) => ({ ...prev, [slot]: compressed.uri }));
        return { ok: true as const, label: SURVEY_PHOTO_SLOT_LABEL[slot] };
      } catch (e) {
        return {
          ok: false as const,
          message: e instanceof Error ? e.message : 'Upload failed',
        };
      } finally {
        setUploadingSlot(null);
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
