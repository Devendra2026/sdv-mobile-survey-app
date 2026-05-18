import { BrandLogo } from '@/components/brand-logo';
import { ActivityIndicator, Text, View } from 'react-native';

type AppLoadingViewProps = {
  message: string;
};

/** Session setup overlay after the native splash has hidden. */
export function AppLoadingView({ message }: AppLoadingViewProps) {
  return (
    <View className="flex-1 items-center justify-center bg-page-light px-8 dark:bg-page-dark">
      <BrandLogo width={240} />
      <View className="mt-6">
        <ActivityIndicator color="#003B8E" size="large" />
      </View>
      <Text className="mt-4 max-w-[280px] text-center text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark">
        {message}
      </Text>
    </View>
  );
}
