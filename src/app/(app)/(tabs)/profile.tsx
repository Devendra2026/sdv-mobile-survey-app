import { AppButton, AppCard, Avatar, ListRow, SectionLabel, Spinner, Tag } from '@/components';
import { api } from '@/convex/_generated/api';
import { useConvexReadyQuery } from '@/hooks/use-convex-ready-query';
import { humanizeRole } from '@/utils/format';
import { scrollViewProps } from '@/utils/scroll-props';
import { TabScreenBottomSpacer } from '@/utils/ui-layout';
import { useAuth } from '@clerk/expo';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const me = useConvexReadyQuery(api.users.currentUser);
  const { signOut } = useAuth();

  if (me === undefined) return <Spinner label="Loading…" />;
  if (!me) return null;

  const confirmSignOut = () => {
    Alert.alert('Sign out?', "You'll need to sign in again to continue.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <SafeAreaView edges={['top']} className="bg-brand">
        <View className="items-center pt-3 pb-6">
          <Avatar name={me.name} tone="brand" size="xl" />
          <Text className="text-h2 font-medium text-white mt-2.5">{me.name}</Text>
          <Text className="text-caption text-white/75 mt-0.5">{me.email}</Text>
          <View className="flex-row gap-1.5 mt-2">
            <Tag label={humanizeRole(me.role)} tone="brand" icon="shield-checkmark-outline" />
            {me.status === 'active' ? <Tag label="Active" tone="success" icon="checkmark-circle" /> : null}
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 14 }} {...scrollViewProps}>
        <SectionLabel>Assignment</SectionLabel>
        <AppCard padded={false} className="mb-4">
          <ListRow
            icon="business-outline"
            iconTone="brand"
            title="Municipality"
            subtitle={me.municipality?.name ?? 'Not assigned'}
            showChevron={false}
          />
          <View className="h-px bg-line-subtle" />
          <ListRow
            icon="map-outline"
            iconTone="brand"
            title="Wards"
            subtitle={me.wardAssignments.join(', ') || 'Not assigned'}
            showChevron={false}
          />
          <View className="h-px bg-line-subtle" />
          <ListRow
            icon="location-outline"
            iconTone="neutral"
            title="District"
            subtitle={me.district?.name ?? '—'}
            showChevron={false}
          />
        </AppCard>

        <SectionLabel>Account</SectionLabel>
        <AppCard padded={false} className="mb-4">
          <ListRow
            icon="key-outline"
            iconTone="neutral"
            title="Change password"
            subtitle="Via email reset"
            onPress={() => undefined}
          />
          <View className="h-px bg-line-subtle" />
          <ListRow icon="help-circle-outline" iconTone="neutral" title="Help & support" onPress={() => undefined} />
        </AppCard>

        <AppButton label="Sign out" variant="outline" iconLeft="log-out-outline" onPress={confirmSignOut} fullWidth />
        <TabScreenBottomSpacer />
      </ScrollView>
    </View>
  );
}
