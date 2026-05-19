import { horizontalScrollProps } from '@/utils/ui-layout';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';

export interface WizardStepIndicator {
  key: string;
  label: string;
  short: string;
  completed: boolean;
}

interface WizardHeaderProps {
  title: string;
  subtitle?: string;
  steps: WizardStepIndicator[];
  activeKey: string;
  onBack: () => void;
  onSelectStep: (key: string) => void;
}

export function WizardHeader({ title, subtitle, steps, activeKey, onBack, onSelectStep }: WizardHeaderProps) {
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
          {subtitle ? <Text className="text-caption text-white/75 mt-1">{subtitle}</Text> : null}
        </View>
      </View>

      <ScrollView
        horizontal
        {...horizontalScrollProps}
        className="mt-4"
        contentContainerClassName="flex-row gap-2 pr-2"
      >
        {steps.map((step) => {
          const active = step.key === activeKey;
          return (
            <Pressable
              key={step.key}
              onPress={() => onSelectStep(step.key)}
              className={[
                'min-w-[44px] items-center rounded-full px-2.5 py-2',
                active ? 'bg-white' : step.completed ? 'bg-white/25' : 'bg-white/10',
              ].join(' ')}
            >
              {step.completed && !active ? (
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
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
        })}
      </ScrollView>
    </View>
  );
}
