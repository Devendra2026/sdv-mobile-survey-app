/**
 * Assign district + ULB to an active surveyor or supervisor.
 */
import { AppButton, AppCard, AppDropdown, Banner, SectionLabel, Spinner, Toast } from '@/components';
import { AdminHeader } from '@/components/admin/admin-header';
import { RoleGate } from '@/components/role-gate';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { toUserMessage } from '@/utils/errors';
import { humanizeRole } from '@/utils/format';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AssignUserScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { convexReady } = useClerkConvexAuth();

  const users = useQuery(api.admin.listUsers, convexReady ? {} : 'skip');
  const tree = useQuery(api.tenants.listForAdmin, convexReady ? {} : 'skip');
  const setAllotments = useMutation(api.allotments.setForUser);
  const existingAllotments = useQuery(
    api.allotments.listForUser,
    convexReady && userId ? { userId: userId as Id<'users'> } : 'skip',
  );
  const updateUser = useMutation(api.admin.updateUser);

  const user = users?.find((u) => u._id === userId);

  type DraftRow = {
    id: string;
    scope: 'ulb' | 'district';
    districtId: string;
    municipalityId: string;
    isActive: boolean;
  };
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);

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
  }, [existingAllotments, user?._id, user?.districtId, user?.municipalityId, tree]);

  if (!userId) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-body text-ink-tertiary-light">No user selected</Text>
      </View>
    );
  }

  if (users === undefined || tree === undefined) {
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
    const payload = rows
      .filter((r) => (r.scope === 'ulb' ? r.municipalityId : r.districtId))
      .map((r) => ({
        isActive: r.isActive,
        municipalityId: r.scope === 'ulb' ? (r.municipalityId as Id<'municipalities'>) : undefined,
        districtId: r.scope === 'district' ? (r.districtId as Id<'districts'>) : undefined,
      }));
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

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 100 + insets.bottom }}>
        <AppCard padded className="mb-4">
          <Text className="text-body text-ink-primary-light dark:text-ink-primary-dark">{user.email}</Text>
          <Text className="text-caption text-ink-tertiary-light mt-1">
            {humanizeRole(user.role)} · {user.status}
          </Text>
          {user.municipalityName ? (
            <Text className="text-helper text-ink-secondary-light mt-2">
              Current: {user.districtName ?? '—'} · {user.municipalityName}
              {user.municipalityCode ? ` (${user.municipalityCode})` : ''}
            </Text>
          ) : (
            <Text className="text-helper text-warning mt-2">No district / ULB assigned yet</Text>
          )}
        </AppCard>

        {user.role !== 'surveyor' && user.role !== 'supervisor' ? (
          <Banner
            tone="warning"
            title="Not a field role"
            message="Only surveyors and supervisors need district and ULB assignment."
            icon="alert-circle-outline"
          />
        ) : (
          <>
            <Banner
              tone="info"
              title="Multi-city supervisors"
              message="Add one row per district or ULB (e.g. Agra MC, Mathura district, Hathras MC). Inactive rows keep history but remove access."
              icon="information-circle-outline"
              className="mb-4"
            />

            {rows.map((row, idx) => {
              const ulbOptions =
                tree
                  ?.find((d) => d._id === row.districtId)
                  ?.ulbs.map((u) => ({ value: u._id, label: `${u.name} · ${u.code}` })) ?? [];
              return (
                <AppCard key={row.id} padded className="mb-3">
                  <AppDropdown
                    placeholder="Scope"
                    value={row.scope}
                    options={[
                      { value: 'ulb', label: 'Single ULB (city)' },
                      { value: 'district', label: 'Whole district' },
                    ]}
                    onChange={(v) =>
                      setRows((all) =>
                        all.map((r, i) =>
                          i === idx ? { ...r, scope: v as 'ulb' | 'district', municipalityId: '' } : r,
                        ),
                      )
                    }
                  />
                  <View className="h-3" />
                  <AppDropdown
                    placeholder="District"
                    value={row.districtId}
                    options={districtOptions}
                    onChange={(id) =>
                      setRows((all) =>
                        all.map((r, i) => (i === idx ? { ...r, districtId: id, municipalityId: '' } : r)),
                      )
                    }
                  />
                  {row.scope === 'ulb' ? (
                    <>
                      <View className="h-3" />
                      <AppDropdown
                        placeholder="ULB"
                        value={row.municipalityId}
                        options={ulbOptions}
                        onChange={(id) =>
                          setRows((all) => all.map((r, i) => (i === idx ? { ...r, municipalityId: id } : r)))
                        }
                        disabled={!row.districtId}
                      />
                    </>
                  ) : null}
                  <View className="h-3" />
                  <AppDropdown
                    placeholder="Status"
                    value={row.isActive ? 'active' : 'inactive'}
                    options={[
                      { value: 'active', label: 'Active' },
                      { value: 'inactive', label: 'Inactive' },
                    ]}
                    onChange={(v) =>
                      setRows((all) => all.map((r, i) => (i === idx ? { ...r, isActive: v === 'active' } : r)))
                    }
                  />
                  {rows.length > 1 ? (
                    <AppButton
                      label="Remove row"
                      variant="ghost"
                      className="mt-2"
                      onPress={() => setRows((all) => all.filter((_, i) => i !== idx))}
                    />
                  ) : null}
                </AppCard>
              );
            })}
            <AppButton
              label="Add allotment"
              variant="outline"
              iconLeft="add-outline"
              onPress={() =>
                setRows((all) => [
                  ...all,
                  {
                    id: `new-${Date.now()}`,
                    scope: 'ulb',
                    districtId: tree?.[0]?._id ?? '',
                    municipalityId: '',
                    isActive: true,
                  },
                ])
              }
            />
          </>
        )}

        <RoleGate capability="users.disable">
          {canManageStatus ? (
            <>
              <SectionLabel>Access control</SectionLabel>
              <AppCard padded className="mb-4">
                {user.status === 'disabled' ? (
                  <AppButton
                    label={statusBusy ? 'Reactivating…' : 'Reactivate user'}
                    variant="outline"
                    iconLeft="checkmark-circle-outline"
                    loading={statusBusy}
                    onPress={onReactivate}
                    fullWidth
                  />
                ) : (
                  <AppButton
                    label={statusBusy ? 'Disabling…' : 'Disable user'}
                    variant="outline"
                    iconLeft="ban-outline"
                    loading={statusBusy}
                    onPress={onDisable}
                    fullWidth
                  />
                )}
              </AppCard>
            </>
          ) : null}
        </RoleGate>
      </ScrollView>

      {user.role === 'surveyor' || user.role === 'supervisor' ? (
        <View
          className="absolute left-0 right-0 bottom-0 px-4 pt-3 border-t border-line-subtle bg-surface-light dark:bg-surface-dark"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <AppButton
            label={submitting ? 'Saving…' : 'Save allotments'}
            loading={submitting}
            onPress={onSave}
            disabled={!canSave}
            fullWidth
          />
        </View>
      ) : null}

      {toast ? <Toast visible title={toast.title} tone={toast.tone} onHide={() => setToast(null)} /> : null}
    </View>
  );
}
