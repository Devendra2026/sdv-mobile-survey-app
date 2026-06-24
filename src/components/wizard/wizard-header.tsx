import { flatListProps, horizontalScrollProps } from '@/utils/scroll-props';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View, type ListRenderItemInfo } from 'react-native';

export interface WizardStepIndicator {
  key: string;
  label: string;
  short: string;
  completed: boolean;
  progress?: 'complete' | 'in_progress' | 'incomplete';
  reachable?: boolean;
}

interface WizardHeaderProps {
  title: string;
  subtitle?: string;
  steps: WizardStepIndicator[];
  activeKey: string;
  progress?: { current: number; total: number; percent: number; label: string };
  onBack: () => void;
  onSelectStep?: (key: string) => void;
}

function WizardStepChip({
  step,
  active,
  onSelectStep,
}: {
  step: WizardStepIndicator;
  active: boolean;
  onSelectStep?: (key: string) => void;
}) {
  const inProgress = !step.completed && step.progress === 'in_progress';
  const canPress = Boolean(onSelectStep);

  return (
    <Pressable
      onPress={() => canPress && onSelectStep!(step.key)}
      disabled={!canPress}
      className={[
        'min-w-[44px] items-center rounded-full px-2.5 py-2',
        active ? 'bg-white' : step.completed ? 'bg-white/25' : inProgress ? 'bg-warning/30' : 'bg-white/10',
      ].join(' ')}
    >
      {step.completed && !active ? (
        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
      ) : inProgress ? (
        <View className="w-2 h-2 rounded-full bg-warning" />
      ) : (
        <Text className={['text-[11px] font-semibold', active ? 'text-brand' : 'text-white'].join(' ')}>
          {step.short}
        </Text>
      )}
      <Text
        className={['mt-0.5 text-[9px] font-medium', active ? 'text-brand/80' : 'text-white/70'].join(' ')}
        numberOfLines={1}
      >
        {step.label}
      </Text>
    </Pressable>
  );
}

function StepPickerRow({
  step,
  active,
  onSelect,
}: {
  step: WizardStepIndicator;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      className={['flex-row items-center px-4 py-3 border-b border-line-subtle', active ? 'bg-brand-soft' : ''].join(
        ' ',
      )}
    >
      <View
        className={[
          'w-8 h-8 rounded-full items-center justify-center mr-3',
          step.completed ? 'bg-success-soft' : 'bg-page-light',
        ].join(' ')}
      >
        {step.completed ? (
          <Ionicons name="checkmark" size={16} color="#16A34A" />
        ) : (
          <Text className="text-caption font-semibold text-ink-secondary-light">{step.short}</Text>
        )}
      </View>
      <View className="flex-1">
        <Text className="text-body font-medium text-ink-primary-light">{step.label}</Text>
        <Text className="text-caption text-ink-tertiary-light">
          {step.completed ? 'Complete' : step.progress === 'in_progress' ? 'In progress' : 'Not started'}
        </Text>
      </View>
      {active ? <Ionicons name="ellipse" size={8} color="#003B8E" /> : null}
    </Pressable>
  );
}

export function WizardHeader({ title, subtitle, steps, activeKey, progress, onBack, onSelectStep }: WizardHeaderProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const renderStep = useCallback(
    ({ item: step }: ListRenderItemInfo<WizardStepIndicator>) => (
      <WizardStepChip step={step} active={step.key === activeKey} onSelectStep={onSelectStep} />
    ),
    [activeKey, onSelectStep],
  );

  const pickStep = useCallback(
    (key: string) => {
      setPickerOpen(false);
      onSelectStep?.(key);
    },
    [onSelectStep],
  );

  const renderPickerRow = useCallback(
    ({ item: step }: ListRenderItemInfo<WizardStepIndicator>) => (
      <StepPickerRow step={step} active={step.key === activeKey} onSelect={() => pickStep(step.key)} />
    ),
    [activeKey, pickStep],
  );

  return (
    <View className="px-4 pt-2 pb-3">
      <View className="flex-row items-center min-h-9">
        <Pressable
          onPress={onBack}
          hitSlop={8}
          className="w-9 h-9 -ml-1 items-center justify-center rounded-full active:bg-white/10"
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </Pressable>
        <View className="flex-1 ml-1">
          <Text className="text-helper text-white/65">New survey</Text>
          <Text className="text-h1 font-medium text-white mt-0.5">{title}</Text>
          {progress ? (
            <Pressable onPress={() => setPickerOpen(true)} hitSlop={6}>
              <Text className="text-caption text-white/80 mt-1">
                Step {progress.current} of {progress.total} · {progress.label} · {progress.percent}% · Jump to any step
              </Text>
            </Pressable>
          ) : subtitle ? (
            <Text className="text-caption text-white/75 mt-1">{subtitle}</Text>
          ) : null}
        </View>
      </View>

      {progress ? (
        <Pressable onPress={() => setPickerOpen(true)} className="mt-3">
          <View className="h-1.5 rounded-full bg-white/20 overflow-hidden">
            <View className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, progress.percent)}%` }} />
          </View>
        </Pressable>
      ) : null}

      <FlatList
        horizontal
        data={steps}
        keyExtractor={(item) => item.key}
        renderItem={renderStep}
        {...horizontalScrollProps}
        className="mt-4"
        contentContainerClassName="flex-row gap-2 pr-2"
      />

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setPickerOpen(false)}>
          <Pressable className="bg-surface-light rounded-t-2xl max-h-[70%]" onPress={(e) => e.stopPropagation()}>
            <View className="px-4 py-3 border-b border-line-subtle flex-row items-center justify-between">
              <Text className="text-h2 font-medium text-ink-primary-light">Survey steps</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color="#64748B" />
              </Pressable>
            </View>
            <FlatList
              data={steps}
              keyExtractor={(item) => item.key}
              renderItem={renderPickerRow}
              {...flatListProps}
              style={{ maxHeight: 420 }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
