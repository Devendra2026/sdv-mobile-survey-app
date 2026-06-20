/**
 * Survey detail.
 *
 * Surveyor: read-only after submit; can edit fields and add photos while draft.
 * Supervisor/admin: can leave QC remarks and approve/reject.
 */
import { Spinner, Toast } from '@/components';
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
import { toUserMessage } from '@/utils/errors';
import { normalizeMastersBundle } from '@/utils/mastersBundle';
import { backOrReplace } from '@/utils/navigation';
import { scrollViewProps } from '@/utils/scroll-props';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

export default function SurveyDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id as Id<'surveys'> | undefined;
  const me = useQuery(api.users.currentUser, {});
  const survey = useQuery(api.survey.get, id ? { id } : 'skip');
  const masters = useQuery(api.masters.bundle, {});
  const submit = useMutation(api.survey.submit);
  const decide = useMutation(api.qc.decide);
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);
  const [busy, setBusy] = useState(false);
  const hideToast = useCallback(() => setToast(null), []);

  if (!id || me === undefined || masters === undefined) return <Spinner label="Loading…" />;
  if (survey === undefined) return <Spinner label="Loading survey…" />;
  if (survey === null) {
    return (
      <View className="flex-1 items-center justify-center bg-page-light p-6">
        <Text className="text-h2 text-ink-primary-light">Survey not found</Text>
      </View>
    );
  }

  const canEdit = me?.role === 'surveyor' ? survey.surveyorId === me._id && survey.qcStatus !== 'approved' : true;
  const canSubmit = canEdit && survey.status === 'draft';
  const canContinueWizard = canEdit && (survey.status === 'draft' || survey.qcStatus === 'rejected');
  const canReview =
    (me?.role === 'supervisor' || me?.role === 'admin') &&
    survey.status === 'submitted' &&
    survey.qcStatus !== 'approved';

  const bundle = normalizeMastersBundle(masters);

  const doSubmit = async () => {
    setBusy(true);
    try {
      await submit({ id });
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
