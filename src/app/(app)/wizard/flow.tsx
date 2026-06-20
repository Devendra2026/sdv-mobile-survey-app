import { Spinner } from '@/components';
import { QuestionFlowScreen } from '@/components/survey/QuestionFlowScreen';
import { WizardHeader } from '@/components/wizard';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import { indicatorSteps } from '@/hooks/wizardSteps';
import { SURVEY_QUESTIONS } from '@/survey/questionCatalog';
import { backOrReplace } from '@/utils/navigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** One-question-at-a-time survey flow with redirects to multi-field steps. */
export default function WizardFlowScreen() {
  const { localId, q } = useLocalSearchParams<{ localId: string; q?: string }>();
  const router = useRouter();
  const { draft, loading, update } = useWizardDraft(localId ?? '');

  if (!localId || loading || !draft) {
    return (
      <View className="flex-1 bg-page-light dark:bg-page-dark">
        <Spinner label="Loading draft…" />
      </View>
    );
  }

  const questionIndex = Math.min(Math.max(Number(q ?? '0') || 0, 0), SURVEY_QUESTIONS.length - 1);

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <SafeAreaView edges={['top']} className="bg-brand">
        <WizardHeader
          title="Survey"
          subtitle="One question at a time"
          steps={indicatorSteps(draft, 'start')}
          activeKey="start"
          onBack={() => backOrReplace(router)}
        />
      </SafeAreaView>
      <QuestionFlowScreen
        localId={localId}
        questionIndex={questionIndex}
        draft={draft}
        update={update}
        questions={SURVEY_QUESTIONS}
      />
    </View>
  );
}
