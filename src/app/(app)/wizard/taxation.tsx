/**
 * Step 4 — Taxation parameters (ownership use, property type, road & site).
 */
import { AppCard, AppDropdown, SectionLabel, Spinner } from '@/components';
import { WizardStepFrame } from '@/components/wizard';
import { useMastersBundle } from '@/hooks/use-masters-bundle';
import { stepCompletion } from '@/hooks/useWizardDraft';
import {
  filterActivePropertyUses,
  propertyUseRequiresSubcategory,
  taxationSubcategoryFieldLabel,
} from '@/utils/taxation';
import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

const FIELD_GAP = 16;

export default function StepTaxation() {
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const masters = useMastersBundle();
  if (!masters || !localId) return <Spinner label="Loading…" />;

  return (
    <WizardStepFrame
      localId={localId}
      activeKey="taxation"
      title="Taxation"
      subtitle="Ownership use, property type & road details"
      nextDisabled={(d) => !stepCompletion(d).taxation}
    >
      {({ draft, update }) => {
        const use = draft.propertyUse ?? '';
        const needsSubcategory = propertyUseRequiresSubcategory(use);
        const subcategoryOptions = masters.propertyUseSubcategories?.[use] ?? [];
        const propertyUseOptions = filterActivePropertyUses(masters.propertyUses);

        const onPropertyUseChange = (v: string) => {
          const subs = masters.propertyUseSubcategories?.[v] ?? [];
          const patch: { propertyUse: string; propertyType?: string } = { propertyUse: v };
          if (!propertyUseRequiresSubcategory(v)) {
            patch.propertyType = '';
          } else if (!subs.some((o) => o.value === draft.propertyType)) {
            patch.propertyType = subs.length === 1 ? subs[0]!.value : '';
          }
          void update(patch);
        };

        return (
          <>
            <SectionLabel>Ownership use</SectionLabel>
            <AppCard padded className="mb-4">
              <AppDropdown
                label="Ownership use"
                required
                placeholder="Select ownership use"
                modalTitle="Ownership use"
                value={draft.ownershipType ?? ''}
                options={masters.ownershipTypes}
                onChange={(v) => update({ ownershipType: v })}
              />
            </AppCard>

            <SectionLabel>Property type</SectionLabel>
            <AppCard padded className="mb-4">
              <View style={{ gap: FIELD_GAP }}>
                <AppDropdown
                  label="Property type"
                  required
                  placeholder="Select property type"
                  modalTitle="Property type"
                  value={use}
                  options={propertyUseOptions}
                  onChange={onPropertyUseChange}
                />
                {needsSubcategory ? (
                  <AppDropdown
                    label={taxationSubcategoryFieldLabel(use)}
                    required
                    placeholder="Select type"
                    modalTitle={taxationSubcategoryFieldLabel(use)}
                    value={draft.propertyType ?? ''}
                    options={subcategoryOptions}
                    onChange={(v) => update({ propertyType: v })}
                  />
                ) : null}
              </View>
            </AppCard>

            <SectionLabel>Road & site</SectionLabel>
            <AppCard padded className="mb-4">
              <View style={{ gap: FIELD_GAP }}>
                <AppDropdown
                  label="Situation"
                  required
                  placeholder="Select situation"
                  modalTitle="Situation"
                  value={draft.situation ?? ''}
                  options={masters.situations}
                  onChange={(v) => update({ situation: v })}
                />
                <AppDropdown
                  label="Road type"
                  required
                  placeholder="Select road type"
                  modalTitle="Road type"
                  value={draft.roadType ?? ''}
                  options={masters.roadTypes}
                  onChange={(v) => update({ roadType: v })}
                />
                <AppDropdown
                  label="Road size tax zone"
                  required
                  placeholder="Select road width band"
                  modalTitle="Road size tax zone"
                  value={draft.taxRateZone ?? ''}
                  options={masters.taxRateZones}
                  onChange={(v) => update({ taxRateZone: v })}
                />
              </View>
            </AppCard>

            <Text className="text-helper text-ink-tertiary-light px-1">
              All fields on this step are required before you can continue.
            </Text>
          </>
        );
      }}
    </WizardStepFrame>
  );
}
