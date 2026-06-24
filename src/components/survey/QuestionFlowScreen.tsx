import { AppButton, AppInput, Banner } from '@/components';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import { allStepsComplete, incompleteStepLabels } from '@/hooks/wizardSteps';
import {
  isQuestionComplete,
  questionFieldError,
  questionProgress,
  readQuestionValue,
  type SurveyQuestion,
  writeQuestionValue,
} from '@/survey/questionCatalog';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

interface QuestionFlowScreenProps {
  localId: string;
  questionIndex: number;
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => Promise<void>;
  questions: SurveyQuestion[];
}

export function QuestionFlowScreen({ localId, questionIndex, draft, update, questions }: QuestionFlowScreenProps) {
  const router = useRouter();
  const q = questions[questionIndex];
  const progress = questionProgress(questionIndex);
  const [error, setError] = useState<string | null>(null);

  const value = useMemo(() => (q ? readQuestionValue(draft, q.field) : ''), [draft, q]);

  const incomplete = incompleteStepLabels(draft);

  if (!q) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-body text-ink-secondary-light">Survey complete.</Text>
        <AppButton
          label="Review"
          className="mt-4"
          disabled={!allStepsComplete(draft)}
          onPress={() => router.replace({ pathname: '/(app)/wizard/review', params: { localId } })}
        />
      </View>
    );
  }

  const goNext = async () => {
    if (q.kind === 'redirect' && q.redirectRoute) {
      if (!allStepsComplete(draft)) {
        setError(`Complete these steps first: ${incomplete.join(', ')}`);
        return;
      }
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.replace({ pathname: q.redirectRoute as never, params: { localId } });
      return;
    }
    if (!isQuestionComplete(draft, q)) {
      setError(questionFieldError(draft, q) ?? 'This field is required');
      return;
    }
    setError(null);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = questionIndex + 1;
    if (next >= questions.length) {
      if (!allStepsComplete(draft)) {
        setError(`Complete these steps first: ${incomplete.join(', ')}`);
        return;
      }
      router.replace({ pathname: '/(app)/wizard/review', params: { localId } });
      return;
    }
    router.replace({ pathname: '/(app)/wizard/flow', params: { localId, q: String(next) } });
  };

  const goBack = () => {
    if (questionIndex <= 0) {
      router.replace({ pathname: '/(app)/wizard/start', params: { localId } });
      return;
    }
    router.replace({ pathname: '/(app)/wizard/flow', params: { localId, q: String(questionIndex - 1) } });
  };

  return (
    <View className="flex-1 px-4 pt-6 pb-8">
      <Text className="text-caption text-brand font-medium uppercase tracking-wide">{q.section}</Text>
      <Text className="text-helper text-ink-tertiary-light mt-1">
        Question {progress.current} of {progress.total} · {progress.pct}%
      </Text>
      <View className="h-1.5 rounded-full bg-line-subtle mt-3 overflow-hidden">
        <View className="h-full bg-brand rounded-full" style={{ width: `${progress.pct}%` }} />
      </View>
      {!allStepsComplete(draft) && q.kind === 'redirect' ? (
        <Banner tone="warning" title="Steps incomplete" message={`Finish: ${incomplete.join(', ')}`} className="mt-4" />
      ) : null}

      <Text className="text-display font-medium text-ink-primary-light dark:text-ink-primary-dark mt-8">{q.label}</Text>
      {q.helper ? <Text className="text-body text-ink-secondary-light mt-2">{q.helper}</Text> : null}

      {q.kind === 'text' || q.kind === 'number' ? (
        <AppInput
          label={q.label}
          value={value}
          onChangeText={(text) => void update(writeQuestionValue(draft, q.field, text))}
          keyboardType={
            q.keyboard ??
            (q.field === 'parcelNo' || q.field === 'unitNo' || q.field === 'owners.0.mobileNo'
              ? 'number-pad'
              : q.kind === 'number'
                ? 'number-pad'
                : 'default')
          }
          maxLength={
            q.field === 'parcelNo' ? 5 : q.field === 'unitNo' ? 3 : q.field === 'owners.0.mobileNo' ? 10 : undefined
          }
          containerClassName="mt-6"
          errorText={error ?? undefined}
          autoFocus
        />
      ) : (
        <Banner
          tone="info"
          title="Multi-field step"
          message="Continue to fill this section on the dedicated screen."
          className="mt-6"
        />
      )}

      <View className="flex-row gap-2 mt-auto pt-8">
        <AppButton label="Back" variant="outline" onPress={goBack} className="flex-1" />
        <AppButton
          label={q.kind === 'redirect' ? 'Open section' : 'Continue'}
          onPress={() => void goNext()}
          className="flex-[1.5]"
        />
      </View>
    </View>
  );
}
