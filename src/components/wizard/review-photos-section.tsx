/**
 * Review-step photo verification — preview, remove, and retake before submit.
 */
import { AppButton, AppCard, Banner, Tag, Toast } from '@/components';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import { useWizardPhotoCapture } from '@/hooks/useWizardPhotoCapture';
import { warmCameraModule } from '@/utils/captureSurveyPhoto';
import { REQUIRED_SURVEY_PHOTO_SLOTS, SURVEY_PHOTO_SLOT_LABEL, type SurveyPhotoSlot } from '@/utils/surveyPhotos';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

const SLOT_HINT: Record<SurveyPhotoSlot, string> = {
  front: 'Full façade from the street',
  side: 'Side elevation along the boundary',
};

export function ReviewPhotosSection({
  draft,
  update,
  serverSurveyId,
  onEditStep,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => Promise<void>;
  serverSurveyId?: Id<'surveys'>;
  onEditStep: () => void;
}) {
  const { photoBySlot, previewBySlot, uploadingSlot, capturedCount, requiredCount, capture, confirmRemove } =
    useWizardPhotoCapture({ draft, update, serverSurveyId });
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);

  const onCapture = async (slot: SurveyPhotoSlot) => {
    if (uploadingSlot) return;
    const result = await capture(slot);
    if (result?.ok) {
      setToast({ title: `${result.label} saved`, tone: 'success' });
    } else if (result && !result.ok) {
      setToast({ title: result.message, tone: 'danger' });
    }
  };

  useEffect(() => {
    void warmCameraModule();
  }, []);

  const storageIds = useMemo(
    () => REQUIRED_SURVEY_PHOTO_SLOTS.map((s) => photoBySlot.get(s)?.storageId).filter(Boolean) as Id<'_storage'>[],
    [photoBySlot],
  );

  const urlRows = useQuery(api.photos.resolveStorageUrls, storageIds.length > 0 ? { storageIds } : 'skip');
  const urlByStorageId = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of urlRows ?? []) {
      if (row.url) m.set(String(row.storageId), row.url);
    }
    return m;
  }, [urlRows]);

  const allCaptured = capturedCount === requiredCount;

  return (
    <View className="mb-4">
      <SectionHeader count={capturedCount} total={requiredCount} allCaptured={allCaptured} />

      <Banner
        tone="info"
        title="Check your photos"
        message="Confirm each image is clear and shows the correct view. Remove and retake any photo that is blurry or wrong."
        icon="eye-outline"
        className="mb-3"
      />

      <View style={{ gap: 12 }} className="mb-3">
        {REQUIRED_SURVEY_PHOTO_SLOTS.map((slot) => (
          <ReviewPhotoCard
            key={slot}
            slot={slot}
            title={SURVEY_PHOTO_SLOT_LABEL[slot]}
            hint={SLOT_HINT[slot]}
            previewUri={
              previewBySlot[slot] ??
              (photoBySlot.get(slot)?.storageId
                ? urlByStorageId.get(String(photoBySlot.get(slot)!.storageId))
                : undefined)
            }
            captured={photoBySlot.has(slot)}
            loadingUrls={!!photoBySlot.get(slot) && urlRows === undefined && !previewBySlot[slot]}
            uploading={uploadingSlot === slot}
            onCapture={() => void onCapture(slot)}
            onRemove={() => confirmRemove(slot)}
          />
        ))}
      </View>

      <AppButton
        label="Open photos step"
        variant="outline"
        size="sm"
        iconLeft="images-outline"
        onPress={onEditStep}
        className="mb-2"
      />

      {toast ? <Toast visible title={toast.title} tone={toast.tone} onHide={() => setToast(null)} /> : null}
    </View>
  );
}

function SectionHeader({ count, total, allCaptured }: { count: number; total: number; allCaptured: boolean }) {
  return (
    <View className="flex-row items-center justify-between mb-2">
      <Text className="text-section text-ink-primary-light dark:text-ink-primary-dark">Photos</Text>
      <Tag
        label={`${count} / ${total}`}
        tone={allCaptured ? 'success' : 'warning'}
        icon={allCaptured ? 'checkmark-circle' : 'alert-circle-outline'}
      />
    </View>
  );
}

function ReviewPhotoCard({
  slot,
  title,
  hint,
  previewUri,
  captured,
  loadingUrls,
  uploading,
  onCapture,
  onRemove,
}: {
  slot: SurveyPhotoSlot;
  title: string;
  hint: string;
  previewUri?: string;
  captured: boolean;
  loadingUrls: boolean;
  uploading: boolean;
  onCapture: () => void;
  onRemove: () => void;
}) {
  const icon = slot === 'front' ? 'home-outline' : 'swap-horizontal-outline';

  return (
    <AppCard padded={false} className="overflow-hidden">
      <View className="px-3.5 pt-3 pb-2 flex-row items-center gap-2">
        <View className="w-9 h-9 rounded-full bg-brand-soft items-center justify-center">
          <Ionicons name={icon} size={18} color="#003B8E" />
        </View>
        <View className="flex-1">
          <Text className="text-[14px] font-semibold text-ink-primary-light dark:text-ink-primary-dark">{title}</Text>
          <Text className="text-[11px] text-ink-tertiary-light mt-0.5">{hint}</Text>
        </View>
        {captured ? <Tag label="Added" tone="success" icon="checkmark" /> : <Tag label="Missing" tone="warning" />}
      </View>

      <View className="mx-3.5 mb-3 rounded-lg overflow-hidden bg-page-light dark:bg-page-dark border border-line-subtle min-h-[180px]">
        {uploading || loadingUrls ? (
          <View className="flex-1 min-h-[180px] items-center justify-center">
            <ActivityIndicator color="#003B8E" />
            <Text className="text-caption text-ink-tertiary-light mt-2">
              {uploading ? 'Uploading…' : 'Loading preview…'}
            </Text>
          </View>
        ) : previewUri ? (
          <Image
            source={{ uri: previewUri }}
            style={{ width: '100%', height: 208 }}
            contentFit="cover"
            recyclingKey={previewUri}
          />
        ) : (
          <View className="flex-1 min-h-[180px] items-center justify-center px-4">
            <Ionicons name="image-outline" size={36} color="#9CA3AF" />
            <Text className="text-helper text-ink-tertiary-light text-center mt-2">No photo yet</Text>
          </View>
        )}
      </View>

      <View className="flex-row gap-2 px-3.5 pb-3.5">
        <View className="flex-1">
          <AppButton
            label={captured ? 'Retake' : 'Capture'}
            size="sm"
            iconLeft="camera-outline"
            onPress={onCapture}
            loading={uploading}
            fullWidth
          />
        </View>
        {captured ? (
          <View className="flex-1">
            <AppButton
              label="Remove"
              size="sm"
              variant="outline"
              iconLeft="trash-outline"
              onPress={onRemove}
              disabled={uploading}
              fullWidth
            />
          </View>
        ) : null}
      </View>
    </AppCard>
  );
}
