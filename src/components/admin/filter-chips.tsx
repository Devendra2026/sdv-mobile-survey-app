import { horizontalScrollProps } from '@/utils/ui-layout';
import { Pressable, ScrollView, Text, View } from 'react-native';

export interface FilterChipItem<T extends string | undefined = string | undefined> {
  value: T;
  label: string;
  count?: number;
}

interface FilterChipsProps<T extends string | undefined = string | undefined> {
  items: readonly FilterChipItem<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function FilterChips<T extends string | undefined = string | undefined>({
  items,
  value,
  onChange,
}: FilterChipsProps<T>) {
  return (
    <ScrollView
      horizontal
      {...horizontalScrollProps}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}
    >
      {items.map((item) => {
        const active = value === item.value;
        return (
          <Pressable
            key={item.label}
            onPress={() => onChange(item.value)}
            className={[
              'flex-row items-center px-3.5 py-2 rounded-full border',
              active ? 'bg-brand border-brand' : 'bg-surface-light dark:bg-surface-dark border-line-default',
            ].join(' ')}
          >
            <Text
              className={[
                'text-[12px] font-medium',
                active ? 'text-white' : 'text-ink-secondary-light dark:text-ink-secondary-dark',
              ].join(' ')}
            >
              {item.label}
            </Text>
            {item.count !== undefined ? (
              <View
                className={[
                  'ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full items-center justify-center',
                  active ? 'bg-white/25' : 'bg-page-light dark:bg-page-dark',
                ].join(' ')}
              >
                <Text
                  className={['text-[10px] font-semibold', active ? 'text-white' : 'text-ink-tertiary-light'].join(' ')}
                >
                  {item.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
