/**
 * Step 0 — Survey start (assessment year, tenant scope, ward).
 *
 * Surveyors and supervisors pick assessment year, district, and ULB.
 * Ward selection is on the property (survey) step.
 * Values are tenant-filtered server-side.
 */
import { AppCard, AppDropdown, Banner, SectionLabel, Spinner } from '@/components';
import { WizardStepFrame } from '@/components/wizard';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { useMastersBundle } from '@/hooks/use-masters-bundle';
import { stepCompletion, type WizardDraft } from '@/hooks/useWizardDraft';
import { humanizeUlbBodyType } from '@/utils/format';
import type { MastersBundle } from '@/utils/mastersBundle';
import { startTenantAutoPatch, useApplyDraftPatch } from '@/utils/wizard-draft-patch';
import { useQuery } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';

const convexIdEq = (a?: string | null, b?: string | null) => a != null && b != null && String(a) === String(b);

export default function StepSurveyStart() {
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const { convexReady } = useClerkConvexAuth();
  const masters = useMastersBundle();
  const me = useQuery(api.users.currentUser, convexReady ? {} : 'skip');

  if (!masters || !me || !localId) {
    return <Spinner label="Loading survey setup…" />;
  }

  if (masters.districts.length === 0 || masters.ulbs.length === 0) {
    return (
      <View className="flex-1 bg-page-light dark:bg-page-dark p-4 justify-center">
        <Banner
          tone="warning"
          icon="map-outline"
          title="Tenant data not set up"
          message="No districts or ULBs exist yet. An admin must open Tenants → Seed (or Refresh) reference data before surveys can start."
        />
      </View>
    );
  }

  const hasTenantAssignment = Boolean(me.municipalityId || me.districtId);

  return (
    <WizardStepFrame
      localId={localId}
      activeKey="start"
      title="Survey start"
      subtitle="Assessment year, district, and ULB"
      nextDisabled={(d) => !stepCompletion(d).start}
    >
      {({ draft, update }) => (
        <>
          {!hasTenantAssignment && (me.role === 'surveyor' || me.role === 'supervisor') ? (
            <Banner
              tone="warning"
              icon="alert-circle-outline"
              title="No district / ULB assigned"
              message="Ask an admin to open Users → tap your name → assign district and ULB. You can still pick from the list below if tenant data exists."
              className="mb-3"
            />
          ) : null}
          <StartFields draft={draft} update={update} masters={masters} me={me} />
        </>
      )}
    </WizardStepFrame>
  );
}

function StartFields({
  draft,
  update,
  masters,
  me,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => Promise<void>;
  masters: MastersBundle;
  me: NonNullable<ReturnType<typeof useQuery<typeof api.users.currentUser>>>;
}) {
  const districtOptions = masters.districts.map((d) => ({
    value: d._id,
    label: `${d.name} (${d.stateName})`,
  }));

  const selectedDistrict = useMemo(
    () => masters.districts.find((d) => convexIdEq(d._id, draft.districtId)),
    [draft.districtId, masters.districts],
  );

  const ulbsInDistrict = useMemo(() => {
    if (!selectedDistrict) return [];
    return masters.ulbs.filter(
      (u) => convexIdEq(u.districtId, selectedDistrict._id) || u.districtCode === selectedDistrict.code,
    );
  }, [masters.ulbs, selectedDistrict]);

  useApplyDraftPatch(update, startTenantAutoPatch(draft, masters, me));

  const ulbNameOptions = ulbsInDistrict.map((u) => ({
    value: u._id,
    label: `${u.name} · ${humanizeUlbBodyType(u.bodyType)}`,
  }));

  const ulbCodeOptions = ulbsInDistrict.map((u) => ({
    value: u._id,
    label: u.code,
  }));

  const selectedUlb = masters.ulbs.find((u) => convexIdEq(u._id, draft.municipalityId));

  const hasAssignedUlb = Boolean(me.municipalityId);
  const districtLocked = hasAssignedUlb || districtOptions.length === 1;
  const ulbLocked = hasAssignedUlb || (ulbNameOptions.length === 1 && !!draft.districtId);

  const onDistrictChange = (districtId: string) => {
    void update({
      districtId: districtId as Id<'districts'>,
      municipalityId: undefined,
      wardNo: undefined,
    });
  };

  const onUlbChange = (municipalityId: string) => {
    const ulb = masters.ulbs.find((u) => u._id === municipalityId);
    void update({
      municipalityId: municipalityId as Id<'municipalities'>,
      districtId: ulb?.districtId ?? draft.districtId,
      wardNo: undefined,
      ulbPostalCode: ulb?.postalCode ?? undefined,
    });
  };

  return (
    <>
      <SectionLabel>Assessment</SectionLabel>
      <AppCard padded className="mb-3">
        <AppDropdown
          placeholder="Assessment year"
          value={draft.assessmentYear ?? ''}
          options={masters.assessmentYears}
          onChange={(v) => update({ assessmentYear: v })}
        />
      </AppCard>

      <SectionLabel>Location (tenant)</SectionLabel>
      <AppCard padded className="mb-3">
        <View style={{ gap: 12 }}>
          <AppDropdown
            placeholder="District"
            value={(draft.districtId ?? '') as string}
            options={districtOptions}
            onChange={onDistrictChange}
            disabled={districtLocked}
          />
          <AppDropdown
            placeholder="ULB name"
            value={(draft.municipalityId ?? '') as string}
            options={ulbNameOptions}
            onChange={onUlbChange}
            disabled={!selectedDistrict || ulbLocked}
          />
          <AppDropdown
            placeholder="ULB code"
            value={(draft.municipalityId ?? '') as string}
            options={ulbCodeOptions}
            onChange={onUlbChange}
            disabled={!selectedDistrict || ulbLocked}
          />
          {selectedDistrict && ulbNameOptions.length === 0 ? (
            <Text className="text-caption text-ink-tertiary-light">
              No ULBs for this district. Ask an admin to refresh tenant data under Tenants.
            </Text>
          ) : null}
        </View>
      </AppCard>

      {selectedUlb ? (
        <AppCard padded className="mb-3 bg-brand-soft/30">
          <Text className="text-caption text-ink-tertiary-light">Selected scope</Text>
          <Text className="text-body font-medium text-ink-primary-light dark:text-ink-primary-dark mt-1">
            {selectedUlb.name}
          </Text>
          <Text className="text-helper text-ink-secondary-light mt-0.5">
            {selectedUlb.code} · {humanizeUlbBodyType(selectedUlb.bodyType)} · {selectedUlb.districtName}
          </Text>
          <Text className="text-helper text-ink-tertiary-light mt-1">Ward is selected on the next step.</Text>
        </AppCard>
      ) : null}

      {!draft.assessmentYear || !draft.districtId || !draft.municipalityId ? (
        <Text className="text-caption text-ink-tertiary-light px-1">
          Select assessment year, district, and ULB to continue to the survey form.
        </Text>
      ) : null}
    </>
  );
}
