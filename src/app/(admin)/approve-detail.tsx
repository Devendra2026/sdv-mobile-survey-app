/**
 * Approval detail — admin picks role, district, ULB; ward is chosen at survey start.
 */
import {
  AppButton,
  AppCard,
  AppDropdown,
  Avatar,
  Banner,
  RadioGroup,
  SectionLabel,
  Spinner,
  Tag,
  Toast,
} from '@/components';
import { AdminHeader } from '@/components/admin/admin-header';
import { WorkflowSteps } from '@/components/admin/workflow-steps';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { toUserMessage } from '@/utils/errors';
import { BottomBarClearance } from '@/utils/ui-layout';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useReducer } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Role = 'surveyor' | 'supervisor' | 'admin';

type ApproveState = {
  role: Role;
  districtId: string;
  municipalityId: string;
  submitting: boolean;
  toast: { title: string; tone: 'success' | 'danger' } | null;
};

type ApproveAction =
  | { type: 'setRole'; role: Role }
  | { type: 'setDistrict'; districtId: string }
  | { type: 'setMunicipality'; municipalityId: string }
  | { type: 'setSubmitting'; submitting: boolean }
  | { type: 'setToast'; toast: ApproveState['toast'] }
  | { type: 'clearToast' };

const initialApproveState: ApproveState = {
  role: 'surveyor',
  districtId: '',
  municipalityId: '',
  submitting: false,
  toast: null,
};

function approveReducer(state: ApproveState, action: ApproveAction): ApproveState {
  switch (action.type) {
    case 'setRole':
      return action.role === 'admin'
        ? { ...state, role: action.role, districtId: '', municipalityId: '' }
        : { ...state, role: action.role };
    case 'setDistrict':
      return { ...state, districtId: action.districtId, municipalityId: '' };
    case 'setMunicipality':
      return { ...state, municipalityId: action.municipalityId };
    case 'setSubmitting':
      return { ...state, submitting: action.submitting };
    case 'setToast':
      return { ...state, toast: action.toast };
    case 'clearToast':
      return { ...state, toast: null };
    default:
      return state;
  }
}

