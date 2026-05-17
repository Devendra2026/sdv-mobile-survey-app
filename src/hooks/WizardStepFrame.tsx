/**
 * Reusable step scaffold so each wizard screen doesn't repeat the same
 * 30 lines of header + scroll + footer wiring.
 *
 * Each step renders a body via the `children` prop, supplies its own
 * `activeKey` so the indicator highlights the right pill, and tells the
 * scaffold what to do on save (`onSave`) which is also the next-step
 * action.
 */
import { Spinner } from '@/components/index';
import { FloatingSaveBar, WizardHeader } from '@/components/wizard';
import { useWizardDraft, type WizardDraft } from '@/hooks/useWizardDraft';
import { indicatorSteps, nextStep, prevStep, WIZARD_STEPS, type StepConfig } from '@/hooks/wizardSteps';
import { useRouter } from 'expo-router';
import React, { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
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

  if (loadingDraft || !draft) {
    return (
      <View className="flex-1 bg-page-light dark:bg-page-dark">
        <Spinner label="Loading draft…" />
      </View>
    );
  }

  const nextBlocked = typeof nextDisabled === 'function' ? nextDisabled(draft) : Boolean(nextDisabled);

  const goBack = () => {
    const prev = prevStep(activeKey);
    if (prev) router.replace({ pathname: prev as never, params: { localId } });
    else router.back();
  };

  const goNext = async () => {
    const ok = onNext ? await onNext(draft) : true;
    if (ok === false) return;
    const next = nextStep(activeKey);
    router.replace({ pathname: next as never, params: { localId } });
  };

  const onPickStep = (key: string) => {
    const step = WIZARD_STEPS.find((s) => s.key === key);
    if (step) router.replace({ pathname: step.route as never, params: { localId } });
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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {children({ draft, update })}
        </ScrollView>
        <FloatingSaveBar
          onBack={prevStep(activeKey) ? goBack : undefined}
          onNext={goNext}
          nextLabel={activeKey === 'photos' ? 'Continue to review' : 'Save & continue'}
          nextDisabled={nextBlocked}
          loading={loading}
        />
      </KeyboardAvoidingView>
    </View>
  );
}
