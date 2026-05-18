/**
 * Master data overview — municipalities, wards, and lookup dropdowns.
 */
import { AppCard, EmptyState, SectionLabel, Spinner, Tag } from '@/components';
import { AdminHeader } from '@/components/admin/admin-header';
import { api } from '@/convex/_generated/api';
import { normalizeMastersBundle } from '@/utils/mastersBundle';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

type MastersTab = 'tenants' | 'lookups';

const LOOKUP_GROUPS: {
  key:
    | 'propertyUses'
    | 'ownershipTypes'
    | 'assessmentYears'
    | 'roadTypes'
    | 'taxRateZones'
    | 'situations'
    | 'relationships'
    | 'waterSources'
    | 'sanitationTypes'
    | 'usageTypes'
    | 'constructionTypes'
    | 'floors';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'propertyUses', label: 'Property uses', icon: 'construct-outline' },
  { key: 'ownershipTypes', label: 'Ownership', icon: 'key-outline' },
  { key: 'assessmentYears', label: 'Assessment years', icon: 'calendar-outline' },
  { key: 'roadTypes', label: 'Road types', icon: 'trail-sign-outline' },
  { key: 'taxRateZones', label: 'Tax zones', icon: 'layers-outline' },
  { key: 'situations', label: 'Situations', icon: 'compass-outline' },
  { key: 'relationships', label: 'Relationships', icon: 'people-outline' },
  { key: 'waterSources', label: 'Water sources', icon: 'water-outline' },
  { key: 'sanitationTypes', label: 'Sanitation', icon: 'medkit-outline' },
  { key: 'usageTypes', label: 'Usage types', icon: 'grid-outline' },
  { key: 'constructionTypes', label: 'Construction', icon: 'hammer-outline' },
  { key: 'floors', label: 'Floors', icon: 'business-outline' },
];

