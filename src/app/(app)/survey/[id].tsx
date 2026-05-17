/**
 * Survey detail.
 *
 * Surveyor: read-only after submit; can edit fields and add photos while draft.
 * Supervisor/admin: can leave QC remarks and approve/reject.
 */
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { Ionicons } from '@expo/vector-icons';
import { AppButton, AppCard, Banner, ListRow, SectionLabel, Spinner, StatusBadge, Tag, Toast } from '@/components';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useState } from 'react';
import { humanizeRole, formatArea, timeAgo } from '@/utils/format';
import { toUserMessage } from '@/utils/errors';

export default function SurveyDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id as Id<'surveys'> | undefined;
  const me = useQuery(api.users.currentUser, {});
  const survey = useQuery(api.surveys.get, id ? { id } : 'skip');
  const submit = useMutation(api.surveys.submit);
  const decide = useMutation(api.qc.decide);
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!id || me === undefined) return <Spinner label="Loading…" />;
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
  const canReview =
    (me?.role === 'supervisor' || me?.role === 'admin') &&
    survey.status === 'submitted' &&
    survey.qcStatus !== 'approved';

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
      <SafeAreaView edges={['top']} className="bg-brand">
        <View className="px-4 py-3 flex-row items-center">
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" onPress={() => router.back()} />
          <View className="flex-1 ml-2">
            <Text className="text-helper text-white/75">Survey · v{survey.serverVersion}</Text>
            <Text className="text-h3 font-medium text-white" numberOfLines={1}>
              {survey.propertyNo}
            </Text>
          </View>
        </View>
        <View className="px-4 pb-3 flex-row gap-1.5">
          <StatusBadge status={survey.status} />
          {survey.qcStatus !== 'pending' ? (
            <Tag
              label={`QC: ${survey.qcStatus}`}
              tone={survey.qcStatus === 'approved' ? 'success' : 'danger'}
              icon={survey.qcStatus === 'approved' ? 'checkmark-circle' : 'alert'}
            />
          ) : null}
          <Tag label={`Ward ${survey.wardNo}`} tone="neutral" icon="map-outline" />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28 }}>
        {survey.qcStatus === 'rejected' ? (
          <Banner
            tone="danger"
            icon="alert-circle"
            title="Returned by supervisor"
            message="Check the remarks below and edit the draft to resubmit."
            className="mb-3"
          />
        ) : null}

        <SectionLabel>Owner</SectionLabel>
        <AppCard padded={false} className="mb-3">
          <ListRow
            icon="person-outline"
            iconTone="brand"
            title="Owner"
            subtitle={survey.ownerName}
            showChevron={false}
          />
          <View className="h-px bg-line-subtle" />
          <ListRow
            icon="call-outline"
            iconTone="neutral"
            title="Mobile"
            subtitle={survey.mobileNo}
            showChevron={false}
          />
          <View className="h-px bg-line-subtle" />
          <ListRow
            icon="people-outline"
            iconTone="neutral"
            title="Family size"
            subtitle={`${survey.familySize}`}
            showChevron={false}
          />
        </AppCard>

        <SectionLabel>Address</SectionLabel>
        <AppCard padded className="mb-3">
          <Text className="text-body text-ink-primary-light dark:text-ink-primary-dark">
            {survey.houseNo}, {survey.street}
            {survey.locality ? `, ${survey.locality}` : ''}
          </Text>
          <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark mt-1">
            {survey.city} — {survey.pinCode}
          </Text>
        </AppCard>

        <SectionLabel>Taxation</SectionLabel>
        <AppCard padded={false} className="mb-3">
          <ListRow title="Assessment year" subtitle={survey.assessmentYear} showChevron={false} />
          <View className="h-px bg-line-subtle" />
          <ListRow title="Property type" subtitle={humanizeRole(survey.propertyType)} showChevron={false} />
          <View className="h-px bg-line-subtle" />
          <ListRow title="Use" subtitle={humanizeRole(survey.propertyUse)} showChevron={false} />
          <View className="h-px bg-line-subtle" />
          <ListRow
            title="Plot · Plinth"
            subtitle={`${formatArea(survey.plotSqft)} · ${formatArea(survey.plinthSqft)}`}
            showChevron={false}
          />
        </AppCard>

        <SectionLabel>Floors ({survey.floors.length})</SectionLabel>
        <AppCard padded={false} className="mb-3">
          {survey.floors.length === 0 ? (
            <View className="p-4 items-center">
              <Text className="text-helper text-ink-tertiary-light">No floors yet</Text>
            </View>
          ) : (
            survey.floors.map((f, i) => (
              <View key={f._id}>
                {i > 0 ? <View className="h-px bg-line-subtle" /> : null}
                <ListRow
                  title={`${f.floorName} · ${humanizeRole(f.usageType)}`}
                  subtitle={`${formatArea(f.areaSqft)} · ${humanizeRole(f.constructionType)}${f.isOccupied ? '' : ' · vacant'}`}
                  showChevron={false}
                />
              </View>
            ))
          )}
        </AppCard>

        <SectionLabel>Photos ({survey.photos.length})</SectionLabel>
        <AppCard padded className="mb-3">
          {survey.photos.length === 0 ? (
            <Text className="text-helper text-ink-tertiary-light text-center py-2">
              No photos yet. Front + inside photos are required to submit.
            </Text>
          ) : (
            <View className="flex-row gap-1.5 flex-wrap">
              {survey.photos.map((p) => (
                <View key={p._id} className="items-center">
                  <View className="w-20 h-20 rounded-md bg-page-light dark:bg-page-dark items-center justify-center border border-line-subtle">
                    <Ionicons name="image-outline" size={28} color="#003B8E" />
                  </View>
                  <Text className="text-caption text-ink-tertiary-light mt-1">{humanizeRole(p.slot)}</Text>
                </View>
              ))}
            </View>
          )}
        </AppCard>

        <SectionLabel>QC remarks ({survey.qcRemarks.length})</SectionLabel>
        <AppCard padded className="mb-4">
          {survey.qcRemarks.length === 0 ? (
            <Text className="text-helper text-ink-tertiary-light text-center py-2">No remarks yet</Text>
          ) : (
            survey.qcRemarks.slice(0, 3).map((r) => (
              <View key={r._id} className="mb-3 last:mb-0">
                <View className="flex-row items-center gap-1.5">
                  <Tag label={r.authorRole} tone={r.authorRole === 'surveyor' ? 'neutral' : 'brand'} />
                  <Text className="text-caption text-ink-tertiary-light">{timeAgo(r._creationTime)}</Text>
                </View>
                <Text className="text-body text-ink-primary-light dark:text-ink-primary-dark mt-1" numberOfLines={3}>
                  {r.message}
                </Text>
              </View>
            ))
          )}
          <AppButton
            label={survey.qcRemarks.length > 0 ? 'Open conversation' : 'Start a conversation'}
            variant="outline"
            size="sm"
            iconLeft="chatbubble-ellipses-outline"
            onPress={() => router.push({ pathname: '/(app)/qc/[id]', params: { id } })}
            className="mt-2"
            fullWidth
          />
        </AppCard>

        {canSubmit ? (
          <AppButton
            label={busy ? 'Submitting…' : 'Submit for review'}
            loading={busy}
            onPress={doSubmit}
            iconLeft="cloud-upload-outline"
            size="lg"
            fullWidth
            className="mb-2"
          />
        ) : null}

        {canReview ? (
          <View className="flex-row gap-2">
            <AppButton
              label="Reject"
              variant="outline"
              size="lg"
              iconLeft="close-outline"
              onPress={() => doDecide('reject')}
              loading={busy}
              className="flex-1"
            />
            <AppButton
              label="Approve"
              size="lg"
              iconLeft="checkmark-outline"
              onPress={() => doDecide('approve')}
              loading={busy}
              className="flex-1"
            />
          </View>
        ) : null}
      </ScrollView>

      {toast ? <Toast visible title={toast.title} tone={toast.tone} onHide={() => setToast(null)} /> : null}
    </View>
  );
}
