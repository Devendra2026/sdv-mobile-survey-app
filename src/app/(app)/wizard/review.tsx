/**
 * Review & submit.
 *
 * Validates that every step is complete (re-running stepCompletion) and
 * then runs the submit pipeline:
 *
 *   1. `survey.saveDraft` + floor/photo sync → returns surveyId
 *   2. `survey.submit({ id: surveyId })` → flips status to 'submitted',
 *      enforces business rules server-side
 *   4. clear the AsyncStorage draft
 *   5. navigate to the survey detail screen
 *
 * Failures at any step leave the local draft intact so the surveyor can
 * fix and retry without losing data.
 */
import { Spinner, Toast } from '@/components';
import {
  ReviewAddressSection,
  ReviewAreaSection,
  ReviewCompletionBanner,
  ReviewFloorsSection,
  ReviewGpsSection,
  ReviewOwnerSection,
  ReviewPhotosSection,
  ReviewPropertySection,
  ReviewServicesSection,
  ReviewSubmitActions,
  ReviewSurveyStartSection,
  ReviewTaxationSection,
  ReviewWizardHeader,
} from '@/components/wizard';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useMastersBundle } from '@/hooks/use-masters-bundle';
import { useSaveSurveyDraft } from '@/hooks/useSaveSurveyDraft';
import {
  clearDraft,
  draftToSaveDraftPayload,
  draftToUpsertArgs,
  stepCompletion,
  useWizardDraft,
} from '@/hooks/useWizardDraft';
import { toUserMessage } from '@/utils/errors';
import { scrollViewProps } from '@/utils/scroll-props';
import { useMutation } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

export default function ReviewScreen() {
  const router = useRouter();
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const { draft, loading, update } = useWizardDraft(localId);
  const bundle = useMastersBundle();

  const { save: saveToServer, saving: savingDraft } = useSaveSurveyDraft();
  const submit = useMutation(api.survey.submit);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (loading || !draft) return;
    if (draft.lastActiveStepKey !== 'review') {
      void update({ lastActiveStepKey: 'review' });
    }
  }, [loading, draft, update]);

  const hideToast = useCallback(() => setToast(null), []);

  if (loading || !draft || !bundle) return <Spinner label="Loading…" />;

  const completion = stepCompletion(draft);
  const allComplete = Object.values(completion).every(Boolean);
  const args = allComplete ? draftToUpsertArgs(draft) : null;

  const selectedUlb = bundle.ulbs.find((u) => u._id === draft.municipalityId);
  const muniName = selectedUlb?.name ?? '—';
  const districtName =
    bundle.districts.find((d) => d._id === draft.districtId)?.name ?? selectedUlb?.districtName ?? '—';

  const persistServerSurveyId = async (surveyId: Id<'surveys'>) => {
    if (draft.serverSurveyId !== surveyId) {
      await update({ serverSurveyId: surveyId });
    }
  };

  const onSaveDraft = async () => {
    if (!draftToSaveDraftPayload(draft)) {
      setToast({ title: 'Select district and ULB first', tone: 'danger' });
      return;
    }
    try {
      const surveyId = await saveToServer(draft);
      if (surveyId) await persistServerSurveyId(surveyId);
      setToast({ title: 'Draft saved — you can continue later', tone: 'success' });
    } catch (e) {
      setToast({ title: toUserMessage(e), tone: 'danger' });
    }
  };

  const onSubmit = async () => {
    if (!args) return;
    setBusy(true);
    try {
      const surveyId = await saveToServer(draft);
      if (!surveyId) {
        setToast({ title: 'Complete all required steps before submitting', tone: 'danger' });
        return;
      }
      await Promise.all([persistServerSurveyId(surveyId), submit({ id: surveyId })]);
      await clearDraft(draft.localId);
      setToast({ title: 'Submitted for review', tone: 'success' });
      navTimerRef.current = setTimeout(() => {
        router.replace({ pathname: '/(app)/survey/[id]', params: { id: surveyId } });
      }, 700);
    } catch (e) {
      setToast({ title: toUserMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <ReviewWizardHeader draft={draft} />

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32, flexGrow: 1 }} {...scrollViewProps}>
        <ReviewCompletionBanner allComplete={allComplete} />
        <ReviewSurveyStartSection
          draft={draft}
          districtName={districtName}
          muniName={muniName}
          muniCode={selectedUlb?.code ?? '—'}
        />
        <ReviewPropertySection draft={draft} />
        <ReviewOwnerSection draft={draft} />
        <ReviewAddressSection draft={draft} />
        <ReviewTaxationSection draft={draft} bundle={bundle} />
        <ReviewAreaSection draft={draft} />
        <ReviewFloorsSection draft={draft} bundle={bundle} />
        <ReviewServicesSection draft={draft} bundle={bundle} />
        <ReviewGpsSection draft={draft} />

        <ReviewPhotosSection
          draft={draft}
          update={update}
          serverSurveyId={draft.serverSurveyId}
          onEditStep={() =>
            router.replace({ pathname: '/(app)/wizard/photos' as never, params: { localId: draft.localId } })
          }
        />

        <ReviewSubmitActions
          canSaveDraft={!!draftToSaveDraftPayload(draft)}
          allComplete={allComplete}
          savingDraft={savingDraft}
          busy={busy}
          onSaveDraft={onSaveDraft}
          onSubmit={onSubmit}
        />
      </ScrollView>

      {toast ? <Toast visible title={toast.title} tone={toast.tone} onHide={hideToast} /> : null}
    </View>
  );
}