export default function AdminMastersScreen() {
  const [tab, setTab] = useState<MastersTab>('tenants');
  const [expandedMuni, setExpandedMuni] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const masters = useQuery(api.masters.bundle, {});

  const wardsByMuni = useMemo(() => {
    type WardRow = NonNullable<typeof masters>['wards'][number];
    const map = new Map<string, WardRow[]>();
    if (!masters) return map;
    for (const w of masters.wards) {
      const list = map.get(w.municipalityCode) ?? [];
      list.push(w);
      map.set(w.municipalityCode, list);
    }
    return map;
  }, [masters]);

  const lookupCount = useMemo(() => {
    if (!masters) return 0;
    return LOOKUP_GROUPS.reduce((sum, g) => sum + (masters[g.key]?.length ?? 0), 0);
  }, [masters]);

  if (masters === undefined) {
    return (
      <View className="flex-1 bg-page-light dark:bg-page-dark">
        <AdminHeader variant="surface" eyebrow="" title="Masters" subtitle="Loading reference data…" />
        <Spinner label="Loading masters…" />
      </View>
    );
  }

  const bundle = normalizeMastersBundle(masters);

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <AdminHeader
        variant="surface"
        eyebrow=""
        title="Masters"
        subtitle={`${bundle.districts.length} districts · ${bundle.ulbs.length} ULBs · ${lookupCount} lookup values`}
        footer={
          <View className="flex-row mt-3 p-1 bg-page-light dark:bg-page-dark rounded-xl border border-line-subtle">
            {(
              [
                { id: 'tenants' as const, label: 'Tenants' },
                { id: 'lookups' as const, label: 'Lookups' },
              ] as const
            ).map((t) => {
              const active = tab === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTab(t.id)}
                  className={['flex-1 py-2 rounded-lg items-center', active ? 'bg-brand' : ''].join(' ')}
                >
                  <Text
                    className={['text-[12px] font-semibold', active ? 'text-white' : 'text-ink-secondary-light'].join(
                      ' ',
                    )}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28 }}>
        {tab === 'tenants' ? (
          bundle.ulbs.length === 0 ? (
            <EmptyState
              icon="business-outline"
              title="No municipalities"
              message="Open the Tenants tab to seed districts and ULBs."
            />
          ) : (
            <>
              <SectionLabel>Districts</SectionLabel>
              <View className="flex-row flex-wrap gap-1.5 mb-3">
                {bundle.districts.map((d) => (
                  <View key={d._id} className="px-2.5 py-1 rounded-full bg-brand-soft border border-brand/10">
                    <Text className="text-[11px] font-medium text-brand">{d.name}</Text>
                  </View>
                ))}
              </View>
              <SectionLabel>ULBs & wards</SectionLabel>
              {bundle.ulbs.map((muni) => {
                const wards = wardsByMuni.get(muni.code) ?? [];
                const open = expandedMuni === muni.code;
                return (
                  <AppCard key={muni._id} padded={false} className="mb-2.5 overflow-hidden">
                    <Pressable
                      onPress={() => setExpandedMuni(open ? null : muni.code)}
                      className="flex-row items-center px-3.5 py-3 active:bg-page-light dark:active:bg-page-dark"
                    >
                      <View className="w-9 h-9 rounded-full bg-brand-soft items-center justify-center">
                        <Ionicons name="business-outline" size={18} color="#003B8E" />
                      </View>
                      <View className="flex-1 ml-3">
                        <Text className="text-[13px] font-medium text-ink-primary-light dark:text-ink-primary-dark">
                          {muni.name}
                        </Text>
                        <Text className="text-caption text-ink-tertiary-light mt-0.5">
                          {muni.districtName} · {muni.bodyType.replace(/_/g, ' ')}
                        </Text>
                      </View>
                      <Tag label={`${wards.length} wards`} tone="neutral" />
                      <Ionicons
                        name={open ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color="#9AA3AF"
                        style={{ marginLeft: 8 }}
                      />
                    </Pressable>
                    {open ? (
                      <View className="px-3.5 pb-3 border-t border-line-subtle">
                        {wards.length === 0 ? (
                          <Text className="text-caption text-ink-tertiary-light py-2">
                            No wards configured. Add wards before assigning surveyors.
                          </Text>
                        ) : (
                          <View className="flex-row flex-wrap gap-1.5 pt-2">
                            {wards.map((w) => (
                              <View
                                key={w._id}
                                className="px-2.5 py-1 rounded-full bg-page-light dark:bg-page-dark border border-line-subtle"
                              >
                                <Text className="text-[11px] text-ink-secondary-light">
                                  {w.wardCode} · {w.wardNo} · {w.name}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    ) : null}
                  </AppCard>
                );
              })}
            </>
          )
        ) : (
          <>
            <SectionLabel>Survey dropdown options</SectionLabel>
            <Text className="text-caption text-ink-tertiary-light -mt-1 mb-3">
              Values shown in field forms. Managed via admin API in production.
            </Text>
            {LOOKUP_GROUPS.map((group) => {
              const options = masters[group.key] ?? [];
              const open = expandedCategory === group.key;
              return (
                <AppCard key={group.key} padded={false} className="mb-2.5 overflow-hidden">
                  <Pressable
                    onPress={() => setExpandedCategory(open ? null : group.key)}
                    className="flex-row items-center px-3.5 py-3 active:bg-page-light dark:active:bg-page-dark"
                  >
                    <View className="w-9 h-9 rounded-full bg-page-light dark:bg-page-dark items-center justify-center">
                      <Ionicons name={group.icon} size={18} color="#6B7280" />
                    </View>
                    <Text className="flex-1 ml-3 text-[13px] font-medium text-ink-primary-light dark:text-ink-primary-dark">
                      {group.label}
                    </Text>
                    <Tag label={String(options.length)} tone={options.length ? 'brand' : 'neutral'} />
                    <Ionicons
                      name={open ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="#9AA3AF"
                      style={{ marginLeft: 8 }}
                    />
                  </Pressable>
                  {open ? (
                    <View className="px-3.5 pb-3 border-t border-line-subtle flex-row flex-wrap gap-1.5 pt-2">
                      {options.length === 0 ? (
                        <Text className="text-caption text-ink-tertiary-light">Not seeded</Text>
                      ) : (
                        options.map((o) => (
                          <View key={o.value} className="px-2.5 py-1 rounded-full bg-brand-soft border border-brand/10">
                            <Text className="text-[11px] font-medium text-brand">{o.label}</Text>
                          </View>
                        ))
                      )}
                    </View>
                  ) : null}
                </AppCard>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}
