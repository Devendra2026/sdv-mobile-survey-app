import { AppButton, AppCard, Avatar, ListRow, SectionLabel, Spinner, Tag } from '@/components';
import { AdminHeader } from '@/components/admin/admin-header';
import { api } from '@/convex/_generated/api';
import { humanizeRole } from '@/utils/format';
import { useAuth } from '@clerk/expo';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { Alert, ScrollView, Text, View } from 'react-native';

export default function AdminProfileScreen() {
  const router = useRouter();
  const me = useQuery(api.users.currentUser, {});
  const pending = useQuery(api.admin.listPendingApprovals, {});
  const activeUsers = useQuery(api.admin.countActiveUsers, {});
  const { signOut } = useAuth();

  if (!me) return <Spinner label="Loading profile…" />;

  const pendingCount = pending?.length ?? 0;
  const activeUsersLabel = activeUsers === undefined ? '—' : String(activeUsers);

  const onSignOut = () => {
    Alert.alert('Sign out?', "You'll need to sign in again to continue.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <AdminHeader
        title={me.name}
        subtitle={me.email}
        eyebrow="Your account"
        footer={
          <View className="mt-3 flex-row justify-center">
            <Tag label={humanizeRole(me.role)} tone="brand" icon="shield-checkmark-outline" />
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28 }}>
        <View className="items-center -mt-10 mb-4">
          <View className="rounded-full border-4 border-page-light dark:border-page-dark">
            <Avatar name={me.name} tone="brand" size="xl" />
          </View>
        </View>

        <View className="flex-row gap-2 mb-4">
          <View className="flex-1 p-3 bg-surface-light dark:bg-surface-dark rounded-xl border border-line-subtle items-center">
            <Text className="text-h2 font-semibold text-brand">{pendingCount}</Text>
            <Text className="text-caption text-ink-tertiary-light mt-0.5">Pending</Text>
          </View>
          <View className="flex-1 p-3 bg-surface-light dark:bg-surface-dark rounded-xl border border-line-subtle items-center">
            <Text className="text-h2 font-semibold text-ink-primary-light dark:text-ink-primary-dark">
              {activeUsersLabel}
            </Text>
            <Text className="text-caption text-ink-tertiary-light mt-0.5">Active users</Text>
          </View>
        </View>

        <SectionLabel>Navigate</SectionLabel>
        <AppCard padded={false} className="mb-4">
          <ListRow
            icon="checkmark-circle-outline"
            iconTone="brand"
            title="Approvals"
            subtitle={
              pendingCount > 0 ? `${pendingCount} request${pendingCount === 1 ? '' : 's'} waiting` : 'Inbox clear'
            }
            rightText={pendingCount > 0 ? String(pendingCount) : undefined}
            onPress={() => router.push('/(admin)/approvals')}
          />
          <View className="h-px bg-line-subtle" />
          <ListRow
            icon="people-outline"
            iconTone="neutral"
            title="Users"
            subtitle="Browse and filter accounts"
            onPress={() => router.push('/(admin)/users')}
          />
          <View className="h-px bg-line-subtle" />
          <ListRow
            icon="bar-chart-outline"
            iconTone="brand"
            title="Survey reports"
            subtitle="District, ULB, and surveyor analytics"
            onPress={() => router.push('/(admin)/reports')}
          />
          <View className="h-px bg-line-subtle" />
          <ListRow
            icon="library-outline"
            iconTone="neutral"
            title="Masters"
            subtitle="Municipalities, wards, and lookups"
            onPress={() => router.push('/(admin)/masters')}
          />
        </AppCard>

        <SectionLabel>Account</SectionLabel>
        <AppButton label="Sign out" variant="outline" iconLeft="log-out-outline" onPress={onSignOut} fullWidth />
      </ScrollView>
    </View>
  );
}
