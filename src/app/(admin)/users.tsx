import { Avatar, EmptyState, Spinner, Tag } from '@/components';
import { AdminHeader } from '@/components/admin/admin-header';
import { FilterChipItem, FilterChips } from '@/components/admin/filter-chips';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { humanizeRole, timeAgo } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { usePaginatedQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

const PAGE_SIZE = 30;

type UserItem = FunctionReturnType<typeof api.admin.listUsers>['page'][number];

const ROLE_FILTERS = [
  { value: undefined, label: 'All' },
  { value: 'surveyor', label: 'Surveyors' },
  { value: 'supervisor', label: 'Supervisors' },
  { value: 'admin', label: 'Admins' },
  { value: 'pending', label: 'Pending' },
] as const satisfies readonly FilterChipItem<string | undefined>[];

const ListSeparator = () => <View className="h-2.5" />;

function UserRow({ item, onOpen }: { item: UserItem; onOpen: (userId: Id<'users'>) => void }) {
  return (
    <Pressable
      onPress={() => onOpen(item._id)}
      className="p-3.5 bg-surface-light dark:bg-surface-dark rounded-xl border border-line-subtle"
    >
      <View className="flex-row items-center">
        <Avatar
          name={item.name}
          tone={item.status === 'active' ? 'brand' : item.status === 'disabled' ? 'danger' : 'warning'}
          size="md"
        />
        <View className="flex-1 ml-3 min-w-0">
          <Text className="text-[13px] font-medium text-ink-primary-light dark:text-ink-primary-dark" numberOfLines={1}>
            {item.name}
          </Text>
          <Text className="text-caption text-ink-tertiary-light" numberOfLines={1}>
            {item.email}
          </Text>
        </View>
        <Tag label={humanizeRole(item.role)} tone={item.role === 'admin' ? 'brand' : 'neutral'} />
      </View>
      <View className="flex-row gap-1.5 mt-2.5 flex-wrap">
        {item.districtName ? <Tag label={item.districtName} tone="neutral" icon="map-outline" /> : null}
        {item.municipalityName ? (
          <Tag label={item.municipalityName} tone="neutral" icon="business-outline" />
        ) : (item.role === 'surveyor' || item.role === 'supervisor') && item.status === 'active' ? (
          <Tag label="Assign ULB" tone="warning" icon="alert-circle-outline" />
        ) : null}
        {item.wardAssignments.length > 0 ? (
          <Tag label={`Wards ${item.wardAssignments.join(', ')}`} tone="neutral" icon="map-outline" />
        ) : null}
        {item.status === 'active' ? (
          <Tag label="Active" tone="success" icon="checkmark-circle" />
        ) : item.status === 'disabled' ? (
          <Tag label="Disabled" tone="danger" icon="ban" />
        ) : (
          <Tag label="Awaiting approval" tone="warning" icon="time" />
        )}
        {item.lastSeenAt ? <Tag label={`Seen ${timeAgo(item.lastSeenAt)}`} tone="neutral" icon="eye-outline" /> : null}
      </View>
    </Pressable>
  );
}

export default function AdminUsersScreen() {
  const router = useRouter();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const queryArgs = useMemo(() => ({ role: role as never }), [role]);
  const {
    results: users,
    status,
    loadMore,
  } = usePaginatedQuery(api.admin.listUsers, queryArgs, {
    initialNumItems: PAGE_SIZE,
  });

  const isLoading = status === 'LoadingFirstPage';
  const isLoadingMore = status === 'LoadingMore';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.municipalityName?.toLowerCase().includes(q) ?? false),
    );
  }, [users, search]);

  const chips: FilterChipItem<string | undefined>[] = ROLE_FILTERS.map((r) => ({
    ...r,
    count: r.value === undefined ? users.length : undefined,
  }));

  const onOpenUser = useCallback(
    (userId: Id<'users'>) => {
      router.push({
        pathname: '/(admin)/assign-user',
        params: { userId },
      });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: UserItem }) => <UserRow item={item} onOpen={onOpenUser} />,
    [onOpenUser],
  );

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          setTimeout(() => setRefreshing(false), 400);
        }}
        tintColor="#003B8E"
      />
    ),
    [refreshing],
  );

  const listFooter = useMemo(
    () =>
      isLoadingMore ? (
        <View className="py-4 items-center">
          <ActivityIndicator color="#003B8E" />
        </View>
      ) : null,
    [isLoadingMore],
  );

  const searchFooter = useMemo(
    () => (
      <View className="mt-3 flex-row items-center bg-page-light dark:bg-page-dark rounded-xl border border-line-default px-3 h-11">
        <Ionicons name="search-outline" size={18} color="#9AA3AF" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name or email"
          placeholderTextColor="#9AA3AF"
          className="flex-1 ml-2 text-[13px] text-ink-primary-light dark:text-ink-primary-dark"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>
    ),
    [search],
  );

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <AdminHeader
        variant="surface"
        eyebrow=""
        title="Users"
        subtitle={isLoading ? 'Loading directory…' : `${users.length} account${users.length === 1 ? '' : 's'} loaded`}
        footer={searchFooter}
      />

      <FilterChips items={chips} value={role} onChange={setRole} />

      {isLoading ? (
        <Spinner label="Loading users…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={search ? 'No matches' : 'No users'}
          message={
            search
              ? 'Try a different name or email.'
              : role
                ? 'No users in this category yet.'
                : 'Approved users will appear here.'
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u._id}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
          onEndReached={() => {
            if (status === 'CanLoadMore') loadMore(PAGE_SIZE);
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={listFooter}
          refreshControl={refreshControl}
          ItemSeparatorComponent={ListSeparator}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}
