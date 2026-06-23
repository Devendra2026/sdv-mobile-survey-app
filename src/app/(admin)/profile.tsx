import { AppButton, AppCard, Avatar, ListRow, SectionLabel, Spinner, Tag } from '@/components';
import { api } from '@/convex/_generated/api';
import { humanizeRole } from '@/utils/format';
import { useAuth } from '@clerk/expo';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function StatTile({
  label,
  value,
  icon,
  onPress,
}: {
  label: string;
  value: string;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  onPress?: () => void;
}) {
  const content = (
    <View className="flex-1 p-4 bg-surface-light dark:bg-surface-dark rounded-2xl border border-line-subtle items-center shadow-sm">
      <Tag label={label} tone="neutral" icon={icon} />
      <Text className="text-h1 font-semibold text-brand mt-2">{value}</Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} className="flex-1 active:opacity-90">
        {content}
      </Pressable>
    );
  }
  return content;
}

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
      <SafeAreaView edges={['top']} className="bg-brand">
        <View className="px-4 pt-4 pb-8 items-center">
          <Text className="text-helper text-white/70 uppercase tracking-wide">Your account</Text>
          <View className="mt-4 rounded-full border-4 border-white/20">
            <Avatar name={me.name} tone="brand" size="xl" />
          </View>
          <Text className="text-h2 font-medium text-white mt-3" numberOfLines={1}>
            {me.name}
          </Text>
          <Text className="text-caption text-white/75 mt-1" numberOfLines={1}>
            {me.email}
          </Text>
          <View className="mt-3">
            <Tag label={humanizeRole(me.role)} tone="brand" icon="shield-checkmark-outline" />
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28, marginTop: -16 }}>
        <View className="flex-row gap-2 mb-4">
          <StatTile
            label="Pending"
            value={String(pendingCount)}
            icon="time-outline"
            onPress={() => router.push('/(admin)/approvals')}
          />
          <StatTile
            label="Active users"
            value={activeUsersLabel}
            icon="people-outline"
            onPress={() => router.push('/(admin)/users')}
          />
        </View>

        <SectionLabel>Navigate</SectionLabel>
        <AppCard padded={false} className="mb-4 shadow-sm">
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
            subtitle="Browse, filter, and assign accounts"
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
