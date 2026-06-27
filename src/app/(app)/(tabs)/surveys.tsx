/**
 * Surveys list with status filter and cursor pagination.
 * Reactive: any survey created or updated appears without refresh.
 */
import { AppButton, EmptyState, ListSkeleton, SurveyCard } from '@/components';
import { api } from '@/convex/_generated/api';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { surveyOwnerListLabel } from '@/utils/format';
import { flatListProps } from '@/utils/scroll-props';
import { TabScreenBottomSpacer } from '@/utils/ui-layout';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, type ListRenderItemInfo, Pressable, Text, View } from 'react-native';
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

const ListSeparator = () => <View className="h-2" />;

export default function SurveysScreen() {
  const router = useRouter();
  const { convexReady } = useClerkConvexAuth();
  const me = useQuery(api.users.currentUser, convexReady ? {} : 'skip');
  const [filter, setFilter] = useState<StatusFilter>('all');

  const queryArgs = useMemo(
    () => ({
      status: filter === 'all' || filter === 'rejected' ? undefined : filter,
      qcStatus: filter === 'rejected' ? ('rejected' as const) : undefined,
      sortBy: filter === 'draft' ? ('updated' as const) : undefined,
    }),
    [filter],
  );

  const paginated = usePaginatedQuery(api.survey.listPaginated, queryArgs, {
    initialNumItems: PAGE_SIZE,
  });

  const results = paginated.results;
  const status = paginated.status;
  const loadMore = paginated.loadMore;

  const isLoading = status === 'LoadingFirstPage';
  const isLoadingMore = status === 'LoadingMore';
  const isDraftFilter = filter === 'draft';

  const sortedResults = useMemo(() => {
    if (!isDraftFilter) return results;
    return [...results].sort((a, b) => b.clientUpdatedAt - a.clientUpdatedAt);
  }, [isDraftFilter, results]);

  const onSurveyPress = useCallback(
    (item: (typeof results)[number]) => {
      const isOwnDraft = item.status === 'draft' && me && item.surveyorId === me._id;
      if (isOwnDraft) {
        router.push({ pathname: '/(app)/wizard', params: { surveyId: item._id } });
        return;
      }
      router.push({ pathname: '/(app)/survey/[id]', params: { id: item._id } });
    },
    [me, router],
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<(typeof results)[number]>) => (
      <SurveyCard
        parcelNo={item.parcelNo || 'Draft'}
        unitNo={item.unitNo || '—'}
        ownerName={surveyOwnerListLabel(item.owners, item.respondentName)}
        wardNo={item.wardNo || '—'}
        status={item.status}
        qcStatus={item.qcStatus}
        createdAt={item._creationTime}
        updatedAt={item.clientUpdatedAt}
        completionPct={item.completionPct}
        highlight={isDraftFilter && index === 0 ? 'recent' : 'none'}
        onPress={() => onSurveyPress(item)}
      />
    ),
    [isDraftFilter, onSurveyPress],
  );

  const keyExtractor = useCallback((s: (typeof results)[number]) => s._id, []);

  const listFooter = useCallback(
    () => (
      <>
        {isLoadingMore ? (
          <View className="py-4 items-center">
            <ActivityIndicator />
          </View>
        ) : null}
        <TabScreenBottomSpacer />
      </>
    ),
    [isLoadingMore],
  );

  const listSubtitle = isDraftFilter
    ? 'Sorted by last updated · tap own drafts to continue'
    : 'Sorted by Property ID · tap own drafts to continue';

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <SafeAreaView edges={['top']} className="bg-surface-light dark:bg-surface-dark border-b border-line-subtle">
        <View className="px-4 pt-2 pb-3">
          <Text className="text-h1 font-medium text-ink-primary-light dark:text-ink-primary-dark">Surveys</Text>
          <Text className="text-helper text-ink-tertiary-light mt-0.5">{listSubtitle}</Text>
        </View>
        <View className="px-4 pb-3 flex-row gap-2 items-center">
          <View className="flex-1 flex-row gap-1.5 flex-wrap">
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
        </View>
        <View className="px-4 pb-3">
          <AppButton
            label="Start new survey"
            iconLeft="add"
            size="md"
            onPress={() => router.push('/(app)/wizard')}
            fullWidth
          />
        </View>
      </SafeAreaView>

      {isLoading ? (
        <ListSkeleton count={6} />
      ) : sortedResults.length === 0 ? (
        <View className="flex-1 px-4">
          <EmptyState
            icon="document-text-outline"
            title="No surveys here"
            message="Try a different filter or start a new survey."
          />
          <AppButton
            label="Start new survey"
            iconLeft="add"
            onPress={() => router.push('/(app)/wizard')}
            fullWidth
            className="mt-4"
          />
        </View>
      ) : (
        <FlatList
          data={sortedResults}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ padding: 14 }}
          {...flatListProps}
          ItemSeparatorComponent={ListSeparator}
          onEndReached={() => {
            if (status === 'CanLoadMore') loadMore(PAGE_SIZE);
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={listFooter}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}
