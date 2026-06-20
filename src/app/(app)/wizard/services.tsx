/**
 * Step 6 — Municipal services: water supply, sanitation, solid waste.
 */
import { AppCard, AppDropdown, ChipSelector, SectionLabel, Spinner } from '@/components';
import { WizardStepFrame } from '@/components/wizard';
import { useMastersBundle } from '@/hooks/use-masters-bundle';
import { servicesStepComplete } from '@/utils/services';
import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

const FIELD_GAP = 16;

const YES_NO_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;

function yesNoChipValue(value: boolean | undefined): string {
  if (value === undefined) return '';
  return value ? 'yes' : 'no';
}

function YesNoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text className="text-label uppercase tracking-wider font-medium text-ink-secondary-light dark:text-ink-secondary-dark">
        {label} <Text className="text-danger">*</Text>
      </Text>
      <ChipSelector
        value={yesNoChipValue(value)}
        options={[...YES_NO_OPTIONS]}
        onChange={(v) => onChange(v === 'yes')}
        scroll={false}
      />
    </View>
  );
}

export default function StepServices() {
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const masters = useMastersBundle();
  if (!masters || !localId) return <Spinner label="Loading…" />;

  return (
    <WizardStepFrame
      localId={localId}
      activeKey="services"
      title="Municipal services"
      subtitle="Water, sanitation & waste"
      nextDisabled={(d) => !servicesStepComplete(d)}
    >
      {({ draft, update }) => (
        <>
          <SectionLabel>Water supply</SectionLabel>
          <AppCard padded className="mb-4">
            <View style={{ gap: FIELD_GAP }}>
              <YesNoField
                label="Municipal / Town Panchayat water connection"
                value={draft.municipalWaterConnection}
                onChange={(v) => update({ municipalWaterConnection: v })}
              />
              <AppDropdown
                label="Source of water"
                required
                placeholder="Select source"
                modalTitle="Source of water"
                value={draft.waterSource ?? ''}
                options={masters.waterSources}
                onChange={(v) => update({ waterSource: v })}
              />
            </View>
          </AppCard>

          <SectionLabel>Sanitation</SectionLabel>
          <AppCard padded className="mb-4">
            <AppDropdown
              label="Sanitation"
              required
              placeholder="Select sanitation type"
              modalTitle="Sanitation"
              value={draft.sanitationType ?? ''}
              options={masters.sanitationTypes}
              onChange={(v) => update({ sanitationType: v })}
            />
          </AppCard>

          <SectionLabel>Solid waste management</SectionLabel>
          <AppCard padded className="mb-4">
            <YesNoField
              label="Municipal / Town Panchayat door-to-door collection"
              value={draft.municipalWasteCollection}
              onChange={(v) => update({ municipalWasteCollection: v })}
            />
          </AppCard>

          <Text className="text-helper text-ink-tertiary-light px-1">
            All fields on this step are required before you can continue.
          </Text>
        </>
      )}
    </WizardStepFrame>
  );
}
