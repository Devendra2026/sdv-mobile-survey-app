/**
 * Reusable step scaffold so each wizard screen doesn't repeat the same
 * header + scroll + footer wiring.
 */
import { Banner, Spinner, Toast } from '@/components';
import { FloatingSaveBar, WizardHeader } from '@/components/wizard';
import type { Id } from '@/convex/_generated/dataModel';
import { useDebouncedCloudSave } from '@/hooks/useDebouncedCloudSave';
import { useSaveSurveyDraft } from '@/hooks/useSaveSurveyDraft';
import { createNewDraft, draftToSaveDraftPayload, useWizardDraft, type WizardDraft } from '@/hooks/useWizardDraft';
import { useWizardStepGuard } from '@/hooks/useWizardStepGuard';
import {
  canPickStep,
  FIRST_WIZARD_ROUTE,
  indicatorSteps,
  nextStep,
  prevStep,
  stepKeyFromRoute,
  visitedStepPatch,
  WIZARD_STEPS,
  wizardStepProgress,
  type StepConfig,
} from '@/hooks/wizardSteps';
import { toUserMessage } from '@/utils/errors';
import { backOrReplace } from '@/utils/navigation';
import { keyboardAvoidingProps, scrollViewProps } from '@/utils/scroll-props';
import { stepValidationDetails } from '@/utils/wizardValidation';
import { useRouter } from 'expo-router';
import { ReactNode, useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface WizardStepFrameProps {
  localId: string;
  activeKey: StepConfig['key'];
  title: string;
  subtitle?: string;
  nextDisabled?: boolean | ((draft: WizardDraft) => boolean);
  loading?: boolean;
  children: (ctx: { draft: WizardDraft; update: (patch: Partial<WizardDraft>) => Promise<void> }) => ReactNode;
  /** Called on "Next". Default routes forward; override to e.g. validate. */
  onNext?: (draft: WizardDraft) => Promise<boolean | void>;
}

export function WizardStepFrame({
  localId,
  activeKey,
  title,
  subtitle,
  nextDisabled,
  loading,
  children,
  onNext,
}: WizardStepFrameProps) {
  const router = useRouter();
  const { draft, loading: loadingDraft, update } = useWizardDraft(localId);
  const { save: saveToServer, saving: savingDraft } = useSaveSurveyDraft();
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);

  const { checking: guardChecking } = useWizardStepGuard(localId, activeKey);

  const onSynced = useCallback(
    async (result: { surveyId: Id<'surveys'> | null }) => {
      if (draft && result.surveyId && draft.serverSurveyId !== result.surveyId) {
        await update({ serverSurveyId: result.surveyId });
      }
    },
    [draft, update],
  );

  const onSyncState = useCallback(
    async (state: { pendingCloudSync: boolean; lastSyncError?: string; lastSyncedAt?: number }) => {
      await update({
        pendingCloudSync: state.pendingCloudSync,
        lastSyncError: state.lastSyncError,
        lastSyncedAt: state.lastSyncedAt,
      });
    },
    [update],
  );

  const onSyncError = useCallback((error: unknown) => {
    setToast({ title: toUserMessage(error), tone: 'danger' });
  }, []);

  const { lastSyncedAt, syncing, isOnline, lastSyncError, pendingCloudSync, flushSync } = useDebouncedCloudSave(draft, {
    onSynced,
    onError: onSyncError,
    onSyncState,
  });

  if (loadingDraft || !draft || guardChecking) {
    return (
      <View className="flex-1 bg-page-light dark:bg-page-dark">
        <Spinner label="Loading draft…" />
      </View>
    );
  }

  const nextBlocked = typeof nextDisabled === 'function' ? nextDisabled(draft) : Boolean(nextDisabled);
  const progress = wizardStepProgress(draft, activeKey);
  const currentStepValidation = stepValidationDetails(draft).find((s) => s.key === activeKey);
  const currentMissing = currentStepValidation?.missingFields ?? [];

  const persistAndSync = async () => {
    if (isOnline && draftToSaveDraftPayload(draft)) {
      flushSync();
    }
  };

  const goBack = async () => {
    const prev = prevStep(activeKey);
    if (prev) {
      const prevKey = stepKeyFromRoute(prev);
      if (prevKey) await update(visitedStepPatch(draft, prevKey));
      await persistAndSync();
      router.replace({ pathname: prev as never, params: { localId } });
    } else backOrReplace(router);
  };

  const goNext = async () => {
    const ok = onNext ? await onNext(draft) : true;
    if (ok === false) return;
    const next = nextStep(activeKey);
    const nextKey = stepKeyFromRoute(next);
    if (nextKey) await update(visitedStepPatch(draft, nextKey));
    else await update(visitedStepPatch(draft, 'review'));
    await persistAndSync();
    router.replace({ pathname: next as never, params: { localId } });
  };

  const canSaveDraft = Boolean(draftToSaveDraftPayload(draft));

  const onSaveDraft = async () => {
    if (!canSaveDraft) {
      setToast({ title: 'Select district and ULB first', tone: 'danger' });
      return;
    }
    try {
      const result = await saveToServer(draft);
      if (!result.surveyId) {
        setToast({ title: 'Could not save draft', tone: 'danger' });
        return;
      }
      if (result.failedSections.length > 0) {
        setToast({ title: `Partial save — retry: ${result.failedSections.join(', ')}`, tone: 'danger' });
        await update({
          serverSurveyId: result.surveyId,
          pendingCloudSync: true,
          lastSyncError: `Failed: ${result.failedSections.join(', ')}`,
          lastSyncedAt: draft.lastSyncedAt,
        });
        return;
      }
      await update({
        serverSurveyId: result.surveyId,
        pendingCloudSync: false,
        lastSyncError: undefined,
        lastSyncedAt: Date.now(),
      });
      setToast({ title: 'Draft saved to cloud', tone: 'success' });
    } catch (e) {
      await update({ pendingCloudSync: true, lastSyncError: toUserMessage(e) });
      setToast({ title: toUserMessage(e), tone: 'danger' });
    }
  };

  const onStartNewSurvey = () => {
    const startFresh = async () => {
      if (canSaveDraft) {
        try {
          await saveToServer(draft);
        } catch {
          // local draft remains; user chose to start new
        }
      }
      const fresh = await createNewDraft();
      router.replace({ pathname: FIRST_WIZARD_ROUTE as never, params: { localId: fresh.localId } });
    };

    if (!canSaveDraft && !draft.municipalityId) {
      void startFresh();
      return;
    }

    Alert.alert('Start new survey?', 'Your current draft stays saved. Open it anytime from the dashboard.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start new', onPress: () => void startFresh() },
    ]);
  };

  const onPickStep = async (key: string) => {
    const step = WIZARD_STEPS.find((s) => s.key === key);
    if (!step) return;
    if (!canPickStep(draft, step.key)) {
      setToast({ title: 'Complete earlier steps to open this section', tone: 'danger' });
      return;
    }
    await update(visitedStepPatch(draft, step.key));
    await persistAndSync();
    router.replace({ pathname: step.route as never, params: { localId } });
  };

  let syncLabel: string | undefined;
  if (syncing) syncLabel = 'Saving progress…';
  else if (!isOnline) syncLabel = 'Offline — saved locally, will sync when online';
  else if (lastSyncError) syncLabel = `Sync failed — tap to retry`;
  else if (pendingCloudSync) syncLabel = 'Pending cloud sync…';
  else if (lastSyncedAt) syncLabel = `Saved ${new Date(lastSyncedAt).toLocaleTimeString()}`;
  else if (canSaveDraft) syncLabel = 'Progress auto-saves when you change steps';

  const nextLabel =
    activeKey === 'photos'
      ? 'Review'
      : `Next: ${WIZARD_STEPS[WIZARD_STEPS.findIndex((s) => s.key === activeKey) + 1]?.label ?? 'Review'}`;

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <SafeAreaView edges={['top']} className="bg-brand">
        <WizardHeader
          title={title}
          subtitle={subtitle}
          steps={indicatorSteps(draft, activeKey)}
          activeKey={activeKey}
          progress={progress}
          onBack={goBack}
          onSelectStep={onPickStep}
        />
        <View className="px-4 pb-2 flex-row justify-end">
          <Pressable onPress={onStartNewSurvey} hitSlop={8}>
            <Text className="text-[11px] font-medium text-white/85">+ New survey</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} {...keyboardAvoidingProps()}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, paddingBottom: 24, flexGrow: 1 }}
          {...scrollViewProps}
        >
          {nextBlocked && currentMissing.length > 0 ? (
            <Banner
              tone="warning"
              icon="information-circle-outline"
              title={`Complete this section to continue`}
              message={currentMissing.slice(0, 4).join(' · ')}
              className="mb-3"
            />
          ) : null}
          {children({ draft, update })}
        </ScrollView>
        {syncLabel ? (
          <Pressable
            onPress={lastSyncError || pendingCloudSync ? flushSync : undefined}
            className="px-4 py-1.5 bg-page-light dark:bg-page-dark border-t border-line-subtle"
          >
            <Text
              className={`text-[11px] text-center ${lastSyncError ? 'text-danger font-medium' : 'text-ink-tertiary-light'}`}
            >
              {syncLabel}
            </Text>
          </Pressable>
        ) : null}
        <FloatingSaveBar
          onBack={prevStep(activeKey) ? goBack : undefined}
          onSaveDraft={canSaveDraft ? onSaveDraft : undefined}
          onNext={goNext}
          nextLabel={nextLabel}
          nextDisabled={nextBlocked}
          saveDraftDisabled={!canSaveDraft}
          loading={loading}
          savingDraft={savingDraft || syncing}
        />
      </KeyboardAvoidingView>
      {toast ? <Toast visible title={toast.title} tone={toast.tone} onHide={() => setToast(null)} /> : null}
    </View>
  );
}
