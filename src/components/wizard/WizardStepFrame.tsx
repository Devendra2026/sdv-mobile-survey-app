/**
 * Reusable step scaffold so each wizard screen doesn't repeat the same
 * header + scroll + footer wiring.
 */
import { Spinner, Toast } from '@/components';
import { FloatingSaveBar, WizardHeader } from '@/components/wizard';
import type { Id } from '@/convex/_generated/dataModel';
import { useSaveSurveyDraft } from '@/hooks/useSaveSurveyDraft';
import { draftToSaveDraftPayload, useWizardDraft, type WizardDraft } from '@/hooks/useWizardDraft';
import {
  indicatorSteps,
  nextStep,
  prevStep,
  stepKeyFromRoute,
  WIZARD_STEPS,
  type StepConfig,
} from '@/hooks/wizardSteps';
import { toUserMessage } from '@/utils/errors';
import { backOrReplace } from '@/utils/navigation';
import { keyboardAvoidingProps, scrollViewProps } from '@/utils/scroll-props';
import { useRouter } from 'expo-router';
import { ReactNode, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface WizardStepFrameProps {
  localId: string;
  activeKey: StepConfig['key'];
  title: string;
  subtitle?: string;
  nextDisabled?: boolean | ((draft: WizardDraft) => boolean);
  loading?: boolean;
  children: (ctx: { draft: WizardDraft; update: (patch: Partial<WizardDraft>) => Promise<void> }) => ReactNode;
  /** Called on "Save & continue". Default routes forward; override to e.g. validate. */
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

  if (loadingDraft || !draft) {
    return (
      <View className="flex-1 bg-page-light dark:bg-page-dark">
        <Spinner label="Loading draft…" />
      </View>
    );
  }

  const nextBlocked = typeof nextDisabled === 'function' ? nextDisabled(draft) : Boolean(nextDisabled);

  const goBack = async () => {
    const prev = prevStep(activeKey);
    if (prev) {
      const prevKey = stepKeyFromRoute(prev);
      if (prevKey) await update({ lastActiveStepKey: prevKey });
      router.replace({ pathname: prev as never, params: { localId } });
    } else backOrReplace(router);
  };

  const goNext = async () => {
    const ok = onNext ? await onNext(draft) : true;
    if (ok === false) return;
    const next = nextStep(activeKey);
    const nextKey = stepKeyFromRoute(next);
    if (nextKey) await update({ lastActiveStepKey: nextKey });
    router.replace({ pathname: next as never, params: { localId } });
  };

  const canSaveDraft = Boolean(draftToSaveDraftPayload(draft));

  const onSaveDraft = async () => {
    try {
      const surveyId = await saveToServer(draft);
      if (!surveyId) {
        setToast({ title: 'Select district and ULB first', tone: 'danger' });
        return;
      }
      if (draft.serverSurveyId !== surveyId) {
        await update({ serverSurveyId: surveyId as Id<'surveys'> });
      }
      setToast({ title: 'Draft saved to cloud', tone: 'success' });
    } catch (e) {
      setToast({ title: toUserMessage(e), tone: 'danger' });
    }
  };

  const onPickStep = async (key: string) => {
    const step = WIZARD_STEPS.find((s) => s.key === key);
    if (step) {
      await update({ lastActiveStepKey: step.key });
      router.replace({ pathname: step.route as never, params: { localId } });
    }
  };

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <SafeAreaView edges={['top']} className="bg-brand">
        <WizardHeader
          title={title}
          subtitle={subtitle}
          steps={indicatorSteps(draft, activeKey)}
          activeKey={activeKey}
          onBack={goBack}
          onSelectStep={onPickStep}
        />
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} {...keyboardAvoidingProps()}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, paddingBottom: 24, flexGrow: 1 }}
          {...scrollViewProps}
        >
          {children({ draft, update })}
        </ScrollView>
        <FloatingSaveBar
          onBack={prevStep(activeKey) ? goBack : undefined}
          onSaveDraft={canSaveDraft ? onSaveDraft : undefined}
          onNext={goNext}
          nextLabel={activeKey === 'photos' ? 'Continue to review' : 'Save & continue'}
          nextDisabled={nextBlocked}
          saveDraftDisabled={!canSaveDraft}
          loading={loading}
          savingDraft={savingDraft}
        />
      </KeyboardAvoidingView>
      {toast ? <Toast visible title={toast.title} tone={toast.tone} onHide={() => setToast(null)} /> : null}
    </View>
  );
}
