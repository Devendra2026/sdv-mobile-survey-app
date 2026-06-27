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
import { useUnifiedDrafts } from '@/hooks/useUnifiedDrafts';
import { markScreenReady, markScreenStart } from '@/lib/perf-monitor';
import { humanizeRole, surveyOwnerListLabel } from '@/utils/format';
import { scrollViewProps } from '@/utils/scroll-props';
import { TabScreenBottomSpacer } from '@/utils/ui-layout';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DashboardScreen() {
  const router = useRouter();
  const screenStart = useMemo(() => {
    markScreenStart('dashboard');
    return performance.now();
  }, []);
  const { convexReady } = useClerkConvexAuth();
  const counts = useDashboardCounts();
  const me = useQuery(api.users.currentUser, convexReady ? {} : 'skip');
  const recent = useQuery(api.survey.list, convexReady ? { limit: 5, sortBy: 'updated' as const } : 'skip');

  const { isOnline } = useNetworkStatus();
  const [draftsEnabled, setDraftsEnabled] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

  useEffect(() => {
    if (counts === undefined) return;
    const frame = requestAnimationFrame(() => setDraftsEnabled(true));
    return () => cancelAnimationFrame(frame);
  }, [counts]);

  useEffect(() => {
    if (me?.role !== 'supervisor' || counts === undefined) return;
    const frame = requestAnimationFrame(() => setAnalyticsEnabled(true));
    return () => cancelAnimationFrame(frame);
  }, [me?.role, counts]);

  const { items: draftItems, loading: draftsLoading } = useUnifiedDrafts({
    enabled: draftsEnabled,
    serverLimit: 20,
  });

  const recentActivity = (recent ?? []).filter((s) => s.status !== 'draft');

  const readyForContent =
    me !== undefined && counts !== undefined && recent !== undefined && !(draftsEnabled && draftsLoading);

  useEffect(() => {
    if (!readyForContent || !me) return;
    markScreenReady('dashboard', screenStart);
  }, [readyForContent, me, screenStart]);

  if (me === undefined || counts === undefined || recent === undefined || (draftsEnabled && draftsLoading)) {
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
            <View className="flex-row gap-2 mb-3">
              <KpiCard label="My drafts" value={counts.drafts} icon="create-outline" tone="warning" />
              <KpiCard label="Submitted" value={counts.submitted} icon="cloud-upload-outline" tone="info" />
            </View>
            <SectionLabel>Team analytics</SectionLabel>
            {analyticsEnabled ? (
              <SurveyStatsBreakdown eyebrow="Scoped to your district or ULB assignment" />
            ) : (
              <DashboardSkeleton />
            )}
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

        <SectionLabel>New survey</SectionLabel>
        <AppButton
          label="Start new survey"
          iconLeft="add"
          size="lg"
          onPress={() => router.push('/(app)/wizard')}
          fullWidth
          className="mb-5"
        />

        {draftItems.length > 0 ? (
          <View className="mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <SectionLabel>Saved drafts ({draftItems.length})</SectionLabel>
              <Text className="text-helper text-brand font-medium" onPress={() => router.push('/surveys')}>
                View all
              </Text>
            </View>
            <View className="gap-2">
              {draftItems.map((d, i) => (
                <SurveyCard
                  key={d.key}
                  parcelNo={d.parcelNo}
                  unitNo={d.unitNo}
                  ownerName={d.ownerName}
                  wardNo={d.wardNo}
                  status="draft"
                  qcStatus="pending"
                  createdAt={d.createdAt}
                  updatedAt={d.updatedAt}
                  completionPct={d.completionPct}
                  highlight={i === 0 ? 'recent' : 'none'}
                  onPress={() => {
                    if (d.resumeLocal) {
                      router.push({ pathname: '/(app)/wizard', params: { resume: d.localId } });
                      return;
                    }
                    if (d.serverSurveyId) {
                      router.push({ pathname: '/(app)/wizard', params: { surveyId: d.serverSurveyId } });
                    }
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View className="flex-row items-center justify-between mt-2 mb-2">
          <SectionLabel>Recent activity</SectionLabel>
          <Text className="text-helper text-brand font-medium" onPress={() => router.push('/surveys')}>
            View all
          </Text>
        </View>

        {recentActivity.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title="No submitted surveys yet"
            message="Start a new survey above. Submitted and approved surveys appear here."
          />
        ) : (
          <View className="gap-2">
            {recentActivity.map((s) => (
              <SurveyCard
                key={s._id}
                parcelNo={s.parcelNo}
                unitNo={s.unitNo}
                ownerName={surveyOwnerListLabel(s.owners, s.respondentName)}
                wardNo={s.wardNo}
                status={s.status}
                qcStatus={s.qcStatus}
                createdAt={s._creationTime}
                updatedAt={s.clientUpdatedAt}
                completionPct={s.completionPct}
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
