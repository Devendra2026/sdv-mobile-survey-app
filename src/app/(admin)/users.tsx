import { EmptyState, Spinner } from '@/components';
import { AdminHeader } from '@/components/admin/admin-header';
import { RoleSegmentedControl, UserDirectoryCard, UserSearchBar, type UserItem } from '@/components/admin/user-list';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { usePaginatedQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

const PAGE_SIZE = 30;

const ListSeparator = () => <View className="h-3" />;

export default function AdminUsersScreen() {
  const router = useRouter();
  const [role, setRole] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');

  const paginated = usePaginatedQuery(api.admin.listUsers, { role: role ?? undefined }, { initialNumItems: PAGE_SIZE });

  const users = paginated.results;
  const status = paginated.status;
  const loadMore = paginated.loadMore;

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
    ({ item }: { item: UserItem }) => <UserDirectoryCard item={item} onOpen={onOpenUser} />,
    [onOpenUser],
  );

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <AdminHeader
        variant="surface"
        eyebrow="Directory"
        title="Users"
        subtitle={isLoading ? 'Loading directory…' : `${filtered.length} shown · ${users.length} loaded`}
        footer={
          <View className="mt-3">
            <UserSearchBar value={search} onChange={setSearch} />
          </View>
        }
      />

      <RoleSegmentedControl value={role} onChange={setRole} />

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
          ListFooterComponent={
            isLoadingMore ? (
              <View className="py-4 items-center">
                <ActivityIndicator color="#003B8E" />
              </View>
            ) : null
          }
          ItemSeparatorComponent={ListSeparator}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}
