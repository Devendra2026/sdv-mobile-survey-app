import { Pressable, Text, View } from 'react-native';
import { ROLE_FILTERS } from './types';

export function RoleSegmentedControl({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-1.5 px-4 pb-3">
      {ROLE_FILTERS.map((r) => {
        const active = value === r.value;
        return (
          <Pressable
            key={r.label}
            onPress={() => onChange(r.value)}
            className={`px-3.5 py-2 rounded-full border ${active ? 'bg-brand border-brand' : 'bg-surface-light dark:bg-surface-dark border-line-default'}`}
          >
            <Text className={`text-[12px] font-semibold ${active ? 'text-white' : 'text-ink-secondary-light'}`}>
              {r.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
