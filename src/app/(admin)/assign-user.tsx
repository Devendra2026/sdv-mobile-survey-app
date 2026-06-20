/**
 * Assign district + ULB to an active surveyor or supervisor.
 */
import { Spinner, Toast } from '@/components';
import { AdminHeader } from '@/components/admin/admin-header';
import {
  AssignAllotmentEditor,
  AssignUserAccessControl,
  AssignUserProfileCard,
  AssignUserSaveBar,
  type AllotmentDraftRow,
} from '@/components/admin/assign-user-sections';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { toUserMessage } from '@/utils/errors';
import { BottomBarClearance } from '@/utils/ui-layout';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function rowsToAllotmentPayload(rows: AllotmentDraftRow[]) {
  const payload: {
    isActive: boolean;
    municipalityId?: Id<'municipalities'>;
    districtId?: Id<'districts'>;
  }[] = [];
  for (const r of rows) {
    if (r.scope === 'ulb' ? !r.municipalityId : !r.districtId) continue;
    payload.push({
      isActive: r.isActive,
      municipalityId: r.scope === 'ulb' ? (r.municipalityId as Id<'municipalities'>) : undefined,
      districtId: r.scope === 'district' ? (r.districtId as Id<'districts'>) : undefined,
    });
  }
  return payload;
}

export default function AssignUserScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { convexReady } = useClerkConvexAuth();

  const user = useQuery(api.admin.getUserForAdmin, convexReady && userId ? { userId: userId as Id<'users'> } : 'skip');
  const tree = useQuery(api.tenants.listForAdmin, convexReady ? {} : 'skip');
  const setAllotments = useMutation(api.allotments.setForUser);
  const existingAllotments = useQuery(
    api.allotments.listForUser,
    convexReady && userId ? { userId: userId as Id<'users'> } : 'skip',
  );
  const updateUser = useMutation(api.admin.updateUser);

  const [rows, setRows] = useState<AllotmentDraftRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const districtOptions = useMemo(
    () => tree?.map((d) => ({ value: d._id, label: `${d.name} (${d.stateName})` })) ?? [],
    [tree],
  );

  const canSave =
    rows.some((r) => (r.scope === 'ulb' ? r.municipalityId : r.districtId)) &&
    (user?.role === 'surveyor' || user?.role === 'supervisor');

  useEffect(() => {
    if (!existingAllotments) return;
    if (existingAllotments.length > 0) {
      setRows(
        existingAllotments.map((a) => ({
          id: a._id,
          scope: a.municipalityId ? 'ulb' : 'district',
          districtId: a.districtId ?? '',
          municipalityId: a.municipalityId ?? '',
          isActive: a.isActive,
        })),
      );
      return;
    }
    if (!user || !tree?.length) return;
    setRows([
      {
        id: 'default',
        scope: 'ulb',
        districtId: user.districtId ?? tree[0]._id,
        municipalityId: user.municipalityId ?? '',
        isActive: true,
      },
    ]);
  }, [existingAllotments, user, tree]);

  if (!userId) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-body text-ink-tertiary-light">No user selected</Text>
      </View>
    );
  }

  if (user === undefined || tree === undefined) {
    return <Spinner label="Loading…" />;
  }

  if (!user) {
    return (
      <View className="flex-1 bg-page-light dark:bg-page-dark p-6">
        <AdminHeader title="User not found" onBack={() => router.back()} />
      </View>
    );
  }

  const onSave = async () => {
    const payload = rowsToAllotmentPayload(rows);
    if (payload.length === 0) return;
    setSubmitting(true);
    try {
      await setAllotments({ userId: user._id, allotments: payload });
      setToast({ title: 'Allotments saved', tone: 'success' });
      setTimeout(() => router.back(), 600);
    } catch (e) {
      setToast({ title: toUserMessage(e), tone: 'danger' });
    } finally {
      setSubmitting(false);
    }
  };

  const onDisable = () => {
    Alert.alert('Disable account?', `${user.name} will lose access on all devices until reactivated.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disable',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setStatusBusy(true);
            try {
              await updateUser({ userId: user._id, status: 'disabled' });
              setToast({ title: 'User disabled', tone: 'success' });
            } catch (e) {
              setToast({ title: toUserMessage(e), tone: 'danger' });
            } finally {
              setStatusBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const onReactivate = () => {
    Alert.alert('Reactivate account?', `${user.name} will regain access with their current role and scope.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reactivate',
        onPress: () => {
          void (async () => {
            setStatusBusy(true);
            try {
              await updateUser({ userId: user._id, status: 'active' });
              setToast({ title: 'User reactivated', tone: 'success' });
            } catch (e) {
              setToast({ title: toUserMessage(e), tone: 'danger' });
            } finally {
              setStatusBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const canManageStatus = user.role !== 'admin' && user.status !== 'pending_approval';

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <AdminHeader title="City allotments" subtitle={user.name} onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 100 }}
        contentInset={Platform.OS === 'ios' ? { bottom: insets.bottom } : undefined}
        keyboardShouldPersistTaps="handled"
      >
        <AssignUserProfileCard user={user} />
        <AssignAllotmentEditor
          user={user}
          tree={tree}
          rows={rows}
          districtOptions={districtOptions}
          onRowsChange={setRows}
        />
        <AssignUserAccessControl
          user={user}
          statusBusy={statusBusy}
          canManageStatus={canManageStatus}
          onDisable={onDisable}
          onReactivate={onReactivate}
        />
        {Platform.OS === 'android' ? <BottomBarClearance height={insets.bottom} /> : null}
      </ScrollView>

      <AssignUserSaveBar
        visible={user.role === 'surveyor' || user.role === 'supervisor'}
        submitting={submitting}
        canSave={!!canSave}
        bottomInset={insets.bottom}
        onSave={onSave}
      />

      {toast ? <Toast visible title={toast.title} tone={toast.tone} onHide={hideToast} /> : null}
    </View>
  );
}
