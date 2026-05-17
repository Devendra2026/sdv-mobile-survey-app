/**
 * Step 4 — Taxation parameters.
 *
 * Cross-validates plinth ≤ plot inline; the same rule lives server-side in
 * `surveys.upsert`, but catching it here gives the surveyor instant feedback
 * before they leave the screen.
 */
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from 'convex/react';
import { AppCard, AppDropdown, AppInput, SectionLabel, Spinner } from '@/components';
import { WizardStepFrame } from '@/hooks/WizardStepFrame';
import { api } from '@/convex/_generated/api';

export default function StepTaxation() {
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const masters = useQuery(api.masters.bundle, {});
  if (!masters || !localId) return <Spinner label="Loading…" />;

  return (
    <WizardStepFrame localId={localId} activeKey="taxation" title="Taxation" subtitle="Classification & area">
      {({ draft, update }) => {
        const plot = draft.plotSqft ?? 0;
        const plinth = draft.plinthSqft ?? 0;
        const plinthError = plot > 0 && plinth > 0 && plinth > plot ? 'Plinth area cannot exceed plot area' : undefined;

        return (
          <>
            <SectionLabel>Year & ownership</SectionLabel>
            <AppCard padded className="mb-3">
              <View style={{ gap: 12 }}>
                <AppDropdown
                  placeholder="Assessment year"
                  value={draft.assessmentYear ?? ''}
                  options={masters.assessmentYears}
                  onChange={(v) => update({ assessmentYear: v })}
                />
                <AppDropdown
                  placeholder="Ownership type"
                  value={draft.ownershipType ?? ''}
                  options={masters.ownershipTypes}
                  onChange={(v) => update({ ownershipType: v })}
                />
              </View>
            </AppCard>

            <SectionLabel>Property classification</SectionLabel>
            <AppCard padded className="mb-3">
              <View style={{ gap: 12 }}>
                <AppDropdown
                  placeholder="Property type"
                  value={draft.propertyType ?? ''}
                  options={masters.propertyTypes}
                  onChange={(v) => update({ propertyType: v })}
                />
                <AppDropdown
                  placeholder="Property use"
                  value={draft.propertyUse ?? ''}
                  options={masters.propertyUses}
                  onChange={(v) => update({ propertyUse: v })}
                />
                <AppDropdown
                  placeholder="Situation"
                  value={draft.situation ?? ''}
                  options={masters.situations}
                  onChange={(v) => update({ situation: v })}
                />
                <AppDropdown
                  placeholder="Road type"
                  value={draft.roadType ?? ''}
                  options={masters.roadTypes}
                  onChange={(v) => update({ roadType: v })}
                />
                <AppDropdown
                  placeholder="Tax rate zone"
                  value={draft.taxRateZone ?? ''}
                  options={masters.taxRateZones}
                  onChange={(v) => update({ taxRateZone: v })}
                />
              </View>
            </AppCard>

            <SectionLabel>Area (sq ft)</SectionLabel>
            <AppCard padded>
              <View className="flex-row" style={{ gap: 8 }}>
                <View className="flex-1">
                  <AppInput
                    label="Plot area"
                    keyboardType="decimal-pad"
                    value={draft.plotSqft != null ? String(draft.plotSqft) : ''}
                    onChangeText={(v) => update({ plotSqft: v ? parseFloat(v) : undefined })}
                  />
                </View>
                <View className="flex-1">
                  <AppInput
                    label="Plinth area"
                    keyboardType="decimal-pad"
                    value={draft.plinthSqft != null ? String(draft.plinthSqft) : ''}
                    onChangeText={(v) => update({ plinthSqft: v ? parseFloat(v) : undefined })}
                    errorText={plinthError}
                  />
                </View>
              </View>
            </AppCard>
          </>
        );
      }}
    </WizardStepFrame>
  );
}
