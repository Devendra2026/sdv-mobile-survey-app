/**
 * Step 2 — Owner & respondent.
 *
 * Each owner row keeps its own mobile fields. Owners are persisted on mount
 * so "Add another owner" does not reset contact details.
 */
import { AppButton, AppCard, AppDropdown, AppInput, NumberStepper, SectionLabel, Spinner } from '@/components';
import { api } from '@/convex/_generated/api';
import { isRespondentOwner, isValidIndianOwnerMobile } from '@/convex/ownerMobile';
import { WizardStepFrame } from '@/hooks/WizardStepFrame';
import { newOwnerRow, stepCompletion, type WizardDraft, type WizardOwnerRow } from '@/hooks/useWizardDraft';
import { isValidIndianMobile, sanitizeMobileDigits } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

const MOBILE_HELPER = '10 digits, starting with 6, 7, 8 or 9';

function ownerMobileError(row: WizardOwnerRow, requirePrimary: boolean, relationship?: string): string | undefined {
  const value = row.mobileNo?.trim();
  if (!value) {
    return requirePrimary && isRespondentOwner(relationship) ? 'Mobile number is required' : undefined;
  }
  if (value.length < 10) return 'Enter all 10 digits';
  if (isValidIndianOwnerMobile(value)) return undefined;
  return MOBILE_HELPER;
}

function ownerAltMobileError(row: WizardOwnerRow): string | undefined {
  const alt = row.altMobileNo?.trim();
  if (!alt) return undefined;
  if (alt.length < 10) return 'Enter all 10 digits';
  if (!isValidIndianMobile(alt)) return MOBILE_HELPER;
  if (row.mobileNo && isValidIndianMobile(row.mobileNo) && alt === row.mobileNo) {
    return 'Must differ from primary mobile';
  }
  return undefined;
}

function OwnerStepBody({
  draft,
  update,
  ownerRules,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => Promise<void>;
  ownerRules: { options: { value: string; label: string }[]; maxOwners: number };
}) {
  const owners = draft.owners ?? [];
  const maxOwners = ownerRules.maxOwners;

  useEffect(() => {
    if (!draft.owners?.length) {
      void update({ owners: [newOwnerRow()] });
    }
  }, [draft.owners?.length, update]);

  if (!owners.length) {
    return <Spinner label="Preparing owner form…" />;
  }

  const setOwners = (next: WizardOwnerRow[]) => update({ owners: next });

  const updateOwner = (id: string, patch: Partial<WizardOwnerRow>) => {
    setOwners(owners.map((o) => (o.clientOwnerId === id ? { ...o, ...patch } : o)));
  };

  const addOwner = () => {
    if (owners.length >= maxOwners) return;
    setOwners([...owners, newOwnerRow()]);
  };

  const removeOwner = (id: string) => {
    if (owners.length <= 1) {
      setOwners([newOwnerRow()]);
      return;
    }
    Alert.alert('Remove this owner?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setOwners(owners.filter((o) => o.clientOwnerId !== id)),
      },
    ]);
  };

  return (
    <>
      <SectionLabel>Respondent</SectionLabel>
      <AppCard padded className="mb-3">
        <View style={{ gap: 12 }}>
          <AppInput
            label="Name of respondent"
            value={draft.respondentName ?? ''}
            onChangeText={(v) => update({ respondentName: v })}
            placeholder="Person met at the door"
          />
          <AppDropdown
            placeholder="Respondent relationship with owner"
            value={draft.relationship ?? ''}
            options={ownerRules.options}
            onChange={(v) => update({ relationship: v })}
          />
        </View>
      </AppCard>

      <SectionLabel>Owners</SectionLabel>
      <View style={{ gap: 8 }} className="mb-3">
        {owners.map((row, index) => {
          const mobileError = ownerMobileError(row, index === 0, draft.relationship);
          const altError = ownerAltMobileError(row);
          const mobileHelper = mobileError ?? MOBILE_HELPER;
          return (
            <AppCard key={row.clientOwnerId} padded>
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-label uppercase tracking-wider font-medium text-ink-secondary-light dark:text-ink-secondary-dark">
                  Owner {index + 1}
                </Text>
                {owners.length > 1 ? (
                  <Pressable onPress={() => removeOwner(row.clientOwnerId)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </Pressable>
                ) : null}
              </View>
              <View style={{ gap: 12 }}>
                <AppInput
                  label="Owner name"
                  value={row.name ?? ''}
                  onChangeText={(v) => updateOwner(row.clientOwnerId, { name: v })}
                  placeholder="As per municipal records"
                />
                <AppInput
                  label="Father name / husband name"
                  value={row.fatherOrHusbandName ?? ''}
                  onChangeText={(v) => updateOwner(row.clientOwnerId, { fatherOrHusbandName: v })}
                />
                <AppInput
                  label="Mobile number"
                  required={index === 0}
                  keyboardType="number-pad"
                  maxLength={10}
                  value={row.mobileNo ?? ''}
                  onChangeText={(v) => updateOwner(row.clientOwnerId, { mobileNo: sanitizeMobileDigits(v) })}
                  helperText={mobileHelper}
                />
                <AppInput
                  label="Alternative mobile number"
                  keyboardType="number-pad"
                  maxLength={10}
                  value={row.altMobileNo ?? ''}
                  onChangeText={(v) => updateOwner(row.clientOwnerId, { altMobileNo: sanitizeMobileDigits(v) })}
                  helperText={altError ?? MOBILE_HELPER}
                  placeholder="Optional"
                />
              </View>
            </AppCard>
          );
        })}
      </View>
      {owners.length < maxOwners ? (
        <AppButton
          label="Add another owner"
          variant="outline"
          iconLeft="add-circle-outline"
          onPress={addOwner}
          fullWidth
          className="mb-3"
        />
      ) : null}

      <SectionLabel>Household</SectionLabel>
      <AppCard padded>
        <NumberStepper
          label="Number of family members (optional)"
          value={draft.familySize ?? 0}
          min={0}
          max={99}
          onChange={(v) => update({ familySize: v > 0 ? v : undefined })}
        />
        {draft.familySize == null || draft.familySize === 0 ? (
          <Text className="text-caption text-ink-tertiary-light dark:text-ink-tertiary-dark mt-2">
            Use + to set family size, or leave at 0 if unknown
          </Text>
        ) : null}
      </AppCard>
    </>
  );
}

export default function StepOwner() {
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const ownerRules = useQuery(api.ownerRules.respondentRelationships, {});

  if (!ownerRules || !localId) return <Spinner label="Loading…" />;

  return (
    <WizardStepFrame
      localId={localId}
      activeKey="owner"
      title="Owner details"
      subtitle="Who lives or owns this property?"
      nextDisabled={(d) => !stepCompletion(d).owner}
    >
      {({ draft, update }) => <OwnerStepBody draft={draft} update={update} ownerRules={ownerRules} />}
    </WizardStepFrame>
  );
}
