/**
 * Surveyor / supervisor home screen.
 *
 * Every widget is a `useQuery` — Convex pushes updates live, so the KPI
 * tiles and recent list refresh themselves as new surveys land.
 */
import {
  AppButton,
  Banner,
  DashboardSkeleton,
  EmptyState,
  KpiCard,
  PulseDot,
  SectionLabel,
  SurveyCard,
} from '@/components';
import { SurveyStatsBreakdown } from '@/components/admin/survey-stats-breakdown';
import { api } from '@/convex/_generated/api';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { useDashboardCounts } from '@/hooks/use-dashboard-counts';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { listDrafts, type WizardDraft } from '@/hooks/useWizardDraft';
import { humanizeRole, surveyOwnerListLabel } from '@/utils/format';
import { scrollViewProps } from '@/utils/scroll-props';
import { TabScreenBottomSpacer } from '@/utils/ui-layout';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DashboardScreen() {
  const router = useRouter();
  const { convexReady } = useClerkConvexAuth();
  const counts = useDashboardCounts();
  const me = useQuery(api.users.currentUser, convexReady ? {} : 'skip');
  const recent = useQuery(api.survey.list, convexReady ? { limit: 5 } : 'skip');

  const { isOnline } = useNetworkStatus();
  const [localDrafts, setLocalDrafts] = useState<WizardDraft[]>([]);

  useEffect(() => {
    void listDrafts().then(setLocalDrafts);
  }, []);

  if (me === undefined || counts === undefined || recent === undefined) {
    return (
      <View className="flex-1 bg-page-light dark:bg-page-dark p-4 pt-16">
        <DashboardSkeleton />
      </View>
    );
  }
  if (!me) return null;

  const isSupervisor = me.role === 'supervisor';

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <SafeAreaView edges={['top']} className="bg-brand">
        <View className="px-4 pt-2 pb-5">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-helper text-white/65">{humanizeRole(me.role)}</Text>
              <Text className="text-h2 font-medium text-white mt-0.5" numberOfLines={1}>
                Hello, {me.name.split(' ')[0]}
              </Text>
            </View>
            <View className="flex-row items-center bg-white/15 px-2.5 py-1 rounded-full gap-1.5">
              <PulseDot tone={isOnline ? 'success' : 'warning'} />
              <Text className="text-[11px] font-medium text-white">{isOnline ? 'Online' : 'Offline'}</Text>
            </View>
          </View>
          {me.municipality ? (
            <Text className="text-caption text-white/75 mt-2">
              {me.municipality.code} · Ward{me.wardAssignments.length === 1 ? ' ' : 's '}
              {me.wardAssignments.join(', ') || '—'}
            </Text>
          ) : null}
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 14 }} {...scrollViewProps}>
        {isSupervisor ? (
          <>
            <SectionLabel>Team analytics</SectionLabel>
            <SurveyStatsBreakdown eyebrow="Scoped to your district or ULB assignment" />
          </>
        ) : (
          <>
            <View className="flex-row gap-2 mb-3">
              <KpiCard label="Today" value={counts.today} icon="today-outline" tone="brand" />
              <KpiCard label="Drafts" value={counts.drafts} icon="create-outline" tone="warning" />
            </View>
            <View className="flex-row gap-2 mb-4">
              <KpiCard label="Submitted" value={counts.submitted} icon="cloud-upload-outline" tone="info" />
              <KpiCard label="Approved" value={counts.approved} icon="checkmark-circle" tone="success" />
            </View>
          </>
        )}

        {counts.rejected > 0 ? (
          <Banner
            tone="danger"
            icon="alert-circle-outline"
            title={`${counts.rejected} survey${counts.rejected === 1 ? '' : 's'} need revision`}
            message="Open the surveys list to review supervisor remarks."
            className="mb-4"
          />
        ) : null}

        {!isSupervisor && localDrafts.length > 0 ? (
          <View className="mb-4">
            <SectionLabel>Continue draft</SectionLabel>
            <View className="gap-2 mt-2">
              {localDrafts.slice(0, 3).map((d) => (
                <SurveyCard
                  key={d.localId}
                  parcelNo={d.parcelNo || 'Draft'}
                  unitNo={d.unitNo || '—'}
                  ownerName={d.owners?.[0]?.name ?? 'In progress'}
                  wardNo={d.wardNo ?? '—'}
                  status="draft"
                  qcStatus="pending"
                  updatedAt={d.updatedAt ?? 0}
                  onPress={() =>
                    router.push({ pathname: '/(app)/wizard/flow', params: { localId: d.localId, q: '0' } })
                  }
                />
              ))}
            </View>
          </View>
        ) : null}

        {!isSupervisor ? (
          <AppButton
            label="Start new survey"
            iconLeft="add"
            size="lg"
            onPress={() => router.push('/(app)/wizard')}
            fullWidth
          />
        ) : null}

        <View className="flex-row items-center justify-between mt-5 mb-2">
          <SectionLabel>Recent</SectionLabel>
          <Text className="text-helper text-brand font-medium" onPress={() => router.push('/surveys')}>
            View all
          </Text>
        </View>

        {recent.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title="No surveys yet"
            message="Tap 'Start new survey' to capture your first property."
          />
        ) : (
          <View className="gap-2">
            {recent.map((s) => (
              <SurveyCard
                key={s._id}
                parcelNo={s.parcelNo}
                unitNo={s.unitNo}
                ownerName={surveyOwnerListLabel(s.owners, s.respondentName)}
                wardNo={s.wardNo}
                status={s.status}
                qcStatus={s.qcStatus}
                updatedAt={s._creationTime}
                onPress={() => router.push({ pathname: '/(app)/survey/[id]', params: { id: s._id } })}
              />
            ))}
          </View>
        )}
        <TabScreenBottomSpacer />
      </ScrollView>
    </View>
  );
}
