/**
 * Awaiting-approval screen.
 *
 * Shown to users who've completed sign-up but whose admin has not yet
 * approved them. We reactively read `currentUser` — the moment an admin
 * flips `status` to `active`, Convex pushes the update and AuthGate
 * routes the user into the app.
 */
import { AppButton, AppCard, Avatar, ListRow, PulseDot, Tag } from '@/components';
import { AppLoadingView } from '@/components/app-loading-view';
import { useSyncConvexUser } from '@/hooks/use-sync-convex-user';
import { timeAgo } from '@/utils/format';
import { useAuth } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AwaitingApprovalScreen() {
  const { signOut } = useAuth();
  const { me, syncing } = useSyncConvexUser();
  const [, setRefreshTick] = useState(0);

  // Refresh the "Submitted N min ago" line every minute (`timeAgo` uses Date.now()).
  useEffect(() => {
    const t = setInterval(() => setRefreshTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!me) {
    return <AppLoadingView message={syncing ? 'Setting up your account…' : 'Loading your profile…'} />;
  }

  const isDisabled = me.status === 'disabled';

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <SafeAreaView edges={['top']} className="bg-brand">
        <View className="items-center py-7">
          <Avatar name={me.name} tone="brand" size="xl" />
          <Text className="text-h2 font-medium text-white mt-2.5">{me.name}</Text>
          <Text className="text-caption text-white/75 mt-0.5">{me.email}</Text>
          <View className="flex-row items-center bg-white/15 px-2.5 py-1 rounded-full mt-3 gap-1.5">
            <PulseDot tone={isDisabled ? 'danger' : 'warning'} />
            <Text className="text-[11px] font-medium text-white">
              {isDisabled ? 'Access not granted' : 'Awaiting approval'}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32 }}>
        <AppCard padded className="mb-4">
          <View className="flex-row items-start">
            <View
              className={`w-9 h-9 rounded-full items-center justify-center ${isDisabled ? 'bg-danger-soft' : 'bg-warning-soft'}`}
            >
              <Ionicons
                name={isDisabled ? 'close-circle-outline' : 'hourglass-outline'}
                size={18}
                color={isDisabled ? '#B91C1C' : '#92400E'}
              />
            </View>
            <View className="flex-1 ml-3">
              <Text className="text-body font-medium text-ink-primary-light dark:text-ink-primary-dark">
                {isDisabled ? 'Your access request was not approved' : 'Your account is being reviewed'}
              </Text>
              <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark mt-1">
                {isDisabled
                  ? 'Contact your municipality administrator if you believe this was a mistake.'
                  : "An administrator from your municipality will approve access shortly. This page will update automatically once you're approved — no need to refresh."}
              </Text>
            </View>
          </View>
        </AppCard>

        {!isDisabled ? (
          <>
            <Text className="text-label uppercase tracking-wider font-medium text-ink-secondary-light mb-2">
              Your request
            </Text>
            <AppCard padded={false} className="mb-4">
              <ListRow
                icon="briefcase-outline"
                iconTone="brand"
                title="Role"
                subtitle={me.requestedRole ?? 'Not specified'}
                showChevron={false}
              />
              <View className="h-px bg-line-subtle" />
              <ListRow
                icon="chatbubble-outline"
                iconTone="neutral"
                title="Reason"
                subtitle={me.requestedReason || '—'}
                showChevron={false}
              />
              <View className="h-px bg-line-subtle" />
              <ListRow
                icon="time-outline"
                iconTone="neutral"
                title="Submitted"
                subtitle={timeAgo(me._creationTime)}
                showChevron={false}
              />
            </AppCard>

            <Text className="text-label uppercase tracking-wider font-medium text-ink-secondary-light mb-2">
              What happens next
            </Text>
            <AppCard padded className="mb-4">
              <Step n={1} title="Administrator reviews your request" body="Typically within 1 business day." />
              <Step
                n={2}
                title="Role and wards are assigned"
                body="You'll be given access to specific wards in your municipality."
              />
              <Step n={3} title="You're notified and routed to the app" body="This screen will change automatically." />
            </AppCard>

            <View className="flex-row gap-1.5 mb-4">
              <Tag label="Sign-up complete" tone="success" icon="checkmark-circle" />
              <Tag label="Email verified" tone="success" icon="mail-open" />
            </View>
          </>
        ) : null}

        <AppButton label="Sign out" variant="outline" iconLeft="log-out-outline" onPress={() => signOut()} fullWidth />
      </ScrollView>
    </View>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <View className="flex-row items-start mb-3 last:mb-0">
      <View className="w-7 h-7 rounded-full bg-brand-soft items-center justify-center">
        <Text className="text-[11px] font-medium text-brand">{n}</Text>
      </View>
      <View className="flex-1 ml-3">
        <Text className="text-[13px] font-medium text-ink-primary-light dark:text-ink-primary-dark">{title}</Text>
        <Text className="text-caption text-ink-tertiary-light dark:text-ink-tertiary-dark mt-0.5">{body}</Text>
      </View>
    </View>
  );
}
