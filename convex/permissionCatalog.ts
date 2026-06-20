/**
 * Canonical permission keys — seeded into `permissions` and referenced by
 * `rolePermissions`. Admin may add custom keys via rbac.createPermission.
 */
export const PERMISSION_CATALOG = [
  { key: "users.approve", label: "Approve users", category: "users" },
  { key: "users.disable", label: "Disable users", category: "users" },
  { key: "users.assignTenant", label: "Assign tenant / allotment", category: "users" },
  { key: "users.view", label: "View users", category: "users" },
  { key: "roles.manage", label: "Manage roles & permissions", category: "admin" },
  { key: "tenants.manage", label: "Manage districts & ULBs", category: "tenants" },
  { key: "masters.manage", label: "Manage master data", category: "masters" },
  { key: "surveys.viewAll", label: "View all surveys", category: "surveys" },
  { key: "surveys.viewAssigned", label: "View assigned surveys", category: "surveys" },
  { key: "surveys.viewOwn", label: "View own surveys", category: "surveys" },
  { key: "surveys.editDraft", label: "Edit draft surveys", category: "surveys" },
  { key: "surveys.submit", label: "Submit surveys", category: "surveys" },
  { key: "surveys.uploadPhotos", label: "Upload survey photos", category: "surveys" },
  { key: "surveys.delete", label: "Delete surveys", category: "surveys" },
  { key: "surveys.reassign", label: "Reassign draft surveys", category: "surveys" },
  { key: "qc.review", label: "Review QC queue", category: "qc" },
  { key: "qc.decide", label: "Approve / reject surveys", category: "qc" },
  { key: "qc.requestCorrection", label: "Request QC corrections", category: "qc" },
  { key: "qc.reopen", label: "Re-open approved surveys", category: "qc" },
  { key: "analytics.view", label: "View analytics", category: "reports" },
  { key: "audit.view", label: "View audit log", category: "admin" },
  { key: "reports.export", label: "Export reports", category: "reports" },
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];

/** Default permission sets for built-in roles (mirrors client MATRIX). */
export const SYSTEM_ROLE_PERMISSIONS: Record<string, readonly PermissionKey[]> = {
  pending: [],
  surveyor: ["surveys.viewOwn", "surveys.editDraft", "surveys.submit", "surveys.uploadPhotos", "surveys.delete"],
  /** Field supervisor — collects and submits surveys; no QC module access. */
  supervisor: [
    "surveys.viewAssigned",
    "surveys.editDraft",
    "surveys.submit",
    "surveys.uploadPhotos",
    "analytics.view",
    "users.view",
    "reports.export",
  ],
  /** QC supervisor — verification portal only; corrections update survey rows in place. */
  qc_supervisor: [
    "qc.review",
    "qc.decide",
    "qc.requestCorrection",
    "qc.reopen",
    "surveys.uploadPhotos",
    "analytics.view",
    "reports.export",
  ],
  admin: PERMISSION_CATALOG.map((p) => p.key),
};

export const SYSTEM_ROLES = [
  { key: "pending", name: "Pending", isSystem: true },
  { key: "surveyor", name: "Surveyor", isSystem: true },
  { key: "supervisor", name: "Field Supervisor", isSystem: true },
  { key: "qc_supervisor", name: "QC Supervisor", isSystem: true },
  { key: "admin", name: "Administrator", isSystem: true },
] as const;
