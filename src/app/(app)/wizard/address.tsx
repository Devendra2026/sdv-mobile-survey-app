/**
 * Step 3 — Postal address. District/city from tenant; PIN fixed per ULB.
 */
import { AppCard, AppInput, ListRow, SectionLabel, Spinner } from '@/components';
import { WizardStepFrame } from '@/components/wizard';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useMastersBundle } from '@/hooks/use-masters-bundle';
import { stepCompletion, type WizardDraft } from '@/hooks/useWizardDraft';
import { addressAutoPatch, useApplyDraftPatch } from '@/utils/wizard-draft-patch';
import { useQuery } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

const convexIdEq = (a?: string | null, b?: string | null) => a != null && b != null && String(a) === String(b);

export default function StepAddress() {
  const { localId } = useLocalSearchParams<{ localId: string }>();
  if (!localId) return <Spinner label="Loading…" />;

  return (
    <WizardStepFrame
      localId={localId}
      activeKey="address"
      title="Address"
      subtitle="Postal details for tax notices"
      nextDisabled={(d) => !stepCompletion(d).address}
    >
      {({ draft, update }) => <AddressFields draft={draft} update={update} />}
    </WizardStepFrame>
  );
}

function AddressFields({
  draft,
  update,
}: {
  draft: {
    municipalityId?: Id<'municipalities'>;
    districtId?: Id<'districts'>;
    houseNo?: string;
    locality?: string;
    colonyName?: string;
    city?: string;
    pinCode?: string;
  };
  update: (patch: Partial<WizardDraft>) => Promise<void>;
}) {
  const masters = useMastersBundle();
  const addressCtx = useQuery(
    api.addressRules.contextForMunicipality,
    draft.municipalityId ? { municipalityId: draft.municipalityId } : 'skip',
  );

  const selectedUlb = masters?.ulbs.find((u) => convexIdEq(u._id, draft.municipalityId));
  const districtName =
    addressCtx?.districtName ??
    masters?.districts.find((d) => convexIdEq(d._id, draft.districtId))?.name ??
    selectedUlb?.districtName ??
    '—';
  const cityName = addressCtx?.cityName ?? selectedUlb?.name ?? '—';
  const fixedPin = addressCtx?.configuredPostalCode ?? selectedUlb?.postalCode ?? null;

  useApplyDraftPatch(update, addressAutoPatch(draft, cityName, fixedPin));

  if (draft.municipalityId && addressCtx === undefined) {
    return <Spinner label="Loading address…" />;
  }

  if (!draft.municipalityId) {
    return (
      <AppCard padded>
        <ListRow
          icon="information-circle-outline"
          iconTone="warning"
          title="Complete survey start first"
          subtitle="Pick district and ULB before entering the address."
          showChevron={false}
        />
      </AppCard>
    );
  }

  return (
    <>
      <SectionLabel>Tenant (from survey start)</SectionLabel>
      <AppCard padded className="mb-3">
        <View style={{ gap: 8 }}>
          <ListRow icon="map-outline" iconTone="neutral" title="District" subtitle={districtName} showChevron={false} />
          <ListRow
            icon="business-outline"
            iconTone="neutral"
            title="City / Town (ULB)"
            subtitle={cityName}
            showChevron={false}
          />
        </View>
      </AppCard>

      <SectionLabel>Street address</SectionLabel>
      <AppCard padded className="mb-3">
        <View style={{ gap: 12 }}>
          <AppInput
            label="House number"
            value={draft.houseNo ?? ''}
            onChangeText={(v) => update({ houseNo: v })}
            placeholder="Optional, e.g. 12/A"
          />
          <AppInput
            label="Locality name"
            required
            value={draft.locality ?? ''}
            onChangeText={(v) => update({ locality: v })}
            placeholder="e.g. Civil Lines"
          />
          <AppInput
            label="Colony name"
            required
            value={draft.colonyName ?? ''}
            onChangeText={(v) => update({ colonyName: v })}
            placeholder="e.g. Railway Colony"
          />
        </View>
      </AppCard>

      <SectionLabel>PIN code</SectionLabel>
      <AppCard padded>
        {fixedPin ? (
          <ListRow
            icon="mail-outline"
            iconTone="neutral"
            title="PIN code"
            subtitle={`${fixedPin} · fixed for this ULB by your admin`}
            showChevron={false}
          />
        ) : (
          <AppInput
            label="PIN code (6 digits)"
            required
            keyboardType="number-pad"
            maxLength={6}
            value={draft.pinCode ?? ''}
            onChangeText={(v) => update({ pinCode: v.replace(/\D/g, '').slice(0, 6) })}
            helperText="Admin has not set a ULB PIN yet — contact support if this persists"
          />
        )}
      </AppCard>
    </>
  );
}
