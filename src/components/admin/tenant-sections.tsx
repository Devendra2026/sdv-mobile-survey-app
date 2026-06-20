import { AppButton, AppCard, AppDropdown, AppInput, EmptyState, SectionLabel, Tag } from '@/components';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { humanizeUlbBodyType } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import type { FunctionReturnType } from 'convex/server';
import { Pressable, Text, View } from 'react-native';

type TenantTree = FunctionReturnType<typeof api.tenants.listForAdmin>;
type AssessmentYear = FunctionReturnType<typeof api.tenants.listAssessmentYears>[number];

const BODY_TYPES = [
  { value: 'municipal_council', label: 'Municipal Council' },
  { value: 'town_panchayat', label: 'Town Panchayat' },
] as const;

export function AssessmentYearsSection({
  years,
  yearValue,
  yearLabel,
  busy,
  onYearValueChange,
  onYearLabelChange,
  onAdd,
}: {
  years: AssessmentYear[];
  yearValue: string;
  yearLabel: string;
  busy: boolean;
  onYearValueChange: (v: string) => void;
  onYearLabelChange: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <>
      <SectionLabel>Assessment years</SectionLabel>
      <AppCard padded className="mb-4">
        <View style={{ gap: 10 }}>
          {years.length > 0 ? (
            <View className="flex-row flex-wrap gap-1.5 mb-1">
              {years.map((y) => (
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
            onChangeText={onYearValueChange}
            placeholder="e.g. 2027-28"
            autoCapitalize="none"
          />
          <AppInput
            label="Display label"
            value={yearLabel}
            onChangeText={onYearLabelChange}
            placeholder="Same as value if empty"
            autoCapitalize="none"
          />
          <AppButton label="Add assessment year" onPress={onAdd} loading={busy} size="sm" iconLeft="add-outline" />
        </View>
      </AppCard>
    </>
  );
}

export function AddDistrictSection({
  districtName,
  busy,
  onDistrictNameChange,
  onAdd,
}: {
  districtName: string;
  busy: boolean;
  onDistrictNameChange: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <>
      <SectionLabel>Add district</SectionLabel>
      <AppCard padded className="mb-4">
        <View style={{ gap: 10 }}>
          <AppInput label="Name" value={districtName} onChangeText={onDistrictNameChange} placeholder="e.g. Agra" />
          <AppButton label="Save district" onPress={onAdd} loading={busy} size="sm" />
        </View>
      </AppCard>
    </>
  );
}

export function AddUlbSection({
  selectedDistrictId,
  ulbCode,
  ulbName,
  ulbPostalCode,
  ulbBodyType,
  districtOptions,
  busy,
  onDistrictChange,
  onUlbCodeChange,
  onUlbNameChange,
  onUlbPostalCodeChange,
  onUlbBodyTypeChange,
  onAdd,
}: {
  selectedDistrictId: string;
  ulbCode: string;
  ulbName: string;
  ulbPostalCode: string;
  ulbBodyType: string;
  districtOptions: { value: string; label: string }[];
  busy: boolean;
  onDistrictChange: (v: string) => void;
  onUlbCodeChange: (v: string) => void;
  onUlbNameChange: (v: string) => void;
  onUlbPostalCodeChange: (v: string) => void;
  onUlbBodyTypeChange: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <>
      <SectionLabel>Add ULB</SectionLabel>
      <AppCard padded className="mb-4">
        <View style={{ gap: 10 }}>
          <AppDropdown
            placeholder="District"
            value={selectedDistrictId}
            options={districtOptions}
            onChange={onDistrictChange}
          />
          <AppInput
            label="ULB code"
            value={ulbCode}
            onChangeText={onUlbCodeChange}
            placeholder="e.g. AGR-MC-001"
            autoCapitalize="characters"
          />
          <AppInput
            label="ULB name"
            value={ulbName}
            onChangeText={onUlbNameChange}
            placeholder="Municipal Council name"
          />
          <AppInput
            label="PIN code (fixed for this ULB)"
            value={ulbPostalCode}
            onChangeText={(v) => onUlbPostalCodeChange(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="e.g. 282001"
            keyboardType="number-pad"
            maxLength={6}
            helperText="Surveyors cannot change this PIN — it is tied to the ULB name"
          />
          <AppDropdown
            placeholder="Body type"
            value={ulbBodyType}
            options={[...BODY_TYPES]}
            onChange={onUlbBodyTypeChange}
          />
          <AppButton label="Save ULB" onPress={onAdd} loading={busy} size="sm" />
        </View>
      </AppCard>
    </>
  );
}

export function AddWardSection({
  wardMunicipalityId,
  wardNo,
  wardCode,
  wardName,
  ulbOptions,
  busy,
  onMunicipalityChange,
  onWardNoChange,
  onWardCodeChange,
  onWardNameChange,
  onAdd,
}: {
  wardMunicipalityId: string;
  wardNo: string;
  wardCode: string;
  wardName: string;
  ulbOptions: { value: string; label: string }[];
  busy: boolean;
  onMunicipalityChange: (v: string) => void;
  onWardNoChange: (v: string) => void;
  onWardCodeChange: (v: string) => void;
  onWardNameChange: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <>
      <SectionLabel>Add ward</SectionLabel>
      <AppCard padded className="mb-4">
        <View style={{ gap: 10 }}>
          <AppDropdown
            placeholder="ULB"
            value={wardMunicipalityId}
            options={ulbOptions}
            onChange={onMunicipalityChange}
          />
          <AppInput label="Ward number" value={wardNo} onChangeText={onWardNoChange} placeholder="e.g. 12" />
          <AppInput
            label="Ward code (optional)"
            value={wardCode}
            onChangeText={onWardCodeChange}
            placeholder="Auto: ULB code + ward no (e.g. AGR-MC-001-W12)"
            autoCapitalize="characters"
          />
          <AppInput label="Ward name" value={wardName} onChangeText={onWardNameChange} placeholder="e.g. Tajganj" />
          <AppButton label="Save ward" onPress={onAdd} loading={busy} size="sm" iconLeft="add-outline" />
        </View>
      </AppCard>
    </>
  );
}

export function DistrictTreeSection({
  tree,
  expandedDistrict,
  onToggleDistrict,
}: {
  tree: TenantTree;
  expandedDistrict: string | null;
  onToggleDistrict: (districtId: Id<'districts'>) => void;
}) {
  return (
    <>
      <SectionLabel>Districts & ULBs</SectionLabel>
      {tree.length === 0 ? (
        <EmptyState icon="map-outline" title="No districts" message="Seed reference data or add a district above." />
      ) : (
        tree.map((d) => {
          const open = expandedDistrict === d._id;
          return (
            <AppCard key={d._id} padded={false} className="mb-2.5 overflow-hidden">
              <Pressable onPress={() => onToggleDistrict(d._id)} className="flex-row items-center px-3.5 py-3">
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
                          {u.code} · {humanizeUlbBodyType(u.bodyType)}
                          {u.postalCode ? ` · PIN ${u.postalCode}` : ' · PIN not set'}
                          {' · '}
                          {u.wards.length} wards
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
    </>
  );
}
