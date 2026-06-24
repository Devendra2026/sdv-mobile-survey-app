/**
 * Step 8 — Photos (front + side required).
 */
import { AppCard, Banner, PhotoSlot, Spinner, Tag, Toast } from '@/components';
import { WizardStepFrame } from '@/components/wizard';
import { api } from '@/convex/_generated/api';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useSaveSurveyDraft } from '@/hooks/useSaveSurveyDraft';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import { draftToSaveDraftPayload, stepCompletion } from '@/hooks/useWizardDraft';
import { useWizardPhotoCapture } from '@/hooks/useWizardPhotoCapture';
import { warmCameraModule } from '@/utils/captureSurveyPhoto';
import { toUserMessage } from '@/utils/errors';
import { hasPendingPhotoUploads } from '@/utils/photoUploadQueue';
import { REQUIRED_SURVEY_PHOTO_SLOTS, type SurveyPhotoSlot } from '@/utils/surveyPhotos';
import { useQuery } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

const SLOT_SUBTITLE: Record<SurveyPhotoSlot, string> = {
  front: 'Full front of the building from the street',
  side: 'Side elevation along the property boundary',
};

export default function StepPhotos() {
  const { localId } = useLocalSearchParams<{ localId: string }>();
  if (!localId) return <Spinner label="Loading…" />;

  return (
    <WizardStepFrame
      localId={localId}
      activeKey="photos"
      title="Photos"
      subtitle="Front + side view required"
      nextDisabled={(d) => !stepCompletion(d).photos}
      onNext={async () => {
        if (await hasPendingPhotoUploads(localId)) return false;
        return true;
      }}
    >
      {({ draft, update }) => <PhotoFields draft={draft} update={update} localId={localId} />}
    </WizardStepFrame>
  );
}

function PhotoFields({
  draft,
  update,
  localId,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => Promise<void>;
  localId: string;
}) {
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);
  const { isOnline } = useNetworkStatus();
  const { save: saveToServer } = useSaveSurveyDraft();

  useEffect(() => {
    void warmCameraModule();
  }, []);

  const ensureCloudDraft = useCallback(async (): Promise<boolean> => {
    if (draft.serverSurveyId) return true;
    if (!draftToSaveDraftPayload(draft)) {
      setToast({ title: 'Select district and ULB first', tone: 'danger' });
      return false;
    }
    if (!isOnline) {
      setToast({ title: 'Go online to sync before capturing photos', tone: 'danger' });
      return false;
    }
    try {
      const result = await saveToServer(draft);
      if (result.surveyId && result.failedSections.length === 0) {
        await update({
          serverSurveyId: result.surveyId,
          pendingCloudSync: false,
          lastSyncError: undefined,
          lastSyncedAt: Date.now(),
        });
        return true;
      }
      setToast({ title: 'Could not sync draft for photo upload', tone: 'danger' });
      return false;
    } catch (e) {
      setToast({ title: toUserMessage(e), tone: 'danger' });
      return false;
    }
  }, [draft, isOnline, saveToServer, update]);

  const { photoBySlot, previewBySlot, uploadingSlot, capturedCount, requiredCount, capture, confirmRemove } =
    useWizardPhotoCapture({
      draft,
      update,
      serverSurveyId: draft.serverSurveyId,
      localId,
      onRecoveryError: (message) => setToast({ title: message, tone: 'danger' }),
    });

  const storageIds = useMemo(
    () =>
      REQUIRED_SURVEY_PHOTO_SLOTS.flatMap((s) => {
        const id = photoBySlot.get(s)?.storageId;
        return id ? [id] : [];
      }),
    [photoBySlot],
  );

  const urlRows = useQuery(
    api.photos.resolveStorageUrls,
    draft.serverSurveyId && storageIds.length > 0 ? { storageIds, surveyId: draft.serverSurveyId } : 'skip',
  );

  const urlByStorageId = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of urlRows ?? []) {
      if (row.url) m.set(String(row.storageId), row.url);
    }
    return m;
  }, [urlRows]);

  const allCaptured = capturedCount === requiredCount;

  const onCapture = async (slot: SurveyPhotoSlot) => {
    if (uploadingSlot) return;
    if (!(await ensureCloudDraft())) return;
    const result = await capture(slot);
    if (result?.ok) {
      setToast({ title: `${result.label} saved`, tone: 'success' });
    } else if (result && !result.ok) {
      setToast({ title: result.message, tone: 'danger' });
    }
  };

  const canSaveDraft = Boolean(draftToSaveDraftPayload(draft));
  const needsCloudSave = canSaveDraft && !draft.serverSurveyId && !isOnline;

  const uploadCaption = !isOnline
    ? 'Photos upload when online — saved locally until synced'
    : 'Photos upload when captured · compressed to ~250 KB for sync';

  return (
    <>
      {needsCloudSave ? (
        <Banner
          tone="info"
          title="Go online to enable photos"
          message="Connect to the internet — your draft will sync automatically so you can capture photos."
          icon="cloud-upload-outline"
          className="mb-3"
        />
      ) : null}
      <AppCard padded className="mb-3">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-[14px] font-semibold text-ink-primary-light dark:text-ink-primary-dark">Progress</Text>
          <Tag
            label={`${capturedCount} / ${requiredCount}`}
            tone={allCaptured ? 'success' : 'brand'}
            icon={allCaptured ? 'checkmark-circle' : 'camera-outline'}
          />
        </View>
        <View className="h-2 rounded-full bg-page-light dark:bg-page-dark overflow-hidden">
          <View
            className="h-full rounded-full bg-brand"
            style={{ width: `${(capturedCount / requiredCount) * 100}%` }}
          />
        </View>
        <Text className="text-caption text-ink-tertiary-light mt-2">
          {allCaptured
            ? 'Both exterior photos captured — continue to review to verify them.'
            : 'Capture both exterior views before submitting the survey.'}
        </Text>
      </AppCard>

      <Banner
        tone="info"
        title="Exterior photos only"
        message="Take front and side views from outside the property. You can check and retake on the review screen."
        icon="sunny-outline"
        className="mb-3"
      />

      <View className="flex-row flex-wrap gap-3 mb-3">
        {REQUIRED_SURVEY_PHOTO_SLOTS.map((slot, i) => {
          const captured = photoBySlot.has(slot);
          const storageId = photoBySlot.get(slot)?.storageId;
          const previewUri = previewBySlot[slot] ?? (storageId ? urlByStorageId.get(String(storageId)) : undefined);
          return (
            <PhotoSlot
              key={slot}
              slot={slot}
              required
              step={i + 1}
              subtitle={SLOT_SUBTITLE[slot]}
              previewUri={previewUri}
              captured={captured}
              uploading={uploadingSlot === slot}
              onPick={() => void onCapture(slot)}
              onRemove={captured ? () => confirmRemove(slot) : undefined}
            />
          );
        })}
      </View>

      <Text className="text-caption text-ink-tertiary-light text-center">{uploadCaption}</Text>

      {toast ? <Toast visible title={toast.title} tone={toast.tone} onHide={() => setToast(null)} /> : null}
    </>
  );
}
