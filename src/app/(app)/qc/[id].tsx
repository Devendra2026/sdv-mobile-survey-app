/**
 * QC remark thread for a survey — surveyor and supervisor conversation.
 */
import { AppButton, AppCard, AppInput, Banner, Spinner, Tag, Toast } from '@/components';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toUserMessage } from '@/utils/errors';
import { formatSurveyParcelLabel, timeAgo } from '@/utils/format';
import { flatListProps } from '@/utils/scroll-props';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RemarkItem = FunctionReturnType<typeof api.qc.listRemarks>[number];

const RemarkRow = memo(function RemarkRow({
  item,
  onResolve,
}: {
  item: RemarkItem;
  onResolve: (id: Id<'qcRemarks'>) => void;
}) {
  return (
    <AppCard padded className="mb-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Tag label={item.authorRole} tone={item.authorRole === 'surveyor' ? 'neutral' : 'brand'} />
          <Text className="text-caption text-ink-tertiary-light">
            {item.author?.name ?? 'Unknown'} · {timeAgo(item._creationTime)}
          </Text>
        </View>
        {item.status === 'open' ? (
          <Pressable onPress={() => onResolve(item._id)} hitSlop={6} className="flex-row items-center">
            <Ionicons name="checkmark-circle-outline" size={16} color="#003B8E" />
            <Text className="ml-1 text-helper text-brand">Resolve</Text>
          </Pressable>
        ) : (
          <Tag label="Resolved" tone="success" icon="checkmark" />
        )}
      </View>
      <Text className="mt-2 text-body text-ink-primary-light dark:text-ink-primary-dark">{item.message}</Text>
    </AppCard>
  );
});

export default function QcConversationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const surveyId = params.id as Id<'surveys'> | undefined;

  const survey = useQuery(api.survey.get, surveyId ? { id: surveyId } : 'skip');
  const remarks = useQuery(api.qc.listRemarks, surveyId ? { surveyId } : 'skip');
  const addRemark = useMutation(api.qc.addRemark);
  const resolveRemark = useMutation(api.qc.resolveRemark);

  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);

  const onResolve = useCallback(
    (id: Id<'qcRemarks'>) => {
      void resolveRemark({ id });
    },
    [resolveRemark],
  );

  const renderItem = useCallback(
    ({ item }: { item: RemarkItem }) => <RemarkRow item={item} onResolve={onResolve} />,
    [onResolve],
  );

  if (!surveyId) {
    return (
      <View className="flex-1 items-center justify-center bg-page-light p-6">
        <Text className="text-h3 text-ink-primary-light">Survey not found</Text>
      </View>
    );
  }

  if (survey === undefined || remarks === undefined) {
    return <Spinner label="Loading conversation…" />;
  }

  if (survey === null) {
    return (
      <View className="flex-1 items-center justify-center bg-page-light p-6">
        <Text className="text-h3 text-ink-primary-light">Survey not found</Text>
        <AppButton label="Go back" variant="outline" onPress={() => router.back()} className="mt-4" />
      </View>
    );
  }

  const send = async () => {
    const text = message.trim();
    if (!text) return;
    setBusy(true);
    try {
      await addRemark({ surveyId, message: text });
      setMessage('');
      setToast({ title: 'Remark sent', tone: 'success' });
    } catch (e) {
      setToast({ title: toUserMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <SafeAreaView edges={['top']} className="bg-brand">
        <View className="px-4 py-3 flex-row items-center">
          <Pressable onPress={() => router.back()} hitSlop={8} className="w-9 h-9 items-center justify-center">
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </Pressable>
          <View className="flex-1 ml-1">
            <Text className="text-helper text-white/75">QC conversation</Text>
            <Text className="text-h3 font-medium text-white" numberOfLines={1}>
              {formatSurveyParcelLabel(survey.parcelNo, survey.unitNo)}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        {survey.status === 'draft' ? (
          <Banner
            tone="info"
            title="Draft survey"
            message="Submit the survey before supervisors can review it in QC."
            icon="information-circle-outline"
            className="mx-3.5 mt-3"
          />
        ) : null}

        <FlatList
          data={remarks}
          keyExtractor={(r) => r._id}
          {...flatListProps}
          contentContainerStyle={{ padding: 14, paddingBottom: 12, flexGrow: 1 }}
          ListEmptyComponent={
            <AppCard padded>
              <Text className="text-center text-helper text-ink-tertiary-light">
                No remarks yet. Start the conversation below.
              </Text>
            </AppCard>
          }
          renderItem={renderItem}
        />

        <View className="border-t border-line-subtle bg-surface-light dark:bg-surface-dark px-3.5 pt-3 pb-4">
          <AppInput
            label="Your message"
            value={message}
            onChangeText={setMessage}
            placeholder="Ask a question or note what was fixed…"
          />
          <AppButton
            label={busy ? 'Sending…' : 'Send remark'}
            loading={busy}
            disabled={!message.trim()}
            onPress={() => void send()}
            iconLeft="send-outline"
            fullWidth
            className="mt-2"
          />
        </View>
      </KeyboardAvoidingView>

      {toast ? <Toast visible title={toast.title} tone={toast.tone} onHide={() => setToast(null)} /> : null}
    </View>
  );
}
