/**
 * Admin-only tenant setup — districts, ULBs, wards, and assessment years.
 */
import { AppButton, AppCard, AppDropdown, AppInput, EmptyState, SectionLabel, Spinner, Tag, Toast } from '@/components';
import { AdminHeader } from '@/components/admin/admin-header';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { toUserMessage } from '@/utils/errors';
import { humanizeUlbBodyType } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

const BODY_TYPES = [
  { value: 'municipal_council', label: 'Municipal Council' },
  { value: 'town_panchayat', label: 'Town Panchayat' },
] as const;

export default function AdminTenantsScreen() {
  const { convexReady } = useClerkConvexAuth();
  const queryArgs = convexReady ? {} : ('skip' as const);
  const tree = useQuery(api.tenants.listForAdmin, queryArgs);
  const assessmentYears = useQuery(api.tenants.listAssessmentYears, queryArgs);
  const seed = useMutation(api.tenants.seedReferenceData);
  const upsertDistrict = useMutation(api.tenants.upsertDistrict);
  const upsertMunicipality = useMutation(api.tenants.upsertMunicipality);
  const upsertWard = useMutation(api.tenants.upsertWard);
  const upsertAssessmentYear = useMutation(api.tenants.upsertAssessmentYear);

  const [expandedDistrict, setExpandedDistrict] = useState<string | null>(null);
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);
  const [busy, setBusy] = useState(false);

  const [districtName, setDistrictName] = useState('');
  const [selectedDistrictId, setSelectedDistrictId] = useState('');
  const [ulbCode, setUlbCode] = useState('');
  const [ulbName, setUlbName] = useState('');
  const [ulbBodyType, setUlbBodyType] = useState<string>('municipal_council');

  const [wardMunicipalityId, setWardMunicipalityId] = useState('');
  const [wardNo, setWardNo] = useState('');
  const [wardCode, setWardCode] = useState('');
  const [wardName, setWardName] = useState('');

  const [yearValue, setYearValue] = useState('');
  const [yearLabel, setYearLabel] = useState('');

  const districtOptions = useMemo(() => tree?.map((d) => ({ value: d._id, label: d.name })) ?? [], [tree]);

  const ulbOptions = useMemo(() => {
    if (!tree) return [];
    return tree.flatMap((d) =>
      d.ulbs.map((u) => ({
        value: u._id,
        label: `${u.name} (${d.name})`,
      })),
    );
  }, [tree]);

  const makeDistrictCode = (name: string) => {
    const base = name
      .replace(/[^a-zA-Z]/g, '')
      .toUpperCase()
      .slice(0, 3)
      .padEnd(3, 'X');
    const used = new Set(tree?.map((d) => d.code) ?? []);
    if (!used.has(base)) return base;
    for (let n = 2; n < 100; n++) {
      const candidate = `${base.slice(0, 2)}${n}`;
      if (!used.has(candidate)) return candidate;
    }
    return `${base}${Date.now().toString(36).slice(-2).toUpperCase()}`;
  };

  const onSeed = () => {
    const hasData = (tree?.length ?? 0) > 0;
    Alert.alert(
      hasData ? 'Refresh reference data?' : 'Seed reference data?',
      hasData
        ? 'Updates existing UP districts, ULBs, wards, and assessment years from the built-in catalog. Your custom rows are kept.'
        : 'Loads UP districts (Agra, Etah, Baghpat, Mainpuri, Kasganj), sample ULBs, wards with codes, and assessment years 2025-26 / 2026-27.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: hasData ? 'Refresh' : 'Seed',
          onPress: async () => {
            setBusy(true);
            try {
              await seed({});
              setToast({
                title: hasData ? 'Reference data refreshed' : 'Reference data seeded',
                tone: 'success',
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

  const onAddDistrict = async () => {
    setBusy(true);
    try {
      const name = districtName.trim();
      if (!name) {
        setToast({ title: 'District name is required', tone: 'danger' });
        return;
      }
      await upsertDistrict({
        code: makeDistrictCode(name),
        name,
        stateName: 'Uttar Pradesh',
        isActive: true,
      });
      setDistrictName('');
      setToast({ title: 'District saved', tone: 'success' });
    } catch (e) {
      setToast({ title: toUserMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const onAddUlb = async () => {
    if (!selectedDistrictId) {
      setToast({ title: 'Select a district first', tone: 'danger' });
      return;
    }
    setBusy(true);
    try {
      await upsertMunicipality({
        districtId: selectedDistrictId as Id<'districts'>,
        code: ulbCode,
        name: ulbName,
        bodyType: ulbBodyType as 'municipal_council',
        isActive: true,
      });
      setUlbCode('');
      setUlbName('');
      setToast({ title: 'ULB saved', tone: 'success' });
    } catch (e) {
      setToast({ title: toUserMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const onAddWard = async () => {
    if (!wardMunicipalityId) {
      setToast({ title: 'Select a ULB for the ward', tone: 'danger' });
      return;
    }
    const trimmedNo = wardNo.trim();
    const trimmedName = wardName.trim();
    if (!trimmedNo) {
      setToast({ title: 'Ward number is required', tone: 'danger' });
      return;
    }
    if (!trimmedName) {
      setToast({ title: 'Ward name is required', tone: 'danger' });
      return;
    }
    setBusy(true);
    try {
      const trimmedCode = wardCode.trim();
      await upsertWard({
        municipalityId: wardMunicipalityId as Id<'municipalities'>,
        wardNo: trimmedNo,
        ...(trimmedCode ? { wardCode: trimmedCode } : {}),
        name: trimmedName,
      });
      setWardNo('');
      setWardCode('');
      setWardName('');
      setToast({ title: 'Ward saved', tone: 'success' });
    } catch (e) {
      setToast({ title: toUserMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const onAddAssessmentYear = async () => {
    const value = yearValue.trim();
    const label = yearLabel.trim() || value;
    if (!value) {
      setToast({ title: 'Assessment year value is required (e.g. 2027-28)', tone: 'danger' });
      return;
    }
    setBusy(true);
    try {
      await upsertAssessmentYear({ value, label });
      setYearValue('');
      setYearLabel('');
      setToast({ title: 'Assessment year saved', tone: 'success' });
    } catch (e) {
      setToast({ title: toUserMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  if (tree === undefined || assessmentYears === undefined) {
    return (
      <View className="flex-1 bg-page-light dark:bg-page-dark">
        <AdminHeader title="Tenants" subtitle="Loading…" />
        <Spinner label="Loading tenants…" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <AdminHeader
        title="Tenant setup"
        subtitle="Districts, ULBs, wards, assessment years — field users see scoped data only"
        footer={
          <AppButton
            label={busy ? 'Working…' : 'Seed UP reference data'}
            onPress={onSeed}
            loading={busy}
            variant="outline"
            size="sm"
            className="mt-3"
            iconLeft="cloud-download-outline"
          />
        }
      />

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32 }}>
        <SectionLabel>Assessment years</SectionLabel>
        <AppCard padded className="mb-4">
          <View style={{ gap: 10 }}>
            {assessmentYears.length > 0 ? (
              <View className="flex-row flex-wrap gap-1.5 mb-1">
                {assessmentYears.map((y) => (
                  <View key={y._id} className="px-2.5 py-1 rounded-full bg-brand-soft border border-brand/10">
                    <Text className="text-[11px] font-medium text-brand">{y.label}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="text-caption text-ink-tertiary-light">
                No assessment years yet. Add one or seed reference data.
              </Text>
            )}
            <AppInput
              label="Year value"
              value={yearValue}
              onChangeText={setYearValue}
              placeholder="e.g. 2027-28"
              autoCapitalize="none"
            />
            <AppInput
              label="Display label"
              value={yearLabel}
              onChangeText={setYearLabel}
              placeholder="Same as value if empty"
              autoCapitalize="none"
            />
            <AppButton
              label="Add assessment year"
              onPress={onAddAssessmentYear}
              loading={busy}
              size="sm"
              iconLeft="add-outline"
            />
          </View>
        </AppCard>

        <SectionLabel>Add district</SectionLabel>
        <AppCard padded className="mb-4">
          <View style={{ gap: 10 }}>
            <AppInput label="Name" value={districtName} onChangeText={setDistrictName} placeholder="e.g. Agra" />
            <AppButton label="Save district" onPress={onAddDistrict} loading={busy} size="sm" />
          </View>
        </AppCard>

        <SectionLabel>Add ULB</SectionLabel>
        <AppCard padded className="mb-4">
          <View style={{ gap: 10 }}>
            <AppDropdown
              placeholder="District"
              value={selectedDistrictId}
              options={districtOptions}
              onChange={setSelectedDistrictId}
            />
            <AppInput
              label="ULB code"
              value={ulbCode}
              onChangeText={setUlbCode}
              placeholder="e.g. AGR-MC-001"
              autoCapitalize="characters"
            />
            <AppInput label="ULB name" value={ulbName} onChangeText={setUlbName} placeholder="Municipal Council name" />
            <AppDropdown
              placeholder="Body type"
              value={ulbBodyType}
              options={[...BODY_TYPES]}
              onChange={setUlbBodyType}
            />
            <AppButton label="Save ULB" onPress={onAddUlb} loading={busy} size="sm" />
          </View>
        </AppCard>

        <SectionLabel>Add ward</SectionLabel>
        <AppCard padded className="mb-4">
          <View style={{ gap: 10 }}>
            <AppDropdown
              placeholder="ULB"
              value={wardMunicipalityId}
              options={ulbOptions}
              onChange={setWardMunicipalityId}
            />
            <AppInput label="Ward number" value={wardNo} onChangeText={setWardNo} placeholder="e.g. 12" />
            <AppInput
              label="Ward code (optional)"
              value={wardCode}
              onChangeText={setWardCode}
              placeholder="Auto: ULB code + ward no (e.g. AGR-MC-001-W12)"
              autoCapitalize="characters"
            />
            <AppInput label="Ward name" value={wardName} onChangeText={setWardName} placeholder="e.g. Tajganj" />
            <AppButton label="Save ward" onPress={onAddWard} loading={busy} size="sm" iconLeft="add-outline" />
          </View>
        </AppCard>

        <SectionLabel>Districts & ULBs</SectionLabel>
        {tree.length === 0 ? (
          <EmptyState icon="map-outline" title="No districts" message="Seed reference data or add a district above." />
        ) : (
          tree.map((d) => {
            const open = expandedDistrict === d._id;
            return (
              <AppCard key={d._id} padded={false} className="mb-2.5 overflow-hidden">
                <Pressable
                  onPress={() => setExpandedDistrict(open ? null : d._id)}
                  className="flex-row items-center px-3.5 py-3"
                >
                  <View className="w-9 h-9 rounded-full bg-brand-soft items-center justify-center">
                    <Ionicons name="map-outline" size={18} color="#003B8E" />
                  </View>
                  <View className="flex-1 ml-3">
                    <Text className="text-[13px] font-medium text-ink-primary-light dark:text-ink-primary-dark">
                      {d.name}
                    </Text>
                    <Text className="text-caption text-ink-tertiary-light">
                      {d.code} · {d.stateName}
                    </Text>
                  </View>
                  <Tag label={`${d.ulbs.length} ULBs`} tone={d.isActive === false ? 'neutral' : 'brand'} />
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color="#9AA3AF"
                    style={{ marginLeft: 8 }}
                  />
                </Pressable>
                {open ? (
                  <View className="px-3.5 pb-3 border-t border-line-subtle">
                    {d.ulbs.length === 0 ? (
                      <Text className="text-caption text-ink-tertiary-light py-2">No ULBs in this district</Text>
                    ) : (
                      d.ulbs.map((u) => (
                        <View key={u._id} className="py-2 border-b border-line-subtle last:border-b-0">
                          <Text className="text-body text-ink-primary-light dark:text-ink-primary-dark">{u.name}</Text>
                          <Text className="text-helper text-ink-tertiary-light mt-0.5">
                            {u.code} · {humanizeUlbBodyType(u.bodyType)} · {u.wards.length} wards
                          </Text>
                          {u.wards.length > 0 ? (
                            <View className="flex-row flex-wrap gap-1.5 mt-2">
                              {u.wards.map((w) => (
                                <View
                                  key={w._id}
                                  className="px-2 py-0.5 rounded-full bg-page-light dark:bg-page-dark border border-line-subtle"
                                >
                                  <Text className="text-[10px] text-ink-secondary-light">
                                    {w.wardCode ?? w.wardNo} · {w.name}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      ))
                    )}
                  </View>
                ) : null}
              </AppCard>
            );
          })
        )}
      </ScrollView>

      {toast ? <Toast visible title={toast.title} tone={toast.tone} onHide={() => setToast(null)} /> : null}
    </View>
  );
}
