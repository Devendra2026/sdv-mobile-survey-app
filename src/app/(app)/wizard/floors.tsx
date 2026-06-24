/**
 * Step 5 — Area: plot area, plinth (ground floor), floor rows, total built-up.
 */
import { AppButton, AppCard, AppDropdown, AreaPairField, SectionLabel, Spinner } from '@/components';
import { WizardStepFrame } from '@/components/wizard';
import { useMastersBundle } from '@/hooks/use-masters-bundle';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import { builtUpSqftFromFloors, openLandSqftFromFloors, plinthSqftFromFloors } from '@/utils/area';
import { usageTypeToOccupied } from '@/utils/floorRow';
import { formatArea, humanizeRole } from '@/utils/format';
import type { MastersBundle } from '@/utils/mastersBundle';
import { wizardScrollViewProps } from '@/utils/scroll-props';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Floor = NonNullable<WizardDraft['floors']>[number];
type Masters = MastersBundle;

const FIELD_GAP = 16;

function newFloorId() {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function labelFor(options: { value: string; label: string }[], value: string) {
  return options.find((o) => o.value === value)?.label ?? humanizeRole(value);
}

function floorRowComplete(f: Floor): boolean {
  return !!(f.floorName && f.areaSqft > 0 && f.usageFactor && f.usageType && f.constructionType);
}

function areaStepComplete(d: WizardDraft): boolean {
  const plotOk = (d.plotSqft ?? 0) > 0;
  const floors = d.floors ?? [];
  return plotOk && floors.length > 0 && floors.every(floorRowComplete);
}

function withSyncedPlinth(floors: Floor[]): Partial<WizardDraft> {
  return { floors, plinthSqft: plinthSqftFromFloors(floors) };
}

export default function StepAreaDetail() {
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Floor | null>(null);

  const masters = useMastersBundle();

  if (!masters || !localId) return <Spinner label="Loading…" />;

  const openNewBuiltUpFloor = () => {
    setEditing({
      clientFloorId: newFloorId(),
      floorName: '',
      usageFactor: '',
      usageType: '',
      constructionType: '',
      isOccupied: true,
      areaSqft: 0,
    });
    setEditorOpen(true);
  };

  const openNewOpenLand = () => {
    setEditing({
      clientFloorId: newFloorId(),
      floorName: 'open_land',
      usageFactor: '',
      usageType: '',
      constructionType: 'open_land_plot',
      isOccupied: true,
      areaSqft: 0,
    });
    setEditorOpen(true);
  };

  const openEditFloor = (f: Floor) => {
    setEditing(f);
    setEditorOpen(true);
  };

  return (
    <WizardStepFrame
      localId={localId}
      activeKey="floors"
      title="Area"
      subtitle="Plot, plinth and built-up areas"
      nextDisabled={(draft) => !areaStepComplete(draft)}
    >
      {({ draft, update }) => {
        const floors = draft.floors ?? [];
        const plinthSqft = plinthSqftFromFloors(floors);
        const builtUpSqft = builtUpSqftFromFloors(floors);
        const openLandSqft = openLandSqftFromFloors(floors);
        const builtUpFloors = floors.filter((f) => f.floorName !== 'open_land');
        const openLandFloors = floors.filter((f) => f.floorName === 'open_land');

        const saveFloor = async (f: Floor) => {
          const existing = floors.findIndex((x) => x.clientFloorId === f.clientFloorId);
          const next = [...floors];
          const row: Floor = {
            ...f,
            isOccupied: usageTypeToOccupied(f.usageType),
          };
          if (existing >= 0) next[existing] = row;
          else next.push(row);
          await update(withSyncedPlinth(next));
          setEditorOpen(false);
          setEditing(null);
        };

        const removeFloor = (id: string) => {
          Alert.alert('Remove floor?', 'This floor row will be deleted.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: () => {
                const next = floors.filter((f) => f.clientFloorId !== id);
                void update(withSyncedPlinth(next));
              },
            },
          ]);
        };

        const resetAreaDetail = () => {
          Alert.alert('Reset area details?', 'Plot area, floor rows, plinth and built-up will be cleared.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Reset',
              style: 'destructive',
              onPress: () => {
                void update({ plotSqft: 0, plinthSqft: 0, floors: [] });
                setEditorOpen(false);
                setEditing(null);
              },
            },
          ]);
        };

        return (
          <>
            <View className="flex-row justify-end mb-2">
              <AppButton
                label="Reset"
                variant="outline"
                size="sm"
                iconLeft="refresh-outline"
                onPress={resetAreaDetail}
              />
            </View>

            <SectionLabel>Plot area</SectionLabel>
            <AppCard padded className="mb-4">
              <AreaPairField
                label="Plot Area"
                required
                sqft={draft.plotSqft ?? 0}
                onSqftChange={(v) => void update({ plotSqft: v })}
                helperText="Total plot size on ground"
              />
            </AppCard>

            <SectionLabel>Plinth area</SectionLabel>
            <AppCard padded className="mb-4">
              <AreaPairField
                label="Plinth Area"
                sqft={plinthSqft}
                onSqftChange={() => {}}
                readOnly
                helperText={
                  plinthSqft > 0 ? 'Calculated from ground floor row' : 'Add a ground floor row to set plinth area'
                }
              />
            </AppCard>

            <View className="flex-row items-center justify-between mb-2 mt-1">
              <SectionLabel>Built-up floors</SectionLabel>
              <Pressable
                onPress={openNewBuiltUpFloor}
                accessibilityLabel="Add built-up floor"
                className="w-11 h-11 rounded-full bg-brand items-center justify-center active:opacity-90"
              >
                <Ionicons name="add" size={24} color="#FFFFFF" />
              </Pressable>
            </View>
            <Text className="text-helper text-ink-tertiary-light mb-3 px-1 leading-5">
              Ground floor, first floor, and other constructed levels. Tap a row to edit; long press to delete.
            </Text>

            <AppCard padded={false} className="mb-4 overflow-hidden">
              {builtUpFloors.length === 0 ? (
                <Text className="text-helper text-ink-tertiary-light text-center py-8 px-4 leading-5">
                  Tap + to add a built-up floor row.
                </Text>
              ) : (
                builtUpFloors.map((f, index) => (
                  <Pressable
                    key={f.clientFloorId}
                    onPress={() => openEditFloor(f)}
                    onLongPress={() => removeFloor(f.clientFloorId)}
                    delayLongPress={400}
                    className={[
                      'px-4 py-3.5 active:bg-page-light dark:active:bg-page-dark',
                      index < builtUpFloors.length - 1 ? 'border-b border-line-subtle' : '',
                    ].join(' ')}
                  >
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1 min-w-0">
                        <Text
                          className="text-body font-medium text-ink-primary-light dark:text-ink-primary-dark leading-5"
                          numberOfLines={2}
                        >
                          {f.floorName ? labelFor(masters.floors, f.floorName) : '—'}
                        </Text>
                        {f.usageFactor || f.usageType || f.constructionType ? (
                          <Text className="text-helper text-ink-secondary-light mt-1 leading-5" numberOfLines={3}>
                            {[
                              labelFor(masters.usageFactors, f.usageFactor),
                              labelFor(masters.usageTypes, f.usageType),
                              labelFor(masters.constructionTypes, f.constructionType),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        ) : null}
                      </View>
                      <Text className="text-body font-medium text-brand shrink-0">
                        {f.areaSqft > 0 ? formatArea(f.areaSqft) : '—'}
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </AppCard>

            <SectionLabel>Total built-up area</SectionLabel>
            <AppCard padded className="mb-4 border-brand/25 bg-brand-soft/30">
              <AreaPairField
                label="Total Built-up Area"
                sqft={builtUpSqft}
                onSqftChange={() => {}}
                readOnly
                helperText="Sum of built-up floor rows only (excludes open land)"
              />
            </AppCard>

            <View className="flex-row items-center justify-between mb-2 mt-1">
              <SectionLabel>Open land area</SectionLabel>
              <Pressable
                onPress={openNewOpenLand}
                accessibilityLabel="Add open land row"
                className="w-11 h-11 rounded-full border-2 border-brand bg-surface-light dark:bg-surface-dark items-center justify-center active:opacity-90"
              >
                <Ionicons name="add" size={24} color="#2563EB" />
              </Pressable>
            </View>
            <Text className="text-helper text-ink-tertiary-light mb-3 px-1 leading-5">
              Vacant or undeveloped plot area — kept separate from built-up floors.
            </Text>

            <AppCard padded={false} className="mb-4 overflow-hidden">
              {openLandFloors.length === 0 ? (
                <Text className="text-helper text-ink-tertiary-light text-center py-6 px-4 leading-5">
                  Add an open land row if part of the plot is vacant.
                </Text>
              ) : (
                openLandFloors.map((f, index) => (
                  <Pressable
                    key={f.clientFloorId}
                    onPress={() => openEditFloor(f)}
                    onLongPress={() => removeFloor(f.clientFloorId)}
                    delayLongPress={400}
                    className={[
                      'px-4 py-3.5 active:bg-page-light dark:active:bg-page-dark',
                      index < openLandFloors.length - 1 ? 'border-b border-line-subtle' : '',
                    ].join(' ')}
                  >
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1 min-w-0">
                        <Text className="text-body font-medium text-ink-primary-light dark:text-ink-primary-dark leading-5">
                          {labelFor(masters.floors, f.floorName)}
                        </Text>
                      </View>
                      <Text className="text-body font-medium text-brand shrink-0">
                        {f.areaSqft > 0 ? formatArea(f.areaSqft) : '—'}
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </AppCard>

            <SectionLabel>Total open land area</SectionLabel>
            <AppCard padded className="mb-2 bg-page-light dark:bg-page-dark border-line-default">
              <AreaPairField
                label="Total Open Land Area"
                sqft={openLandSqft}
                onSqftChange={() => {}}
                readOnly
                helperText="Sum of open land rows only"
              />
            </AppCard>

            {editing ? (
              <FloorEditorModal
                masters={masters}
                value={editing}
                open={editorOpen}
                onChange={setEditing}
                onClose={() => {
                  setEditorOpen(false);
                  setEditing(null);
                }}
                onSave={saveFloor}
              />
            ) : null}
          </>
        );
      }}
    </WizardStepFrame>
  );
}

interface FloorEditorModalProps {
  masters: Masters;
  value: Floor;
  open: boolean;
  onChange: (f: Floor) => void;
  onClose: () => void;
  onSave: (f: Floor) => void;
}

function FloorEditorModal({ masters, value, open, onChange, onClose, onSave }: FloorEditorModalProps) {
  const insets = useSafeAreaInsets();

  const canSave = floorRowComplete(value);
  const isEdit = value.areaSqft > 0 && value.floorName;

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      <View className="flex-1 justify-end">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="bg-black/45"
        />
        <View
          className="bg-surface-light dark:bg-surface-dark rounded-t-3xl border-t border-line-subtle max-h-[90%]"
          style={{ paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 12) }}
        >
          <View className="items-center pt-2 pb-1">
            <View className="w-9 h-1 rounded-full bg-line-default" />
          </View>
          <View className="flex-row items-center justify-between px-5 pb-2 pt-1">
            <Text className="text-h3 font-semibold text-ink-primary-light dark:text-ink-primary-dark">
              {isEdit ? 'Edit floor' : 'Add floor'}
            </Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color="#6B7280" />
            </Pressable>
          </View>
          <ScrollView
            {...wizardScrollViewProps}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: FIELD_GAP }}
          >
            <AppDropdown
              label="Floor No."
              required
              placeholder="Select floor"
              modalTitle="Floor No."
              value={value.floorName}
              options={masters.floors}
              onChange={(v) => onChange({ ...value, floorName: v })}
            />
            <AreaPairField
              label="Floor Area"
              required
              sqft={value.areaSqft}
              onSqftChange={(v) => onChange({ ...value, areaSqft: v })}
              helperText="Area of this floor level in sq.ft"
            />
            <AppDropdown
              label="Usage factor"
              required
              placeholder="Select usage factor"
              modalTitle="Usage factor"
              value={value.usageFactor}
              options={masters.usageFactors}
              onChange={(v) => onChange({ ...value, usageFactor: v })}
              helperText="How this floor area is used (residential, commercial, etc.)"
            />
            <AppDropdown
              label="Usage type"
              required
              placeholder="Select usage type"
              modalTitle="Usage type"
              value={value.usageType}
              options={masters.usageTypes}
              onChange={(v) => onChange({ ...value, usageType: v })}
              helperText="Occupancy — self-occupied or rented"
            />
            <AppDropdown
              label="Construction Type"
              required
              placeholder="Select construction type"
              modalTitle="Construction Type"
              value={value.constructionType}
              options={masters.constructionTypes}
              onChange={(v) => onChange({ ...value, constructionType: v })}
            />
          </ScrollView>
          <View className="flex-row justify-end gap-2 px-4 py-3 border-t border-line-subtle">
            <AppButton label="Cancel" variant="outline" onPress={onClose} />
            <AppButton label={isEdit ? 'Save' : 'Add'} onPress={() => onSave(value)} disabled={!canSave} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
