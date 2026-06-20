/**
 * District / ULB / surveyor analytics tables — admin Reports & supervisor dashboard.
 */
import { AppCard, AppDropdown, KpiCard, SectionLabel, Spinner } from '@/components';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { useClientNowMs } from '@/hooks/use-client-now';
import { useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

type SurveyCounts = {
  total: number;
  today: number;
  drafts: number;
  submitted: number;
  approved: number;
  rejected: number;
};

type StatsRow = SurveyCounts & { key: string; label: string; meta?: string | null };

function StatsTable({ title, rows }: { title: string; rows: StatsRow[] }) {
  if (rows.length === 0) {
    return (
      <View className="mb-4">
        <SectionLabel>{title}</SectionLabel>
        <AppCard padded>
          <Text className="text-caption text-ink-tertiary-light">No data for the current filters.</Text>
        </AppCard>
      </View>
    );
  }

  return (
    <View className="mb-4">
      <SectionLabel>{title}</SectionLabel>
      <AppCard padded={false}>
        {rows.map((row, index) => (
          <View key={row.key}>
            {index > 0 ? <View className="h-px bg-line-subtle mx-3" /> : null}
            <View className="px-3 py-3">
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <Text className="text-body font-medium text-ink-primary-light dark:text-ink-primary-dark">
                    {row.label}
                  </Text>
                  {row.meta ? (
                    <Text className="text-caption text-ink-tertiary-light dark:text-ink-tertiary-dark mt-0.5">
                      {row.meta}
                    </Text>
                  ) : null}
                </View>
                <Text className="text-h2 font-semibold text-brand">{row.total}</Text>
              </View>
              <View className="flex-row flex-wrap gap-x-3 gap-y-1 mt-2">
                <Text className="text-caption text-ink-tertiary-light">Today {row.today}</Text>
                <Text className="text-caption text-ink-tertiary-light">Draft {row.drafts}</Text>
                <Text className="text-caption text-ink-tertiary-light">Submitted {row.submitted}</Text>
                <Text className="text-caption text-success">Approved {row.approved}</Text>
                {row.rejected > 0 ? <Text className="text-caption text-danger">Rejected {row.rejected}</Text> : null}
              </View>
            </View>
          </View>
        ))}
      </AppCard>
    </View>
  );
}

interface SurveyStatsBreakdownProps {
  eyebrow?: string;
  showFilters?: boolean;
}

export function SurveyStatsBreakdown({ eyebrow, showFilters = true }: SurveyStatsBreakdownProps) {
  const [districtId, setDistrictId] = useState('');
  const [municipalityId, setMunicipalityId] = useState('');
  const [surveyorId, setSurveyorId] = useState('');
  const { convexReady } = useClerkConvexAuth();
  const nowMs = useClientNowMs();
  const queryArgs = useMemo(():
    | 'skip'
    | {
        districtId: Id<'districts'> | undefined;
        municipalityId: Id<'municipalities'> | undefined;
        surveyorId: Id<'users'> | undefined;
        nowMs: number;
      } => {
    if (!convexReady || !Number.isFinite(nowMs)) return 'skip';
    return {
      districtId: districtId ? (districtId as Id<'districts'>) : undefined,
      municipalityId: municipalityId ? (municipalityId as Id<'municipalities'>) : undefined,
      surveyorId: surveyorId ? (surveyorId as Id<'users'>) : undefined,
      nowMs,
    };
  }, [convexReady, nowMs, districtId, municipalityId, surveyorId]);

  const stats = useQuery(api.analytics.surveyStatsBreakdown, queryArgs);

  const districtOptions = useMemo(
    () => [
      { value: '', label: 'All districts' },
      ...(stats?.filterOptions.districts.map((d) => ({ value: d._id, label: `${d.name} (${d.code})` })) ?? []),
    ],
    [stats?.filterOptions.districts],
  );

  const ulbOptions = useMemo(
    () => [
      { value: '', label: 'All ULBs' },
      ...(stats?.filterOptions.municipalities.map((m) => ({ value: m._id, label: `${m.name} (${m.code})` })) ?? []),
    ],
    [stats?.filterOptions.municipalities],
  );

  const surveyorOptions = useMemo(
    () => [
      { value: '', label: 'All surveyors' },
      ...(stats?.filterOptions.surveyors.map((s) => ({ value: s._id, label: s.name })) ?? []),
    ],
    [stats?.filterOptions.surveyors],
  );

  const hasFilters = Boolean(districtId || municipalityId || surveyorId);

  if (stats === undefined) {
    return <Spinner label="Loading survey analytics…" />;
  }

  const districtRows: StatsRow[] = stats.byDistrict.map((r) => ({
    ...r,
    key: r.districtId,
    label: r.name,
    meta: r.code,
  }));
  const ulbRows: StatsRow[] = stats.byUlb.map((r) => ({
    ...r,
    key: r.municipalityId,
    label: r.name,
    meta: `${r.code} · ${r.districtName}`,
  }));
  const surveyorRows: StatsRow[] = stats.bySurveyor.map((r) => {
    const place = [r.municipalityName, r.districtName].filter(Boolean).join(' · ');
    return {
      ...r,
      key: r.surveyorId,
      label: r.name,
      meta: place ? `${r.email} · ${place}` : r.email,
    };
  });

  return (
    <View>
      {eyebrow ? (
        <Text className="text-caption text-ink-tertiary-light dark:text-ink-tertiary-dark mb-2">{eyebrow}</Text>
      ) : null}

      <View className="flex-row gap-2 mb-3">
        <KpiCard label="Total" value={stats.summary.total} icon="layers-outline" tone="brand" />
        <KpiCard label="Today" value={stats.summary.today} icon="today-outline" tone="info" />
      </View>
      <View className="flex-row gap-2 mb-4">
        <KpiCard label="Submitted" value={stats.summary.submitted} icon="cloud-upload-outline" tone="info" />
        <KpiCard label="Approved" value={stats.summary.approved} icon="checkmark-circle" tone="success" />
      </View>

      {showFilters ? (
        <>
          <SectionLabel>Filter</SectionLabel>
          <AppCard padded className="mb-3">
            <AppDropdown
              placeholder="District"
              value={districtId}
              options={districtOptions}
              onChange={(id) => {
                setDistrictId(id);
                setMunicipalityId('');
                setSurveyorId('');
              }}
            />
            <View className="h-3" />
            <AppDropdown
              placeholder="ULB"
              value={municipalityId}
              options={ulbOptions}
              onChange={(id) => {
                setMunicipalityId(id);
                setSurveyorId('');
              }}
              disabled={ulbOptions.length <= 1}
            />
            <View className="h-3" />
            <AppDropdown placeholder="Surveyor" value={surveyorId} options={surveyorOptions} onChange={setSurveyorId} />
            {hasFilters ? (
              <Pressable
                onPress={() => {
                  setDistrictId('');
                  setMunicipalityId('');
                  setSurveyorId('');
                }}
                className="mt-3"
              >
                <Text className="text-helper text-brand font-medium text-center">Clear filters</Text>
              </Pressable>
            ) : null}
          </AppCard>
        </>
      ) : null}

      <StatsTable title="By district" rows={districtRows} />
      <StatsTable title="By ULB" rows={ulbRows} />
      <StatsTable title="By surveyor" rows={surveyorRows} />
    </View>
  );
}
