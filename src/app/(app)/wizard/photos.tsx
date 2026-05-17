/**
 * Step 8 — Photos.
 *
 * Real workflow:
 *   1. expo-image-picker → camera or library
 *   2. expo-image-manipulator → resize to 1280px max + JPEG q=0.7 (≈ 150–250 KB)
 *   3. fetch → blob
 *   4. `photos.generateUploadUrl` → POST blob → storageId
 *   5. write storageId into the draft's `photos[]`
 *
 * Front + inside are required; side + document are optional.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useMutation } from 'convex/react';
import { Banner, PhotoSlot, SectionLabel, Toast } from '@/components';
import { WizardStepFrame } from '@/hooks/WizardStepFrame';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

type Slot = 'front' | 'inside' | 'side' | 'document';
const SLOTS: { key: Slot; required: boolean }[] = [
  { key: 'front', required: true },
  { key: 'inside', required: true },
  { key: 'side', required: false },
  { key: 'document', required: false },
];

export default function StepPhotos() {
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl);
  const [uploadingSlot, setUploadingSlot] = useState<Slot | null>(null);
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);

  if (!localId) return null;

  return (
    <WizardStepFrame localId={localId} activeKey="photos" title="Photos" subtitle="Front + inside required">
      {({ draft, update }) => {
        const photoBySlot = new Map((draft.photos ?? []).map((p) => [p.slot, p]));

        const capture = useCallback(
          async (slot: Slot) => {
            try {
              const perm = await ImagePicker.requestCameraPermissionsAsync();
              if (!perm.granted) {
                Alert.alert('Camera permission needed', 'Allow camera access in settings to capture survey photos.');
                return;
              }
              const picked = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.9,
                exif: false,
              });
              if (picked.canceled || picked.assets.length === 0) return;
              const asset = picked.assets[0];
              setUploadingSlot(slot);

              // Compress → ~250 KB
              const compressed = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: 1280 } }], {
                compress: 0.7,
                format: ImageManipulator.SaveFormat.JPEG,
              });

              // Convex signed upload URL
              const uploadUrl = await generateUploadUrl({});
              const blob = await (await fetch(compressed.uri)).blob();
              const res = await fetch(uploadUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'image/jpeg' },
                body: blob,
              });
              if (!res.ok) throw new Error(`Upload failed (${res.status})`);
              const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };

              // Replace any existing slot photo
              const next = (draft.photos ?? []).filter((p) => p.slot !== slot);
              next.push({
                slot,
                storageId,
                sizeKb: Math.round(blob.size / 1024),
                width: compressed.width,
                height: compressed.height,
                capturedAt: Date.now(),
              });
              await update({ photos: next });
              setToast({ title: `${slot} photo uploaded`, tone: 'success' });
            } catch (e) {
              setToast({
                title: e instanceof Error ? e.message : 'Upload failed',
                tone: 'danger',
              });
            } finally {
              setUploadingSlot(null);
            }
          },
          [draft.photos, update, generateUploadUrl],
        );

        const removeSlot = (slot: Slot) => {
          Alert.alert('Remove this photo?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: async () => {
                await update({ photos: (draft.photos ?? []).filter((p) => p.slot !== slot) });
              },
            },
          ]);
        };

        return (
          <>
            <Banner
              tone="info"
              title="Photo guidelines"
              message="Capture from outside (front view) and from inside the property (inside view). Side and document photos are optional."
              icon="information-circle-outline"
              className="mb-3"
            />

            <SectionLabel>Required</SectionLabel>
            <View style={{ gap: 10 }} className="mb-3">
              {SLOTS.filter((s) => s.required).map((s) => (
                <PhotoSlot
                  key={s.key}
                  slot={s.key}
                  required
                  thumbnailUrl={photoBySlot.has(s.key) ? '✓' : undefined}
                  uploading={uploadingSlot === s.key}
                  onPick={() => capture(s.key)}
                  onRemove={() => removeSlot(s.key)}
                />
              ))}
            </View>

            <SectionLabel>Optional</SectionLabel>
            <View style={{ gap: 10 }}>
              {SLOTS.filter((s) => !s.required).map((s) => (
                <PhotoSlot
                  key={s.key}
                  slot={s.key}
                  thumbnailUrl={photoBySlot.has(s.key) ? '✓' : undefined}
                  uploading={uploadingSlot === s.key}
                  onPick={() => capture(s.key)}
                  onRemove={() => removeSlot(s.key)}
                />
              ))}
            </View>

            <Text className="text-caption text-ink-tertiary-light text-center mt-4">
              Photos upload immediately. Compressed to ~250 KB for sync.
            </Text>

            {toast ? <Toast visible title={toast.title} tone={toast.tone} onHide={() => setToast(null)} /> : null}
          </>
        );
      }}
    </WizardStepFrame>
  );
}
