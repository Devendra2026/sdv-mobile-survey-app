/**
 * Step 1 — Property / survey scope (ward, parcel, unit).
 *
 * District, ULB, and assessment year are set on the survey start step.
 */
import { AppCard, AppDropdown, AppInput, ChipSelector, SectionLabel, Spinner } from '@/components';
import { WizardStepFrame } from '@/components/wizard';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { formatPropertyId } from '@/convex/propertyId';
import { useConvexReadyQuery } from '@/hooks/use-convex-ready-query';
import { useMastersBundle } from '@/hooks/use-masters-bundle';
import { stepCompletion, type WizardDraft } from '@/hooks/useWizardDraft';
import type { MastersBundle } from '@/utils/mastersBundle';
import { useApplyDraftPatch, wardAutoPatch } from '@/utils/wizard-draft-patch';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';

const convexIdEq = (a?: string | null, b?: string | null) => a != null && b != null && String(a) === String(b);

type WardRow = MastersBundle['wards'][number];

function wardsForUlb(wards: WardRow[], ulb: MastersBundle['ulbs'][number]) {
  return wards.filter((w) => convexIdEq(w.municipalityId, ulb._id) || w.municipalityCode === ulb.code);
}

export default function StepProperty() {
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const bundle = useMastersBundle();

  if (!bundle || !localId) return <Spinner label="Loading…" />;

  return (
    <WizardStepFrame
      localId={localId}
      activeKey="property"
      title="Survey"
      subtitle="Ward, parcel, and unit identification"
      nextDisabled={(d) => !stepCompletion(d).property}
    >
      {({ draft, update }) => <PropertyFields draft={draft} update={update} masters={bundle} localId={localId} />}
    </WizardStepFrame>
  );
}

function PropertyFields({
  draft,
  update,
  masters,
  localId,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => Promise<void>;
  masters: MastersBundle;
  localId: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!stepCompletion(draft).start) {
      router.replace({ pathname: '/(app)/wizard/start', params: { localId } });
    }
  }, [draft, localId, router]);

  const liveWards = useConvexReadyQuery(
    api.masters.wardsForMunicipality,
    draft.municipalityId ? { municipalityId: draft.municipalityId as Id<'municipalities'> } : 'skip',
  );

  const selectedUlb = masters.ulbs.find((u) => convexIdEq(u._id, draft.municipalityId));

  const wardsForSelectedUlb = useMemo(() => {
    if (!selectedUlb) return [];
    if (liveWards !== undefined) return liveWards;
    return wardsForUlb(masters.wards, selectedUlb);
  }, [liveWards, masters.wards, selectedUlb]);

  const wardOptions = useMemo(
    () =>
      wardsForSelectedUlb.map((w: WardRow) => ({
        value: w.wardNo,
        label: `${w.wardCode} · Ward ${w.wardNo} · ${w.name}`,
      })),
    [wardsForSelectedUlb],
  );

  const selectedWard = wardsForSelectedUlb.find((w: WardRow) => w.wardNo === draft.wardNo);
  const wardLocked = wardOptions.length === 1;
  const previewPropertyId = formatPropertyId({
    ulbCode: selectedUlb?.code ?? '',
    wardNo: draft.wardNo ?? '',
    parcelNo: draft.parcelNo ?? '',
    unitNo: draft.unitNo ?? '',
    propertyUse: draft.propertyUse ?? '',
  });

  useApplyDraftPatch(update, wardAutoPatch(draft.municipalityId, draft.wardNo, liveWards));

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
          <AppInput
            label="Sector number"
            value={draft.sectorNo ?? ''}
            onChangeText={(v) => update({ sectorNo: v })}
            placeholder="e.g. 3"
            helperText="Optional — municipal sector within the ward"
          />
        </View>
      </AppCard>

      <SectionLabel>Identification</SectionLabel>
      <AppCard padded className="mb-3" style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <AppInput
              label="Parcel number"
              required
              value={draft.parcelNo ?? ''}
              onChangeText={(v) => update({ parcelNo: v })}
              placeholder="P-1042"
              helperText="Plot / parcel ID"
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppInput
              label="Unit no"
              required
              value={draft.unitNo ?? ''}
              onChangeText={(v) => update({ unitNo: v })}
              placeholder="4A"
            />
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <Text className="text-caption font-medium text-ink-tertiary-light dark:text-ink-tertiary-dark">
            Additional details (optional)
          </Text>
          <AppInput
            label="Old property number"
            value={draft.oldPropertyNo ?? ''}
            onChangeText={(v) => update({ oldPropertyNo: v })}
            placeholder="e.g. 12/45/A"
            iconLeft="document-text-outline"
            helperText="Previous assessment register number"
          />
          <AppInput
            label="Property ID"
            value={previewPropertyId ?? draft.propertyId ?? ''}
            onChangeText={() => {}}
            placeholder="Auto-generated after ward, parcel & property use"
            iconLeft="finger-print-outline"
            helperText="Format: 800828-001-00001-P (ULB–Ward–Parcel–Use)"
            editable={false}
          />
          <AppInput
            label="Constructed year"
            value={draft.constructedYear != null ? String(draft.constructedYear) : ''}
            onChangeText={(v) => {
              const digits = v.replace(/\D/g, '').slice(0, 4);
              update({ constructedYear: digits ? Number(digits) : undefined });
            }}
            placeholder="e.g. 1998"
            keyboardType="number-pad"
            iconLeft="calendar-outline"
            helperText="Year the structure was built"
          />
        </View>
      </AppCard>

      <SectionLabel>Slum classification</SectionLabel>
      <AppCard padded style={{ gap: 8 }}>
        <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark">
          Indicates whether the property falls within a notified slum area.
        </Text>
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

      {!draft.wardNo || !draft.parcelNo?.trim() || !draft.unitNo?.trim() ? (
        <Text className="text-caption text-ink-tertiary-light px-1 mt-3">
          Select a ward and enter parcel number and unit no to continue.
        </Text>
      ) : null}
    </>
  );
}
