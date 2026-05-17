/**
 * Assign district + ULB to an active surveyor or supervisor.
 */
import { AppButton, AppCard, AppDropdown, Banner, SectionLabel, Spinner, Toast } from '@/components';
import { AdminHeader } from '@/components/admin/admin-header';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { toUserMessage } from '@/utils/errors';
import { humanizeRole } from '@/utils/format';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AssignUserScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { convexReady } = useClerkConvexAuth();

  const users = useQuery(api.admin.listUsers, convexReady ? {} : 'skip');
  const tree = useQuery(api.tenants.listForAdmin, convexReady ? {} : 'skip');
  const assignTenant = useMutation(api.admin.assignTenant);

  const user = users?.find((u) => u._id === userId);

  const [districtId, setDistrictId] = useState('');
  const [municipalityId, setMunicipalityId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);

  const districtOptions = useMemo(
    () => tree?.map((d) => ({ value: d._id, label: `${d.name} (${d.stateName})` })) ?? [],
    [tree],
  );

  const ulbOptions = useMemo(() => {
    if (!tree || !districtId) return [];
    const district = tree.find((d) => d._id === districtId);
    if (!district) return [];
    return district.ulbs.map((u) => ({
      value: u._id,
      label: `${u.name} · ${u.code}`,
    }));
  }, [tree, districtId]);

  const canSave = Boolean(municipalityId) && (user?.role === 'surveyor' || user?.role === 'supervisor');

  useEffect(() => {
    if (!user) return;
    if (user.districtId) setDistrictId(user.districtId);
    if (user.municipalityId) setMunicipalityId(user.municipalityId);
  }, [user?._id, user?.districtId, user?.municipalityId]);

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
    if (!municipalityId) return;
    setSubmitting(true);
    try {
      await assignTenant({
        userId: user._id,
        municipalityId: municipalityId as Id<'municipalities'>,
        wardAssignments: [],
      });
      setToast({ title: 'Assignment saved', tone: 'success' });
      setTimeout(() => router.back(), 600);
    } catch (e) {
      setToast({ title: toUserMessage(e), tone: 'danger' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <AdminHeader title="Assign tenant" subtitle={user.name} onBack={() => router.back()} />

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
              title="Ward chosen at survey start"
              message="Assign district and ULB here. The user picks the ward when they start each survey."
              icon="information-circle-outline"
              className="mb-4"
            />

            <SectionLabel>District</SectionLabel>
            <AppCard padded className="mb-4">
              <AppDropdown
                placeholder="Select district"
                value={districtId}
                options={districtOptions}
                onChange={(id) => {
                  setDistrictId(id);
                  setMunicipalityId('');
                }}
              />
            </AppCard>

            <SectionLabel>ULB</SectionLabel>
            <AppCard padded className="mb-4">
              <AppDropdown
                placeholder="Select ULB"
                value={municipalityId}
                options={ulbOptions}
                onChange={setMunicipalityId}
                disabled={!districtId}
              />
              {districtId && ulbOptions.length === 0 ? (
                <Text className="text-caption text-ink-tertiary-light mt-2">
                  No ULBs in this district. Add one under Tenants.
                </Text>
              ) : null}
            </AppCard>
          </>
        )}
      </ScrollView>

      {user.role === 'surveyor' || user.role === 'supervisor' ? (
        <View
          className="absolute left-0 right-0 bottom-0 px-4 pt-3 border-t border-line-subtle bg-surface-light dark:bg-surface-dark"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <AppButton
            label={submitting ? 'Saving…' : 'Save assignment'}
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
