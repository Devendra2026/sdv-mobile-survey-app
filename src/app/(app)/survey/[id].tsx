/**
 * Survey detail.
 *
 * Surveyor: read-only after submit; can edit fields and add photos while draft.
 * Supervisor/admin: can leave QC remarks and approve/reject.
 */
import { AppButton, AppCard, Banner, ListRow, SectionLabel, Spinner, StatusBadge, Tag, Toast } from '@/components';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toUserMessage } from '@/utils/errors';
import { formatArea, formatSurveyParcelLabel, humanizeRole, timeAgo } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const canContinueWizard = canEdit && (survey.status === 'draft' || survey.qcStatus === 'rejected');
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
              {formatSurveyParcelLabel(survey.parcelNo, survey.unitNo)}
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
            title="Respondent"
            subtitle={survey.respondentName?.trim() || '—'}
            showChevron={false}
          />
          {survey.relationship ? (
            <>
              <View className="h-px bg-line-subtle" />
              <ListRow
                icon="link-outline"
                iconTone="neutral"
                title="Relation to owner"
                subtitle={survey.relationship}
                showChevron={false}
              />
            </>
          ) : null}
          {(survey.owners ?? [])
            .filter(
              (o) => o.name?.trim() || o.fatherOrHusbandName?.trim() || o.mobileNo?.trim() || o.altMobileNo?.trim(),
            )
            .map((o, i) => (
              <View key={`${o.name ?? ''}-${i}`}>
                <View className="h-px bg-line-subtle" />
                <ListRow
                  icon="home-outline"
                  iconTone="neutral"
                  title={(survey.owners?.length ?? 0) > 1 ? `Owner ${i + 1}` : 'Owner'}
                  subtitle={
                    [
                      o.name?.trim(),
                      o.fatherOrHusbandName?.trim(),
                      o.mobileNo?.trim() ? `M: ${o.mobileNo.trim()}` : null,
                      o.altMobileNo?.trim() ? `Alt: ${o.altMobileNo.trim()}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'
                  }
                  showChevron={false}
                />
              </View>
            ))}
          {survey.familySize != null ? (
            <>
              <View className="h-px bg-line-subtle" />
              <ListRow
                icon="people-outline"
                iconTone="neutral"
                title="Family members"
                subtitle={`${survey.familySize}`}
                showChevron={false}
              />
            </>
          ) : null}
          {!survey.owners?.some((o) => o.mobileNo?.trim()) && survey.mobileNo ? (
            <>
              <View className="h-px bg-line-subtle" />
              <ListRow
                icon="call-outline"
                iconTone="neutral"
                title="Mobile"
                subtitle={survey.mobileNo}
                showChevron={false}
              />
            </>
          ) : null}
        </AppCard>

        <SectionLabel>Address</SectionLabel>
        <AppCard padded className="mb-3">
          <Text className="text-body text-ink-primary-light dark:text-ink-primary-dark">
            {[survey.houseNo, survey.colonyName, survey.locality].filter(Boolean).join(', ')}
          </Text>
          <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark mt-1">
            {survey.city} — {survey.pinCode}
          </Text>
        </AppCard>

        <SectionLabel>Taxation</SectionLabel>
        <AppCard padded={false} className="mb-3">
          <ListRow title="Assessment year" subtitle={survey.assessmentYear} showChevron={false} />
          <View className="h-px bg-line-subtle" />
          <ListRow title="Ownership" subtitle={humanizeRole(survey.ownershipType)} showChevron={false} />
          <View className="h-px bg-line-subtle" />
          <ListRow title="Property use" subtitle={humanizeRole(survey.propertyUse)} showChevron={false} />
          {survey.propertyType ? (
            <>
              <View className="h-px bg-line-subtle" />
              <ListRow title="Subcategory" subtitle={humanizeRole(survey.propertyType)} showChevron={false} />
            </>
          ) : null}
          <View className="h-px bg-line-subtle" />
          <ListRow title="Situation" subtitle={humanizeRole(survey.situation)} showChevron={false} />
          <View className="h-px bg-line-subtle" />
          <ListRow title="Road type" subtitle={humanizeRole(survey.roadType)} showChevron={false} />
          <View className="h-px bg-line-subtle" />
          <ListRow title="Road size tax zone" subtitle={humanizeRole(survey.taxRateZone)} showChevron={false} />
        </AppCard>

        <SectionLabel>Area detail</SectionLabel>
        <AppCard padded={false} className="mb-3">
          <ListRow title="Plot area" subtitle={formatArea(survey.plotSqft)} showChevron={false} />
          <View className="h-px bg-line-subtle" />
          <ListRow title="Plinth area" subtitle={formatArea(survey.plinthSqft)} showChevron={false} />
          <View className="h-px bg-line-subtle" />
          <ListRow
            title="Total built-up"
            subtitle={formatArea(survey.floors.reduce((s, f) => s + f.areaSqft, 0))}
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

        {canContinueWizard ? (
          <AppButton
            label="Continue in wizard"
            variant="outline"
            iconLeft="create-outline"
            size="lg"
            fullWidth
            className="mb-2"
            onPress={() =>
              router.push({
                pathname: '/(app)/wizard',
                params: { surveyId: id },
              })
            }
          />
        ) : null}

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
