/**
 * Step 2 — Owner & respondent.
 *
 * Each owner row keeps its own mobile fields. New drafts include one empty owner row.
 */
import { AppButton, AppCard, AppDropdown, AppInput, NumberStepper, SectionLabel, Spinner } from '@/components';
import { WizardStepFrame } from '@/components/wizard';
import { api } from '@/convex/_generated/api';
import { altMobileError, primaryMobileError, sanitizeFixedDigits } from '../../../../convex/surveyFieldValidation';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { newOwnerRow, stepCompletion, type WizardDraft, type WizardOwnerRow } from '@/hooks/useWizardDraft';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';

const MOBILE_HELPER = '10 digits (e.g. 9876543210)';

function ownerMobileError(row: WizardOwnerRow): string | undefined {
  return primaryMobileError(row.mobileNo);
}

function ownerAltMobileError(row: WizardOwnerRow): string | undefined {
  return altMobileError(row.altMobileNo, row.mobileNo);
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
          const mobileError = index === 0 ? ownerMobileError(row) : undefined;
          const altError = ownerAltMobileError(row);
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
                  onChangeText={(v) => updateOwner(row.clientOwnerId, { mobileNo: sanitizeFixedDigits(v, 10) })}
                  helperText={mobileError ? undefined : MOBILE_HELPER}
                  errorText={mobileError}
                />
                <AppInput
                  label="Alternative mobile number"
                  keyboardType="number-pad"
                  maxLength={10}
                  value={row.altMobileNo ?? ''}
                  onChangeText={(v) => updateOwner(row.clientOwnerId, { altMobileNo: sanitizeFixedDigits(v, 10) })}
                  helperText={altError ? undefined : MOBILE_HELPER}
                  errorText={altError}
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
  const { convexReady } = useClerkConvexAuth();
  const ownerRules = useQuery(api.ownerRules.respondentRelationships, convexReady ? {} : 'skip');

  if (!localId) return <Spinner label="Loading…" />;
  if (!ownerRules) return <Spinner label="Loading…" />;

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
