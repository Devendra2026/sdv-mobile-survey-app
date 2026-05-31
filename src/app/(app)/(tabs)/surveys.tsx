/**
 * Surveys list with status filter and cursor pagination.
 * Reactive: any survey created or updated appears without refresh.
 */
import { EmptyState, Spinner, SurveyCard } from '@/components';
import { api } from '@/convex/_generated/api';
import { surveyOwnerListLabel } from '@/utils/format';
import { flatListProps, useTabScreenPadding } from '@/utils/ui-layout';
import { usePaginatedQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type StatusFilter = 'all' | 'draft' | 'submitted' | 'approved' | 'rejected';

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const PAGE_SIZE = 20;

export default function SurveysScreen() {
  const router = useRouter();
  const tabPad = useTabScreenPadding();
  const [filter, setFilter] = useState<StatusFilter>('all');

  const queryArgs = useMemo(
    () => ({
      status: filter === 'all' || filter === 'rejected' ? undefined : filter,
      qcStatus: filter === 'rejected' ? ('rejected' as const) : undefined,
    }),
    [filter],
  );

  const { results, status, loadMore } = usePaginatedQuery(api.survey.listPaginated, queryArgs, {
    initialNumItems: PAGE_SIZE,
  });

  const isLoading = status === 'LoadingFirstPage';
  const isLoadingMore = status === 'LoadingMore';

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <SafeAreaView edges={['top']} className="bg-surface-light dark:bg-surface-dark border-b border-line-subtle">
        <View className="px-4 pt-2 pb-3">
          <Text className="text-h1 font-medium text-ink-primary-light dark:text-ink-primary-dark">Surveys</Text>
          <Text className="text-helper text-ink-tertiary-light mt-0.5">Sorted by Property ID</Text>
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

      {isLoading ? (
        <Spinner label="Loading…" />
      ) : results.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="No surveys here"
          message="Try a different filter or start a new survey."
        />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(s) => s._id}
          contentContainerStyle={{ padding: 14, paddingBottom: tabPad }}
          {...flatListProps}
          ItemSeparatorComponent={() => <View className="h-2" />}
          onEndReached={() => {
            if (status === 'CanLoadMore') loadMore(PAGE_SIZE);
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isLoadingMore ? (
              <View className="py-4 items-center">
                <ActivityIndicator />
              </View>
            ) : null
          }
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
