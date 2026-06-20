import { AppButton, AppCard, AppDropdown, Banner, SectionLabel } from '@/components';
import { RoleGate } from '@/components/role-gate';
import { api } from '@/convex/_generated/api';
import { humanizeRole } from '@/utils/format';
import type { FunctionReturnType } from 'convex/server';
import { useRef } from 'react';
import { Text, View } from 'react-native';

type AdminUser = NonNullable<FunctionReturnType<typeof api.admin.getUserForAdmin>>;
type TenantTree = FunctionReturnType<typeof api.tenants.listForAdmin>;

export type AllotmentDraftRow = {
  id: string;
  scope: 'ulb' | 'district';
  districtId: string;
  municipalityId: string;
  isActive: boolean;
};

export function AssignUserProfileCard({ user }: { user: AdminUser }) {
  return (
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
  );
}

export function AssignAllotmentEditor({
  user,
  tree,
  rows,
  districtOptions,
  onRowsChange,
}: {
  user: AdminUser;
  tree: TenantTree;
  rows: AllotmentDraftRow[];
  districtOptions: { value: string; label: string }[];
  onRowsChange: (updater: (rows: AllotmentDraftRow[]) => AllotmentDraftRow[]) => void;
}) {
  const nextRowIdRef = useRef(0);

  if (user.role !== 'surveyor' && user.role !== 'supervisor') {
    return (
      <Banner
        tone="warning"
        title="Not a field role"
        message="Only surveyors and supervisors need district and ULB assignment."
        icon="alert-circle-outline"
      />
    );
  }

  return (
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
                onRowsChange((all) =>
                  all.map((r, i) => (i === idx ? { ...r, scope: v as 'ulb' | 'district', municipalityId: '' } : r)),
                )
              }
            />
            <View className="h-3" />
            <AppDropdown
              placeholder="District"
              value={row.districtId}
              options={districtOptions}
              onChange={(id) =>
                onRowsChange((all) => all.map((r, i) => (i === idx ? { ...r, districtId: id, municipalityId: '' } : r)))
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
                    onRowsChange((all) => all.map((r, i) => (i === idx ? { ...r, municipalityId: id } : r)))
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
                onRowsChange((all) => all.map((r, i) => (i === idx ? { ...r, isActive: v === 'active' } : r)))
              }
            />
            {rows.length > 1 ? (
              <AppButton
                label="Remove row"
                variant="ghost"
                className="mt-2"
                onPress={() => onRowsChange((all) => all.filter((_, i) => i !== idx))}
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
          onRowsChange((all) => [
            ...all,
            {
              id: `new-${++nextRowIdRef.current}`,
              scope: 'ulb',
              districtId: tree?.[0]?._id ?? '',
              municipalityId: '',
              isActive: true,
            },
          ])
        }
      />
    </>
  );
}

export function AssignUserAccessControl({
  user,
  statusBusy,
  canManageStatus,
  onDisable,
  onReactivate,
}: {
  user: AdminUser;
  statusBusy: boolean;
  canManageStatus: boolean;
  onDisable: () => void;
  onReactivate: () => void;
}) {
  return (
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
  );
}

export function AssignUserSaveBar({
  visible,
  submitting,
  canSave,
  bottomInset,
  onSave,
}: {
  visible: boolean;
  submitting: boolean;
  canSave: boolean;
  bottomInset: number;
  onSave: () => void;
}) {
  if (!visible) return null;

  return (
    <View
      className="absolute left-0 right-0 bottom-0 px-4 pt-3 border-t border-line-subtle bg-surface-light dark:bg-surface-dark"
      style={{ paddingBottom: bottomInset + 12 }}
    >
      <AppButton
        label={submitting ? 'Saving…' : 'Save allotments'}
        loading={submitting}
        onPress={onSave}
        disabled={!canSave}
        fullWidth
      />
    </View>
  );
}
