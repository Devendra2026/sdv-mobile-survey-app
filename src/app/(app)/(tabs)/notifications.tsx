import { EmptyState, Spinner } from '@/components';
import { api } from '@/convex/_generated/api';
import type { Doc } from '@/convex/_generated/dataModel';
import { useConvexReadyQuery } from '@/hooks/use-convex-ready-query';
import { timeAgo } from '@/utils/format';
import { flatListProps } from '@/utils/scroll-props';
import { TabScreenBottomSpacer } from '@/utils/ui-layout';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from 'convex/react';
import { memo, useCallback } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ICONS: Record<string, { name: keyof typeof Ionicons.glyphMap; tone: string }> = {
  account_approved: { name: 'checkmark-circle', tone: '#16A34A' },
  account_rejected: { name: 'close-circle', tone: '#DC2626' },
  qc_approved: { name: 'checkmark-done-circle', tone: '#16A34A' },
  qc_rejected: { name: 'alert-circle', tone: '#DC2626' },
  qc_remark_received: { name: 'chatbubble-ellipses', tone: '#2563EB' },
};

const ListSeparator = () => <View className="h-2" />;

const NotificationRow = memo(function NotificationRow({
  item,
  onMarkRead,
}: {
  item: Doc<'notifications'>;
  onMarkRead: (id: Doc<'notifications'>['_id']) => void;
}) {
  const ic = ICONS[item.type] ?? { name: 'notifications', tone: '#6B7280' };
  const unread = !item.readAt;
  return (
    <Pressable
      onPress={() => unread && onMarkRead(item._id)}
      className={`p-3.5 rounded-xl border border-line-subtle ${unread ? 'bg-brand-soft' : 'bg-surface-light dark:bg-surface-dark'}`}
    >
      <View className="flex-row items-start">
        <Ionicons name={ic.name} size={22} color={ic.tone} />
        <View className="flex-1 ml-3">
          <Text className="text-[13px] font-medium text-ink-primary-light dark:text-ink-primary-dark">
            {item.title}
          </Text>
          <Text className="text-caption text-ink-secondary-light dark:text-ink-secondary-dark mt-0.5">{item.body}</Text>
          <Text className="text-caption text-ink-tertiary-light mt-1.5">{timeAgo(item._creationTime)}</Text>
        </View>
        {unread ? <View className="w-2 h-2 rounded-full bg-brand mt-1.5" /> : null}
      </View>
    </Pressable>
  );
});

export default function NotificationsScreen() {
  const list = useConvexReadyQuery(api.masters.listNotifications);
  const markRead = useMutation(api.masters.markRead);

  const handleMarkRead = useCallback(
    (id: Doc<'notifications'>['_id']) => {
      void markRead({ id });
    },
    [markRead],
  );

  const keyExtractor = useCallback((n: Doc<'notifications'>) => n._id, []);

  const renderItem = useCallback(
    ({ item }: { item: Doc<'notifications'> }) => <NotificationRow item={item} onMarkRead={handleMarkRead} />,
    [handleMarkRead],
  );

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <SafeAreaView edges={['top']} className="bg-surface-light dark:bg-surface-dark border-b border-line-subtle">
        <View className="px-4 pt-2 pb-3">
          <Text className="text-h1 font-medium text-ink-primary-light dark:text-ink-primary-dark">Inbox</Text>
        </View>
      </SafeAreaView>

      {list === undefined ? (
        <Spinner label="Loading…" />
      ) : list.length === 0 ? (
        <EmptyState icon="mail-open-outline" title="No notifications" message="You're all caught up." />
      ) : (
        <FlatList
          data={list}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ padding: 14 }}
          {...flatListProps}
          ItemSeparatorComponent={ListSeparator}
          renderItem={renderItem}
          ListFooterComponent={TabScreenBottomSpacer}
        />
      )}
    </View>
  );
}
