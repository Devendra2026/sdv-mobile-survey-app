import { Avatar, Tag } from '@/components';
import type { Id } from '@/convex/_generated/dataModel';
import { humanizeRole, timeAgo } from '@/utils/format';
import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { UserItem } from './types';

export const UserDirectoryCard = memo(function UserDirectoryCard({
  item,
  onOpen,
}: {
  item: UserItem;
  onOpen: (userId: Id<'users'>) => void;
}) {
  const statusTone =
    item.status === 'active' ? 'success' : item.status === 'disabled' ? 'danger' : ('warning' as const);

  return (
    <Pressable
      onPress={() => onOpen(item._id)}
      className="p-4 bg-surface-light dark:bg-surface-dark rounded-2xl border border-line-subtle shadow-sm active:opacity-90"
    >
      <View className="flex-row items-start">
        <Avatar
          name={item.name}
          tone={item.status === 'active' ? 'brand' : item.status === 'disabled' ? 'danger' : 'warning'}
          size="md"
        />
        <View className="flex-1 ml-3 min-w-0">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1 min-w-0">
              <Text
                className="text-body font-medium text-ink-primary-light dark:text-ink-primary-dark"
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <Text className="text-caption text-ink-tertiary-light mt-0.5" numberOfLines={1}>
                {item.email}
              </Text>
            </View>
            <Tag label={humanizeRole(item.role)} tone={item.role === 'admin' ? 'brand' : 'neutral'} />
          </View>

          <View className="flex-row flex-wrap gap-1.5 mt-3">
            {item.districtName ? <Tag label={item.districtName} tone="neutral" icon="map-outline" /> : null}
            {item.municipalityName ? (
              <Tag label={item.municipalityName} tone="neutral" icon="business-outline" />
            ) : (item.role === 'surveyor' || item.role === 'supervisor') && item.status === 'active' ? (
              <Tag label="Assign ULB" tone="warning" icon="alert-circle-outline" />
            ) : null}
            {item.wardAssignments.length > 0 ? (
              <Tag label={`Wards ${item.wardAssignments.join(', ')}`} tone="neutral" icon="map-outline" />
            ) : null}
          </View>

          <View className="flex-row flex-wrap gap-1.5 mt-2 items-center">
            <Tag
              label={
                item.status === 'active' ? 'Active' : item.status === 'disabled' ? 'Disabled' : 'Awaiting approval'
              }
              tone={statusTone}
              icon={item.status === 'active' ? 'checkmark-circle' : item.status === 'disabled' ? 'ban' : 'time'}
            />
            {item.lastSeenAt ? (
              <Tag label={`Seen ${timeAgo(item.lastSeenAt)}`} tone="neutral" icon="eye-outline" />
            ) : null}
          </View>
        </View>
        <View className="ml-1 mt-1">
          <Ionicons name="chevron-forward" size={18} color="#9AA3AF" />
        </View>
      </View>
    </Pressable>
  );
});
