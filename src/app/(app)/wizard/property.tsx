/**
 * Step 1 — Property / survey scope (ward + property number).
 *
 * District, ULB, and assessment year are set on the survey start step.
 */
import { AppCard, AppDropdown, AppInput, ChipSelector, SectionLabel, Spinner } from '@/components';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { stepCompletion, type WizardDraft } from '@/hooks/useWizardDraft';
import { WizardStepFrame } from '@/hooks/WizardStepFrame';
import { normalizeMastersBundle } from '@/utils/mastersBundle';
import { useQuery } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';

const convexIdEq = (a?: string | null, b?: string | null) => a != null && b != null && String(a) === String(b);

type WardRow = ReturnType<typeof normalizeMastersBundle>['wards'][number];

function wardsForUlb(wards: WardRow[], ulb: ReturnType<typeof normalizeMastersBundle>['ulbs'][number]) {
  return wards.filter((w) => convexIdEq(w.municipalityId, ulb._id) || w.municipalityCode === ulb.code);
}

export default function StepProperty() {
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const masters = useQuery(api.masters.bundle, {});

  if (!masters || !localId) return <Spinner label="Loading…" />;

  const bundle = normalizeMastersBundle(masters);

  return (
    <WizardStepFrame
      localId={localId}
      activeKey="property"
      title="Survey"
      subtitle="Ward and property identification"
      nextDisabled={(d) => !stepCompletion(d).property}
    >
      {({ draft, update }) => <PropertyFields draft={draft} update={update} masters={bundle} />}
    </WizardStepFrame>
  );
}

function PropertyFields({
  draft,
  update,
  masters,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => Promise<void>;
  masters: ReturnType<typeof normalizeMastersBundle>;
}) {
  const { convexReady } = useClerkConvexAuth();
  const liveWards = useQuery(
    api.masters.wardsForMunicipality,
    convexReady && draft.municipalityId ? { municipalityId: draft.municipalityId as Id<'municipalities'> } : 'skip',
  );

  const selectedUlb = masters.ulbs.find((u) => convexIdEq(u._id, draft.municipalityId));

  const wardsForSelectedUlb = useMemo(() => {
    if (!selectedUlb) return [];
    if (liveWards !== undefined) return liveWards;
    return wardsForUlb(masters.wards, selectedUlb);
  }, [liveWards, masters.wards, selectedUlb]);

  const wardOptions = useMemo(
    () =>
      wardsForSelectedUlb.map((w) => ({
        value: w.wardNo,
        label: `${w.wardCode} · Ward ${w.wardNo} · ${w.name}`,
      })),
    [wardsForSelectedUlb],
  );

  const selectedWard = wardsForSelectedUlb.find((w) => w.wardNo === draft.wardNo);
  const wardLocked = wardOptions.length === 1;

  useEffect(() => {
    if (!draft.municipalityId || liveWards === undefined) return;

    let wardNo = draft.wardNo;
    if (!wardNo && liveWards.length === 1) wardNo = liveWards[0]!.wardNo;
    if (wardNo && !liveWards.some((w) => w.wardNo === wardNo)) wardNo = undefined;

    if (wardNo !== draft.wardNo) void update({ wardNo });
  }, [draft.municipalityId, draft.wardNo, liveWards, update]);

  if (!draft.municipalityId) {
    return (
      <AppCard padded>
        <Text className="text-body text-ink-secondary-light">
          Complete the survey start step (assessment year, district, and ULB) before selecting a ward.
        </Text>
      </AppCard>
    );
  }

  return (
    <>
      <SectionLabel>ULB</SectionLabel>
      <AppCard padded className="mb-3">
        <Text className="text-body font-medium text-ink-primary-light dark:text-ink-primary-dark">
          {selectedUlb?.name ?? '—'}
        </Text>
        <Text className="text-helper text-ink-tertiary-light mt-0.5">
          {selectedUlb?.code} · {selectedUlb?.districtName}
        </Text>
      </AppCard>

      <SectionLabel>Ward</SectionLabel>
      <AppCard padded className="mb-3">
        <View style={{ gap: 8 }}>
          <AppDropdown
            placeholder="Select ward"
            value={draft.wardNo ?? ''}
            options={wardOptions}
            onChange={(v) => update({ wardNo: v })}
            disabled={wardLocked}
          />
          {liveWards === undefined ? (
            <Text className="text-caption text-ink-tertiary-light">Loading wards…</Text>
          ) : null}
          {liveWards !== undefined && wardOptions.length === 0 ? (
            <Text className="text-caption text-ink-tertiary-light">
              No wards for this ULB. An admin must add wards under Tenants → Add ward.
            </Text>
          ) : null}
          {selectedWard ? (
            <Text className="text-helper text-ink-secondary-light">
              Ward {selectedWard.wardNo} ({selectedWard.wardCode}) · {selectedWard.name}
            </Text>
          ) : null}
        </View>
      </AppCard>

      <SectionLabel>Identification</SectionLabel>
      <AppCard padded className="mb-3">
        <AppInput
          label="Property number"
          required
          value={draft.propertyNo ?? ''}
          onChangeText={(v) => update({ propertyNo: v })}
          placeholder="e.g. 12/45/A"
          helperText="Use the official municipal property number from the assessment register"
        />
      </AppCard>

      <SectionLabel>Slum classification</SectionLabel>
      <AppCard padded>
        <ChipSelector
          value={draft.isSlum ? 'yes' : 'no'}
          options={[
            { value: 'no', label: 'Not in slum area' },
            { value: 'yes', label: 'Slum area' },
          ]}
          onChange={(v) => update({ isSlum: v === 'yes' })}
          scroll={false}
        />
      </AppCard>

      {!draft.wardNo || !draft.propertyNo ? (
        <Text className="text-caption text-ink-tertiary-light px-1 mt-3">
          Select a ward and enter the property number to continue.
        </Text>
      ) : null}
    </>
  );
}
