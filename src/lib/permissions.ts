/**
 * permissions.ts — Role → capability matrix for the MOBILE UI.
 *
 * UI-gating convenience ONLY. Authoritative enforcement is server-side in
 * Convex (`requireRole`, tenancy checks, admin.ts). Never treat `can()` as
 * a security boundary.
 *
 * Keep in sync with sdv-front-new-app/lib/permissions.ts.
 */

/** Built-in roles; custom keys come from Convex `roles` table. */
export type Role = 'pending' | 'surveyor' | 'supervisor' | 'qc_supervisor' | 'admin' | (string & {});

export type Capability =
  | 'users.approve'
  | 'users.disable'
  | 'users.assignTenant'
  | 'users.view'
  | 'roles.manage'
  | 'tenants.manage'
  | 'masters.manage'
  | 'surveys.viewAll'
  | 'surveys.viewAssigned'
  | 'surveys.viewOwn'
  | 'surveys.editDraft'
  | 'surveys.submit'
  | 'surveys.uploadPhotos'
  | 'surveys.delete'
  | 'qc.review'
  | 'qc.decide'
  | 'qc.requestCorrection'
  | 'qc.reopen'
  | 'analytics.view'
  | 'audit.view'
  | 'reports.export';

const MATRIX: Record<Role, Capability[]> = {
  pending: [],
  surveyor: ['surveys.viewOwn', 'surveys.editDraft', 'surveys.submit', 'surveys.uploadPhotos', 'surveys.delete'],
  supervisor: [
    'surveys.viewAssigned',
    'surveys.editDraft',
    'surveys.submit',
    'surveys.uploadPhotos',
    'analytics.view',
    'users.view',
    'reports.export',
  ],
  qc_supervisor: [
    'qc.review',
    'qc.decide',
    'qc.requestCorrection',
    'qc.reopen',
    'surveys.uploadPhotos',
    'analytics.view',
    'reports.export',
  ],
  admin: [
    'users.approve',
    'users.disable',
    'users.assignTenant',
    'users.view',
    'roles.manage',
    'tenants.manage',
    'masters.manage',
    'surveys.viewAll',
    'surveys.editDraft',
    'surveys.submit',
    'surveys.uploadPhotos',
    'surveys.delete',
    'qc.review',
    'qc.decide',
    'qc.requestCorrection',
    'qc.reopen',
    'analytics.view',
    'audit.view',
    'reports.export',
  ],
};

export function can(role: Role | undefined, capability: Capability, serverCapabilities?: string[]): boolean {
  if (serverCapabilities?.length) return serverCapabilities.includes(capability);
  if (!role) return false;
  return MATRIX[role as keyof typeof MATRIX]?.includes(capability) ?? false;
}

function canAny(role: Role | undefined, capabilities: Capability[], serverCapabilities?: string[]): boolean {
  return capabilities.some((c) => can(role, c, serverCapabilities));
}

/** Prefer `users.currentUser.capabilities` from Convex (dynamic RBAC). */
export function canWithCapabilities(
  serverCapabilities: string[] | undefined,
  role: Role | undefined,
  capability: Capability,
): boolean {
  if (serverCapabilities && serverCapabilities.length > 0) {
    return serverCapabilities.includes(capability);
  }
  return can(role, capability);
}

export function canAnyWithCapabilities(
  serverCapabilities: string[] | undefined,
  role: Role | undefined,
  capabilities: Capability[],
): boolean {
  return capabilities.some((c) => canWithCapabilities(serverCapabilities, role, c));
}

/** Admin tab keys visible per role (mobile admin shell). */
const ADMIN_TAB_VISIBILITY: Record<Role, string[]> = {
  pending: [],
  surveyor: [],
  supervisor: [],
  qc_supervisor: [],
  admin: ['approvals', 'users', 'roles', 'reports', 'tenants', 'masters', 'profile'],
};
