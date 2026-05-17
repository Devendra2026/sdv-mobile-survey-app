/**
 * Step 2 — Owner & respondent.
 *
 * Respondent might differ from owner (e.g. owner is out of town; spouse
 * answers the door). We capture both so the audit trail is honest.
 */
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from 'convex/react';
import { AppCard, AppDropdown, AppInput, NumberStepper, SectionLabel, Spinner } from '@/components';
import { WizardStepFrame } from '@/hooks/WizardStepFrame';
import { api } from '@/convex/_generated/api';

export default function StepOwner() {
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const masters = useQuery(api.masters.bundle, {});

  if (!masters || !localId) return <Spinner label="Loading…" />;

  return (
    <WizardStepFrame
      localId={localId}
      activeKey="owner"
      title="Owner details"
      subtitle="Who lives or owns this property?"
    >
      {({ draft, update }) => (
        <>
          <SectionLabel>Owner</SectionLabel>
          <AppCard padded className="mb-3">
            <View style={{ gap: 12 }}>
              <AppInput
                label="Owner name"
                required
                value={draft.ownerName ?? ''}
                onChangeText={(v) => update({ ownerName: v })}
                placeholder="As per municipal records"
              />
              <AppInput
                label="Mobile (10 digits)"
                required
                keyboardType="number-pad"
                maxLength={10}
                value={draft.mobileNo ?? ''}
                onChangeText={(v) => update({ mobileNo: v.replace(/\D/g, '').slice(0, 10) })}
                helperText="Mobile must start with 6, 7, 8 or 9"
              />
            </View>
          </AppCard>

          <SectionLabel>Respondent at door</SectionLabel>
          <AppCard padded className="mb-3">
            <View style={{ gap: 12 }}>
              <AppInput
                label="Respondent name"
                required
                value={draft.respondentName ?? ''}
                onChangeText={(v) => update({ respondentName: v })}
              />
              <AppDropdown
                placeholder="Relationship to owner"
                value={draft.relationship ?? ''}
                options={masters.relationships}
                onChange={(v) => update({ relationship: v })}
              />
            </View>
          </AppCard>

          <SectionLabel>Household size</SectionLabel>
          <AppCard padded>
            <NumberStepper value={draft.familySize ?? 1} onChange={(v) => update({ familySize: v })} min={1} max={30} />
          </AppCard>
        </>
      )}
    </WizardStepFrame>
  );
}
