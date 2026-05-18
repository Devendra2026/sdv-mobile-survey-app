/**
 * Step 5 — Area detail: plot area, floor rows, plinth & built-up totals.
 */
import { AppButton, AppCard, AppDropdown, AreaPairField, SectionLabel, Spinner } from '@/components';
import { api } from '@/convex/_generated/api';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import { WizardStepFrame } from '@/hooks/WizardStepFrame';
import { isOpenLandFloor, OPEN_LAND_FLOOR, sumFloorSqft } from '@/utils/area';
import { formatArea, humanizeRole } from '@/utils/format';
import { normalizeMastersBundle } from '@/utils/mastersBundle';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Floor = NonNullable<WizardDraft['floors']>[number];
type Masters = ReturnType<typeof normalizeMastersBundle>;

function newFloorId() {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function labelFor(options: { value: string; label: string }[], value: string) {
  return options.find((o) => o.value === value)?.label ?? humanizeRole(value);
}

function floorRowComplete(f: Floor): boolean {
  if (!f.floorName || !(f.areaSqft > 0)) return false;
  if (isOpenLandFloor(f.floorName)) return true;
  return !!(f.usageType && f.constructionType);
}

function hasOpenLandFloor(floors: Floor[]): boolean {
  return floors.some((f) => isOpenLandFloor(f.floorName));
}

function areaStepComplete(d: WizardDraft): boolean {
  const plotOk = (d.plotSqft ?? 0) > 0;
  const floors = d.floors ?? [];
  return plotOk && floors.length > 0 && floors.every(floorRowComplete);
}

export default function StepAreaDetail() {
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const rawMasters = useQuery(api.masters.bundle, {});
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Floor | null>(null);

  const masters = useMemo(() => (rawMasters ? normalizeMastersBundle(rawMasters) : null), [rawMasters]);

  if (!masters || !localId) return <Spinner label="Loading…" />;

  const openNewFloor = () => {
    setEditing({
      clientFloorId: newFloorId(),
      floorName: '',
      usageType: '',
      constructionType: '',
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
      title="Area Detail"
      subtitle="Plot area and floor-wise built-up"
      nextDisabled={(draft) => !areaStepComplete(draft)}
    >
      {({ draft, update }) => {
        const floors = draft.floors ?? [];
        const builtUpSqft = sumFloorSqft(floors);

        const saveFloor = async (f: Floor) => {
          const existing = floors.findIndex((x) => x.clientFloorId === f.clientFloorId);
          const next = [...floors];
          const row: Floor = {
            ...f,
            isOccupied: isOpenLandFloor(f.floorName)
              ? false
              : f.usageType === 'self_occupied' || f.usageType === 'rented',
          };
          if (existing >= 0) next[existing] = row;
          else next.push(row);
          const patch: Partial<WizardDraft> = { floors: next };
          if (!hasOpenLandFloor(next)) patch.plinthSqft = 0;
          await update(patch);
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
                const patch: Partial<WizardDraft> = { floors: next };
                if (!hasOpenLandFloor(next)) patch.plinthSqft = 0;
                void update(patch);
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

        const showSummary = hasOpenLandFloor(floors);

        return (
          <>
            <View className="flex-row justify-end mb-3">
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
              <AreaPairField required sqft={draft.plotSqft ?? 0} onSqftChange={(v) => void update({ plotSqft: v })} />
            </AppCard>

            <View className="flex-row items-center justify-between mb-2">
              <SectionLabel>Floor area</SectionLabel>
              <Pressable
                onPress={openNewFloor}
                accessibilityLabel="Add floor"
                className="w-10 h-10 rounded-full bg-brand items-center justify-center active:opacity-90"
              >
                <Ionicons name="add" size={24} color="#FFFFFF" />
              </Pressable>
            </View>

            <AppCard padded={false} className="mb-2 overflow-hidden">
              <View className="flex-row bg-page-light dark:bg-page-dark px-3 py-2.5 border-b border-line-subtle">
                <Text className="flex-[1.1] text-[11px] font-semibold text-ink-secondary-light">Floor No.</Text>
                <Text className="flex-1 text-[11px] font-semibold text-ink-secondary-light">Area</Text>
                <Text className="flex-[1.1] text-[11px] font-semibold text-ink-secondary-light">Usage</Text>
                <Text className="flex-[1.2] text-[11px] font-semibold text-ink-secondary-light">Construction</Text>
              </View>
              {floors.length === 0 ? (
                <Text className="text-helper text-ink-tertiary-light text-center py-6 px-4">
                  Tap + to add a floor row
                </Text>
              ) : (
                floors.map((f) => (
                  <Pressable
                    key={f.clientFloorId}
                    onPress={() => openEditFloor(f)}
                    onLongPress={() => removeFloor(f.clientFloorId)}
                    delayLongPress={400}
                    className="flex-row items-center px-3 py-3 border-b border-line-subtle active:bg-page-light dark:active:bg-page-dark"
                  >
                    <Text
                      className="flex-[1.1] text-[12px] text-ink-primary-light dark:text-ink-primary-dark"
                      numberOfLines={2}
                    >
                      {labelFor(masters.floors, f.floorName)}
                    </Text>
                    <Text className="flex-1 text-[12px] text-ink-secondary-light" numberOfLines={1}>
                      {f.areaSqft > 0 ? formatArea(f.areaSqft) : '—'}
                    </Text>
                    <Text className="flex-[1.1] text-[12px] text-ink-secondary-light" numberOfLines={2}>
                      {isOpenLandFloor(f.floorName) ? '—' : labelFor(masters.usageTypes, f.usageType)}
                    </Text>
                    <Text className="flex-[1.2] text-[11px] text-ink-secondary-light" numberOfLines={2}>
                      {isOpenLandFloor(f.floorName) ? '—' : labelFor(masters.constructionTypes, f.constructionType)}
                    </Text>
                  </Pressable>
                ))
              )}
            </AppCard>
            <Text className="text-caption text-ink-tertiary-light mb-4 px-1">
              Note: Long press on a row to delete the row.
            </Text>

            {showSummary ? (
              <>
                <SectionLabel>Summary</SectionLabel>
                <AppCard padded className="mb-4">
                  <View style={{ gap: 20 }}>
                    <AreaPairField
                      label="Plinth Area"
                      sqft={draft.plinthSqft ?? 0}
                      onSqftChange={(v) => void update({ plinthSqft: v })}
                    />
                    <AreaPairField label="Total Built Up Area" sqft={builtUpSqft} onSqftChange={() => {}} readOnly />
                  </View>
                </AppCard>
              </>
            ) : null}

            {editing ? (
              <FloorEditorModal
                masters={masters}
                value={editing}
                open={editorOpen}
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
  onClose: () => void;
  onSave: (f: Floor) => void;
}

function FloorEditorModal({ masters, value, open, onClose, onSave }: FloorEditorModalProps) {
  const insets = useSafeAreaInsets();
  const [f, setF] = useState<Floor>(value);

  useEffect(() => {
    if (open) setF(value);
  }, [open, value.clientFloorId]);

  const openLand = isOpenLandFloor(f.floorName);
  const canSave = floorRowComplete(f);
  const isEdit = value.areaSqft > 0 && value.floorName;

  const onFloorNameChange = (v: string) => {
    if (v === OPEN_LAND_FLOOR) {
      setF({
        ...f,
        floorName: v,
        usageType: '',
        constructionType: '',
        isOccupied: false,
      });
    } else {
      setF({ ...f, floorName: v });
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50 justify-center px-4" onPress={onClose}>
        <Pressable
          className="bg-surface-light dark:bg-surface-dark rounded-2xl max-h-[88%] overflow-hidden"
          style={{ marginBottom: insets.bottom }}
          onPress={(e) => e.stopPropagation()}
        >
          <View className="flex-row items-center justify-between px-4 pt-4 pb-2 border-b border-line-subtle">
            <Text className="text-h3 font-semibold text-ink-primary-light dark:text-ink-primary-dark">Area Detail</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color="#6B7280" />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 16, paddingBottom: 8, gap: 16 }}
          >
            <AppDropdown
              label="Floor No"
              required
              placeholder="Select floor type"
              modalTitle="Floor No"
              value={f.floorName}
              options={masters.floors}
              onChange={onFloorNameChange}
            />
            <AreaPairField label="Area" required sqft={f.areaSqft} onSqftChange={(v) => setF({ ...f, areaSqft: v })} />
            {!openLand ? (
              <>
                <AppDropdown
                  label="Usage Type"
                  required
                  placeholder="Select usage type"
                  modalTitle="Usage Type"
                  value={f.usageType}
                  options={masters.usageTypes}
                  onChange={(v) => setF({ ...f, usageType: v })}
                />
                <AppDropdown
                  label="Construction Type"
                  required
                  placeholder="Select construction type"
                  modalTitle="Construction Type"
                  value={f.constructionType}
                  options={masters.constructionTypes}
                  onChange={(v) => setF({ ...f, constructionType: v })}
                />
              </>
            ) : null}
          </ScrollView>
          <View className="flex-row justify-end gap-2 px-4 py-3 border-t border-line-subtle">
            <AppButton label="Cancel" variant="outline" onPress={onClose} />
            <AppButton label={isEdit ? 'Save' : 'Add'} onPress={() => onSave(f)} disabled={!canSave} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
