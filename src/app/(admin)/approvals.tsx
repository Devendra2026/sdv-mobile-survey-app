/**
 * Admin → Pending approvals inbox.
 */
import { Avatar, Banner, EmptyState, Spinner, Tag, Toast } from '@/components';
import { AdminHeader } from '@/components/admin/admin-header';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useConvexReadyQuery } from '@/hooks/use-convex-ready-query';
import { toUserMessage } from '@/utils/errors';
import { timeAgo } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

type ApprovalItem = FunctionReturnType<typeof api.admin.listPendingApprovals>[number];

const ListSeparator = () => <View className="h-2.5" />;

const ListHeader = () => (
  <Text className="text-caption text-ink-tertiary-light dark:text-ink-tertiary-dark mb-3">
    Tap a request to review role, municipality, and wards.
  </Text>
);

function ApprovalRow({
  item,
  busyId,
  onOpenDetail,
  onReject,
}: {
  item: ApprovalItem;
  busyId: Id<'users'> | null;
  onOpenDetail: (userId: Id<'users'>) => void;
  onReject: (id: Id<'users'>, name: string) => void;
}) {
  const isBusy = busyId === item._id;

  return (
    <Pressable
      onPress={() => onOpenDetail(item._id)}
      className="bg-surface-light dark:bg-surface-dark rounded-xl border border-line-subtle overflow-hidden active:opacity-95"
    >
      <View className="p-3.5">
        <View className="flex-row items-start">
          <Avatar name={item.name} tone="warning" size="md" />
          <View className="flex-1 ml-3 mr-2">
            <Text className="text-[13px] font-medium text-ink-primary-light dark:text-ink-primary-dark">
              {item.name}
            </Text>
            <Text className="text-caption text-ink-tertiary-light dark:text-ink-tertiary-dark mt-0.5">
              {item.email}
            </Text>
            <View className="flex-row flex-wrap gap-1.5 mt-2">
              <Tag label={item.requestedRole ?? 'Role not specified'} tone="brand" icon="briefcase-outline" />
              <Tag label={timeAgo(new Date(item.createdAt).toISOString())} tone="neutral" icon="time-outline" />
            </View>
            {item.requestedReason ? (
              <Text
                className="text-caption text-ink-secondary-light dark:text-ink-secondary-dark mt-2"
                numberOfLines={2}
              >
                {item.requestedReason}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9AA3AF" />
        </View>
      </View>

      <View className="flex-row border-t border-line-subtle">
        <Pressable
          onPress={() => onReject(item._id, item.name)}
          disabled={isBusy}
          className="flex-1 flex-row items-center justify-center py-2.5 border-r border-line-subtle active:bg-page-light dark:active:bg-page-dark"
        >
          {isBusy ? (
            <Text className="text-caption text-ink-tertiary-light">Rejecting…</Text>
          ) : (
            <>
              <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
              <Text className="text-caption font-medium text-danger ml-1.5">Reject</Text>
            </>
          )}
        </Pressable>
        <Pressable
          onPress={() => onOpenDetail(item._id)}
          className="flex-1 flex-row items-center justify-center py-2.5 active:bg-brand-soft"
        >
          <Text className="text-caption font-medium text-brand">Review</Text>
          <Ionicons name="arrow-forward" size={14} color="#003B8E" style={{ marginLeft: 4 }} />
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function ApprovalsScreen() {
  const router = useRouter();
  const pending = useConvexReadyQuery(api.admin.listPendingApprovals);
  const rejectUser = useMutation(api.admin.rejectUser);
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);
  const [busyId, setBusyId] = useState<Id<'users'> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  const hideToast = useCallback(() => setToast(null), []);

  const openDetail = useCallback(
    (userId: Id<'users'>) => {
      router.push({
        pathname: '/(admin)/approve-detail',
        params: { userId },
      });
    },
    [router],
  );

  const onReject = useCallback(
    (id: Id<'users'>, name: string) => {
      Alert.alert('Reject account?', `${name} will be denied access. You can re-enable them later from Users.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setBusyId(id);
            try {
              await rejectUser({ userId: id });
              setToast({ title: 'Request rejected', tone: 'success' });
            } catch (e) {
              setToast({ title: toUserMessage(e), tone: 'danger' });
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [rejectUser],
  );

  const refreshControl = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#003B8E" />,
    [refreshing, onRefresh],
  );

  const renderItem = useCallback(
    ({ item }: { item: ApprovalItem }) => (
      <ApprovalRow item={item} busyId={busyId} onOpenDetail={openDetail} onReject={onReject} />
    ),
    [busyId, openDetail, onReject],
  );

  const count = pending?.length ?? 0;

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <AdminHeader
        title="Approvals"
        subtitle={
          pending === undefined
            ? 'Loading inbox…'
            : count === 0
              ? 'No pending sign-ups'
              : `${count} ${count === 1 ? 'request' : 'requests'} awaiting review`
        }
      />

      {pending === undefined ? (
        <Spinner label="Loading inbox…" />
      ) : count === 0 ? (
        <View className="px-4 mt-4">
          <Banner
            tone="success"
            title="All caught up"
            message="New sign-ups appear here in real time — no refresh needed."
            icon="checkmark-circle-outline"
          />
          <EmptyState
            icon="checkmark-done-circle-outline"
            title="Inbox empty"
            message="When someone registers, tap their card to assign a role and municipality."
          />
        </View>
      ) : (
        <FlatList
          data={pending}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
          refreshControl={refreshControl}
          ItemSeparatorComponent={ListSeparator}
          ListHeaderComponent={ListHeader}
          renderItem={renderItem}
        />
      )}

      {toast ? <Toast visible title={toast.title} tone={toast.tone} onHide={hideToast} /> : null}
    </View>
  );
}