export default function ApproveDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = params.userId as Id<'users'> | undefined;
  const { convexReady } = useClerkConvexAuth();

  const tree = useQuery(api.tenants.listForAdmin, convexReady ? {} : 'skip');
  const pendingList = useQuery(api.admin.listPendingApprovals, convexReady ? {} : 'skip');
  const approve = useMutation(api.admin.approveUser);
  const rejectUser = useMutation(api.admin.rejectUser);

  const [state, dispatch] = useReducer(approveReducer, initialApproveState);
  const hideToast = useCallback(() => dispatch({ type: 'clearToast' }), []);

  const districtOptions = useMemo(
    () => tree?.map((d) => ({ value: d._id, label: `${d.name} (${d.stateName})` })) ?? [],
    [tree],
  );

  const ulbOptions = useMemo(() => {
    if (!tree || !state.districtId) return [];
    const district = tree.find((d) => d._id === state.districtId);
    if (!district) return [];
    return district.ulbs.map((u) => ({
      value: u._id,
      label: `${u.name} · ${u.code}`,
    }));
  }, [tree, state.districtId]);

  const user = pendingList?.find((u) => u._id === userId);
  const selectedUlb = tree?.flatMap((d) => d.ulbs).find((u) => u._id === state.municipalityId);
  const scopeReady = state.role === 'admin' || (!!state.districtId && !!state.municipalityId);
  const workflowStep = scopeReady ? 2 : 1;

  if (!userId) {
    return (
      <View className="flex-1 items-center justify-center bg-page-light dark:bg-page-dark p-6">
        <EmptyFallback
          icon="alert-circle-outline"
          title="No user selected"
          message="Go back to approvals and pick a request."
          onBack={() => router.back()}
        />
      </View>
    );
  }
  if (pendingList === undefined || tree === undefined) {
    return <Spinner label="Loading request…" />;
  }
  if (!user) {
    return (
      <View className="flex-1 bg-page-light dark:bg-page-dark">
        <AdminHeader title="Request handled" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center p-6">
          <Ionicons name="checkmark-circle" size={48} color="#16A34A" />
          <Text className="text-h2 font-medium text-ink-primary-light dark:text-ink-primary-dark mt-3 text-center">
            Already processed
          </Text>
          <Text className="text-helper text-ink-tertiary-light text-center mt-1">
            This sign-up was approved or rejected. Check Users for their status.
          </Text>
          <AppButton label="Back to approvals" onPress={() => router.replace('/(admin)/approvals')} className="mt-6" />
        </View>
      </View>
    );
  }

  const onReject = () => {
    Alert.alert('Reject this request?', `${user.name} will not receive access.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          dispatch({ type: 'setSubmitting', submitting: true });
          try {
            await rejectUser({ userId });
            dispatch({ type: 'setToast', toast: { title: 'Request rejected', tone: 'success' } });
            setTimeout(() => router.back(), 600);
          } catch (e) {
            dispatch({ type: 'setToast', toast: { title: toUserMessage(e), tone: 'danger' } });
          } finally {
            dispatch({ type: 'setSubmitting', submitting: false });
          }
        },
      },
    ]);
  };

  const handleApprove = async () => {
    dispatch({ type: 'setSubmitting', submitting: true });
    try {
      await approve({
        userId,
        role: state.role,
        municipalityId: state.municipalityId ? (state.municipalityId as Id<'municipalities'>) : undefined,
        districtId: state.districtId ? (state.districtId as Id<'districts'>) : undefined,
        wardAssignments: [],
      });
      dispatch({ type: 'setToast', toast: { title: `${user.name} approved`, tone: 'success' } });
      setTimeout(() => router.back(), 700);
    } catch (e) {
      dispatch({ type: 'setToast', toast: { title: toUserMessage(e), tone: 'danger' } });
    } finally {
      dispatch({ type: 'setSubmitting', submitting: false });
    }
  };

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <AdminHeader
        title="Review request"
        subtitle={user.name}
        onBack={() => router.back()}
        right={
          <Pressable onPress={onReject} hitSlop={8} className="px-2 py-1">
            <Text className="text-caption font-medium text-white/90">Reject</Text>
          </Pressable>
        }
        footer={
          <View className="mt-3 bg-white/10 rounded-xl px-2 py-2">
            <WorkflowSteps
              steps={[
                { label: 'Review', done: true },
                { label: 'Assign', active: workflowStep === 1, done: workflowStep === 2 },
                { label: 'Approve', active: workflowStep === 2, done: false },
              ]}
            />
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
        contentInset={Platform.OS === 'ios' ? { bottom: insets.bottom } : undefined}
        keyboardShouldPersistTaps="handled"
      >
        <AppCard padded className="mb-4">
          <View className="flex-row items-center">
            <Avatar name={user.name} tone="brand" size="lg" />
            <View className="flex-1 ml-3">
              <Text className="text-h3 font-medium text-ink-primary-light dark:text-ink-primary-dark">{user.name}</Text>
              <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark">{user.email}</Text>
            </View>
          </View>
          <View className="flex-row gap-1.5 mt-3">
            <Tag label={`Requested: ${user.requestedRole ?? '—'}`} tone="brand" icon="briefcase-outline" />
          </View>
          {user.requestedReason ? (
            <View className="mt-3 p-3 bg-page-light dark:bg-page-dark/40 rounded-lg">
              <Text className="text-caption text-ink-secondary-light dark:text-ink-secondary-dark">
                {user.requestedReason}
              </Text>
            </View>
          ) : null}
        </AppCard>

        <SectionLabel>1 · Grant role</SectionLabel>
        <AppCard padded className="mb-4">
          <RadioGroup<Role>
            items={[
              { value: 'surveyor', label: 'Surveyor', helper: 'Creates property surveys in assigned ULB' },
              { value: 'supervisor', label: 'Supervisor', helper: 'Reviews surveys in assigned ULB' },
              { value: 'admin', label: 'Admin', helper: 'Platform-wide administration' },
            ]}
            value={state.role}
            onChange={(r) => dispatch({ type: 'setRole', role: r })}
          />
        </AppCard>

        {state.role !== 'admin' ? (
          <>
            <SectionLabel>2 · District & ULB</SectionLabel>
            <AppCard padded className="mb-3">
              <View style={{ gap: 12 }}>
                <AppDropdown
                  placeholder="District"
                  value={state.districtId}
                  options={districtOptions}
                  onChange={(id) => dispatch({ type: 'setDistrict', districtId: id })}
                />
                <AppDropdown
                  placeholder="ULB name / code"
                  value={state.municipalityId}
                  options={ulbOptions}
                  onChange={(id) => dispatch({ type: 'setMunicipality', municipalityId: id })}
                  disabled={!state.districtId}
                />
              </View>
            </AppCard>
            <Banner
              tone="info"
              title="Ward at survey start"
              message={
                selectedUlb
                  ? `${user.name} will choose the ward when starting each survey in ${selectedUlb.name}.`
                  : 'The user picks the ward on the Survey start screen for each property.'
              }
              icon="information-circle-outline"
              className="mb-4"
            />
          </>
        ) : (
          <Banner
            tone="warning"
            title="Granting admin access"
            message="Admins manage users, approvals, and all master data. Confirm this is intended."
            icon="warning-outline"
            className="mb-4"
          />
        )}
        {Platform.OS === 'android' ? <BottomBarClearance height={insets.bottom} /> : null}
      </ScrollView>

      <View
        className="absolute left-0 right-0 bottom-0 px-4 pt-3 border-t border-line-subtle bg-surface-light dark:bg-surface-dark"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <AppButton
          label={state.submitting ? 'Approving…' : 'Approve and grant access'}
          loading={state.submitting}
          onPress={handleApprove}
          disabled={!scopeReady}
          fullWidth
          iconRight="checkmark-circle"
        />
        {!scopeReady ? (
          <Text className="text-caption text-ink-tertiary-light text-center mt-2">Select district and ULB.</Text>
        ) : null}
      </View>

      {state.toast ? <Toast visible title={state.toast.title} tone={state.toast.tone} onHide={hideToast} /> : null}
    </View>
  );
}

function EmptyFallback({
  icon,
  title,
  message,
  onBack,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  onBack: () => void;
}) {
  return (
    <>
      <Ionicons name={icon} size={40} color="#9AA3AF" />
      <Text className="text-h3 font-medium text-ink-primary-light mt-3">{title}</Text>
      <Text className="text-helper text-ink-tertiary-light text-center mt-1">{message}</Text>
      <AppButton label="Go back" variant="outline" onPress={onBack} className="mt-5" />
    </>
  );
}
