/**
 * Step 6 — Municipal services. Three required dropdowns + optional
 * electricity meter number.
 */
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from 'convex/react';
import { AppCard, AppDropdown, AppInput, SectionLabel, Spinner } from '@/components';
import { WizardStepFrame } from '@/hooks/WizardStepFrame';
import { api } from '@/convex/_generated/api';

export default function StepServices() {
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const masters = useQuery(api.masters.bundle, {});
  if (!masters || !localId) return <Spinner label="Loading…" />;

  return (
    <WizardStepFrame
      localId={localId}
      activeKey="services"
      title="Municipal services"
      subtitle="Connections to civic services"
    >
      {({ draft, update }) => (
        <>
          <SectionLabel>Connections</SectionLabel>
          <AppCard padded className="mb-3">
            <View style={{ gap: 12 }}>
              <AppDropdown
                placeholder="Water source"
                value={draft.waterSource ?? ''}
                options={masters.waterSources}
                onChange={(v) => update({ waterSource: v })}
              />
              <AppDropdown
                placeholder="Sanitation"
                value={draft.sanitationType ?? ''}
                options={masters.sanitationTypes}
                onChange={(v) => update({ sanitationType: v })}
              />
              <AppDropdown
                placeholder="Solid waste"
                value={draft.solidWasteType ?? ''}
                options={masters.solidWasteTypes}
                onChange={(v) => update({ solidWasteType: v })}
              />
            </View>
          </AppCard>

          <SectionLabel>Electricity</SectionLabel>
          <AppCard padded>
            <AppInput
              label="Electricity meter number"
              value={draft.electricityNo ?? ''}
              onChangeText={(v) => update({ electricityNo: v })}
              placeholder="Optional"
              helperText="From the utility bill or meter face"
            />
          </AppCard>
        </>
      )}
    </WizardStepFrame>
  );
}
