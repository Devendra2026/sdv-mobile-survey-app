/**
 * Surveys list with status filter. Reactive: any survey created or
 * updated by anyone visible to the caller appears here without refresh.
 */
import { EmptyState, Spinner, SurveyCard } from '@/components';
import { api } from '@/convex/_generated/api';
import { surveyOwnerListLabel } from '@/utils/format';
import { flatListProps, useTabScreenPadding } from '@/utils/ui-layout';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type StatusFilter = 'all' | 'draft' | 'submitted' | 'approved' | 'rejected';

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export default function SurveysScreen() {
  const router = useRouter();
  const tabPad = useTabScreenPadding();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const surveys = useQuery(api.surveys.list, {
    status: filter === 'all' || filter === 'rejected' ? undefined : filter,
    qcStatus: filter === 'rejected' ? 'rejected' : undefined,
    limit: 100,
  });

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <SafeAreaView edges={['top']} className="bg-surface-light dark:bg-surface-dark border-b border-line-subtle">
        <View className="px-4 pt-2 pb-3">
          <Text className="text-h1 font-medium text-ink-primary-light dark:text-ink-primary-dark">Surveys</Text>
        </View>
        <View className="px-4 pb-3 flex-row gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <Pressable
                key={f.value}
                onPress={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded-full border ${active ? 'bg-brand border-brand' : 'bg-surface-light dark:bg-surface-dark border-line-default'}`}
              >
                <Text
                  className={`text-[12px] font-medium ${active ? 'text-white' : 'text-ink-secondary-light dark:text-ink-secondary-dark'}`}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>

      {surveys === undefined ? (
        <Spinner label="Loading…" />
      ) : surveys.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="No surveys here"
          message="Try a different filter or start a new survey."
        />
      ) : (
        <FlatList
          data={surveys}
          keyExtractor={(s) => s._id}
          contentContainerStyle={{ padding: 14, paddingBottom: tabPad }}
          {...flatListProps}
          ItemSeparatorComponent={() => <View className="h-2" />}
          renderItem={({ item }) => (
            <SurveyCard
              parcelNo={item.parcelNo}
              unitNo={item.unitNo}
              ownerName={surveyOwnerListLabel(item.owners, item.respondentName)}
              wardNo={item.wardNo}
              status={item.status}
              qcStatus={item.qcStatus}
              updatedAt={item._creationTime}
              onPress={() => router.push({ pathname: '/(app)/survey/[id]', params: { id: item._id } })}
            />
          )}
        />
      )}
    </View>
  );
}
