/**
 * Survey detail.
 *
 * Surveyor: read-only after submit; can edit fields and add photos while draft.
 * Supervisor/admin: can leave QC remarks and approve/reject.
 */
import { Banner, Spinner, Toast } from '@/components';
import {
  SurveyAddressSection,
  SurveyAreaSection,
  SurveyDetailActions,
  SurveyDetailHeader,
  SurveyFloorsSection,
  SurveyGpsSection,
  SurveyOwnerSection,
  SurveyPhotosCard,
  SurveyQcSection,
  SurveyRejectedBanner,
  SurveyServicesSection,
  SurveyTaxationSection,
} from '@/components/survey/survey-detail-sections';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { validateGpsCapture } from '@/convex/lib/gpsValidation';
import { useCurrentUser } from '@/hooks/use-current-user';
import { clearDraft, surveyToDraft } from '@/hooks/useWizardDraft';
import { allStepsComplete, incompleteStepLabels } from '@/hooks/wizardSteps';
import { canWithCapabilities } from '@/lib/permissions';
import { toUserMessage } from '@/utils/errors';
import { normalizeMastersBundle } from '@/utils/mastersBundle';
import { backOrReplace } from '@/utils/navigation';
import { scrollViewProps } from '@/utils/scroll-props';
import { allMissingFields } from '@/utils/wizardValidation';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

export default function SurveyDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id as Id<'surveys'> | undefined;
  const { user: me, role, capabilities, isLoading: meLoading } = useCurrentUser();
  const survey = useQuery(api.survey.get, id ? { id } : 'skip');
  const masters = useQuery(api.masters.bundle, {});
  const submit = useMutation(api.survey.submit);
  const decide = useMutation(api.qc.decide);
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);
  const [busy, setBusy] = useState(false);
  const hideToast = useCallback(() => setToast(null), []);

  if (!id || meLoading || masters === undefined) return <Spinner label="Loading…" />;
  if (survey === undefined) return <Spinner label="Loading survey…" />;
  if (survey === null) {
    return (
      <View className="flex-1 items-center justify-center bg-page-light p-6">
        <Text className="text-h2 text-ink-primary-light">Survey not found</Text>
      </View>
    );
  }

  const canQcReview = canWithCapabilities(capabilities, role, 'qc.review');
  const canQcDecide = canWithCapabilities(capabilities, role, 'qc.decide');
  const canEditDraft = canWithCapabilities(capabilities, role, 'surveys.editDraft');
  const isOwnSurvey = !!me && survey.surveyorId === me._id;
  const inQcQueue = survey.status === 'submitted' && survey.qcStatus === 'pending';
  const canEdit =
    !!me &&
    canEditDraft &&
    survey.qcStatus !== 'approved' &&
    !(inQcQueue && !canQcReview) &&
    (role !== 'surveyor' || isOwnSurvey);
  const bundle = normalizeMastersBundle(masters);
  const isOwnDraft = survey.status === 'draft' && !!me && survey.surveyorId === me._id;
  const draftForCheck = surveyToDraft(survey);
  const ulb = bundle.ulbs.find((u) => String(u._id) === String(survey.municipalityId));
  if (ulb?.postalCode) draftForCheck.ulbPostalCode = ulb.postalCode;
  const submitReady = allStepsComplete(draftForCheck);
  const incompleteSteps = incompleteStepLabels(draftForCheck);
  const missingFields = allMissingFields(draftForCheck);
  const canSubmitBase = canEdit && survey.status === 'draft' && isOwnDraft;
  const canSubmit = canSubmitBase && submitReady;
  const canContinueWizard = canEdit && (survey.status === 'draft' || survey.qcStatus === 'rejected');
  const canReview = canQcDecide && inQcQueue;

  const doSubmit = async () => {
    if (!submitReady) {
      const preview = missingFields.slice(0, 3).join(', ');
      setToast({
        title: preview ? `Missing: ${preview}` : `Complete steps: ${incompleteSteps.join(', ')}`,
        tone: 'danger',
      });
      return;
    }
    if (survey.gps) {
      const gpsErrors = validateGpsCapture(survey.gps, { strict: true });
      if (gpsErrors.length > 0) {
        setToast({ title: gpsErrors[0]!, tone: 'danger' });
        return;
      }
    }
    setBusy(true);
    try {
      await submit({ id });
      if (survey.localId) {
        await clearDraft(survey.localId);
      }
      setToast({ title: 'Submitted for review', tone: 'success' });
    } catch (e) {
      setToast({ title: toUserMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const doDecide = (decision: 'approve' | 'reject') => {
    Alert.alert(
      decision === 'approve' ? 'Approve survey?' : 'Reject survey?',
      decision === 'approve'
        ? 'The surveyor will be notified and the record will be locked.'
        : 'The surveyor will be notified to make corrections.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: decision === 'approve' ? 'Approve' : 'Reject',
          style: decision === 'reject' ? 'destructive' : 'default',
          onPress: async () => {
            setBusy(true);
            try {
              await decide({ surveyId: id, decision });
              setToast({
                title: decision === 'approve' ? 'Approved' : 'Rejected',
                tone: decision === 'approve' ? 'success' : 'danger',
              });
            } catch (e) {
              setToast({ title: toUserMessage(e), tone: 'danger' });
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <SurveyDetailHeader survey={survey} onBack={() => backOrReplace(router)} />

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28, flexGrow: 1 }} {...scrollViewProps}>
        <SurveyRejectedBanner survey={survey} />
        {canSubmitBase && !submitReady ? (
          <Banner
            tone="warning"
            icon="warning-outline"
            title="Complete wizard before submitting"
            message={
              missingFields.length > 0
                ? `Missing: ${missingFields.slice(0, 5).join(', ')}${missingFields.length > 5 ? '…' : ''}`
                : `Missing steps: ${incompleteSteps.join(', ')}`
            }
            className="mb-3"
          />
        ) : null}
        <SurveyOwnerSection survey={survey} />
        <SurveyAddressSection survey={survey} />
        <SurveyTaxationSection survey={survey} bundle={bundle} />
        <SurveyAreaSection survey={survey} />
        <SurveyFloorsSection survey={survey} bundle={bundle} />
        <SurveyServicesSection survey={survey} bundle={bundle} />
        <SurveyGpsSection survey={survey} />
        <SurveyPhotosCard survey={survey} canRetake={canContinueWizard} />
        <SurveyQcSection
          survey={survey}
          surveyId={id}
          onOpenConversation={() => router.push({ pathname: '/(app)/qc/[id]', params: { id } })}
        />
        <SurveyDetailActions
          canContinueWizard={canContinueWizard}
          canSubmit={canSubmit}
          canReview={canReview}
          busy={busy}
          submitHint={
            canSubmitBase && !submitReady
              ? missingFields.length > 0
                ? missingFields.slice(0, 3).join(', ')
                : incompleteSteps.join(', ')
              : undefined
          }
          onContinueWizard={() =>
            router.push({
              pathname: '/(app)/wizard',
              params: { surveyId: id },
            })
          }
          onSubmit={doSubmit}
          onDecide={doDecide}
        />
      </ScrollView>

      {toast ? <Toast visible title={toast.title} tone={toast.tone} onHide={hideToast} /> : null}
    </View>
  );
}
