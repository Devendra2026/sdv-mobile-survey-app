/**
 * Account setup — shows progress while `useSyncConvexUser` creates the Convex row.
 */
import { AppButton } from '@/components';
import { useSyncConvexUser } from '@/hooks/use-sync-convex-user';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SetupScreen() {
  const { syncing, error, sync, needsSync } = useSyncConvexUser();

  return (
    <SafeAreaView className="flex-1 bg-page-light dark:bg-page-dark">
      <View className="flex-1 items-center justify-center px-6">
        <View className="mb-6 h-20 w-20 items-center justify-center rounded-full bg-brand-soft dark:bg-brand/20">
          <Ionicons name="person-circle-outline" size={48} color="#003B8E" />
        </View>

        <Text className="mb-2 text-center text-display font-semibold text-ink-primary-light dark:text-ink-primary-dark">
          Setting up your account
        </Text>

        <Text className="mb-8 max-w-[300px] text-center text-body text-ink-secondary-light dark:text-ink-secondary-dark">
          We&apos;re saving your Clerk profile to Survey field operations.
        </Text>

        {needsSync && !error ? (
          <ActivityIndicator color="#003B8E" size="large" />
        ) : error ? (
          <>
            <Text className="mb-6 max-w-[300px] text-center text-body text-danger">{error}</Text>
            <AppButton
              label={syncing ? 'Retrying…' : 'Try again'}
              loading={syncing}
              onPress={() => void sync()}
              fullWidth
            />
          </>
        ) : (
          <ActivityIndicator color="#003B8E" size="large" />
        )}

        <Text className="mt-6 text-center text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark">
          {error ? 'Still having trouble? Contact your administrator.' : 'Please wait…'}
        </Text>
      </View>
    </SafeAreaView>
  );
}
