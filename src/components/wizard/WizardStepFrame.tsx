/**
 * Reusable step scaffold so each wizard screen doesn't repeat the same
 * header + scroll + footer wiring.
 */
import { Banner, Spinner, Toast } from '@/components';
import { FloatingSaveBar, WizardHeader } from '@/components/wizard';
import { formatSaveDraftError, useSaveSurveyDraft } from '@/hooks/useSaveSurveyDraft';
import { createNewDraft, draftToSaveDraftPayload, useWizardDraft, type WizardDraft } from '@/hooks/useWizardDraft';
import {
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
import { wizardScrollContentStyle, wizardScrollViewProps } from '@/utils/scroll-props';
import { stepValidationDetails } from '@/utils/wizardValidation';
import { useRouter } from 'expo-router';
import { ReactNode, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
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

  if (loadingDraft || !draft || loading) {
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

  const goBack = async () => {
    const prev = prevStep(activeKey);
    if (prev) {
      const prevKey = stepKeyFromRoute(prev);
      if (prevKey) await update(visitedStepPatch(draft, prevKey));
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
        const err = result.sectionErrors.header ?? 'Could not save draft';
        setToast({ title: err, tone: 'danger' });
        return;
      }
      if (result.failedSections.length > 0) {
        const detail = formatSaveDraftError(result);
        setToast({ title: detail ? `Partial save — ${detail}` : 'Partial save failed', tone: 'danger' });
        await update({
          serverSurveyId: result.surveyId,
          pendingCloudSync: true,
          lastSyncError: detail || `Failed: ${result.failedSections.join(', ')}`,
          lastSyncedAt: draft.lastSyncedAt,
        });
        return;
      }
      const wasSynced = Boolean(draft.serverSurveyId);
      await update({
        serverSurveyId: result.surveyId,
        pendingCloudSync: false,
        lastSyncError: undefined,
        lastSyncedAt: Date.now(),
      });
      setToast({
        title: wasSynced ? 'Cloud copy updated' : 'Draft saved — continue collecting; tap again to sync changes',
        tone: 'success',
      });
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
    await update(visitedStepPatch(draft, step.key));
    router.replace({ pathname: step.route as never, params: { localId } });
  };

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

      <View style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={wizardScrollContentStyle()} {...wizardScrollViewProps}>
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
        <FloatingSaveBar
          onBack={prevStep(activeKey) ? goBack : undefined}
          onSaveDraft={canSaveDraft ? onSaveDraft : undefined}
          saveDraftLabel={draft.serverSurveyId ? 'Update cloud' : 'Save draft'}
          cloudSynced={Boolean(draft.serverSurveyId) && !draft.pendingCloudSync}
          onNext={goNext}
          nextLabel={nextLabel}
          nextDisabled={nextBlocked}
          saveDraftDisabled={!canSaveDraft}
          loading={loading}
          savingDraft={savingDraft}
        />
      </View>
      {toast ? <Toast visible title={toast.title} tone={toast.tone} onHide={() => setToast(null)} /> : null}
    </View>
  );
}
