/**
 * Server-side capability resolution from dynamic roles + permissions tables.
 */
import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { SYSTEM_ROLE_PERMISSIONS } from "./permissionCatalog";

type Ctx = QueryCtx | MutationCtx;

/** Per-request cache for role permission lookups (safe within a single handler invocation). */
export type PermissionCache = Map<string, Set<string>>;

export async function permissionsForRole(ctx: Ctx, roleKey: string, cache?: PermissionCache): Promise<Set<string>> {
  const cached = cache?.get(roleKey);
  if (cached) return cached;

  const role = await ctx.db
    .query("roles")
    .withIndex("by_key", (q) => q.eq("key", roleKey))
    .unique();

  let perms: Set<string>;
  if (!role || role.isActive === false) {
    const fallback = SYSTEM_ROLE_PERMISSIONS[roleKey];
    perms = fallback ? new Set(fallback) : new Set();
  } else {
    const rows = await ctx.db
      .query("rolePermissions")
      .withIndex("by_role", (q) => q.eq("roleId", role._id))
      .collect();
    perms = new Set(rows.map((r) => r.permissionKey));
  }

  cache?.set(roleKey, perms);
  return perms;
}

export async function userCapabilities(ctx: Ctx, user: Doc<"users">, cache?: PermissionCache): Promise<string[]> {
  const perms = await permissionsForRole(ctx, user.role, cache);
  return Array.from(perms).sort();
}

export async function hasCapability(
  ctx: Ctx,
  user: Doc<"users">,
  capability: string,
  cache?: PermissionCache,
): Promise<boolean> {
  const perms = await permissionsForRole(ctx, user.role, cache);
  return perms.has(capability);
}

export async function requireCapability(
  ctx: Ctx,
  user: Doc<"users">,
  capability: string,
  cache?: PermissionCache,
): Promise<void> {
  const ok = await hasCapability(ctx, user, capability, cache);
  if (!ok) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "You don't have permission for this action.",
    });
  }
}

const TENANCY_CAPABILITIES = ["surveys.viewAssigned", "surveys.viewOwn", "qc.review"] as const;

/** Field roles (system or custom) that need district / ULB / ward scope. */
export async function roleRequiresTenancy(ctx: Ctx, roleKey: string, cache?: PermissionCache): Promise<boolean> {
  if (roleKey === "admin" || roleKey === "pending") return false;
  const perms = await permissionsForRole(ctx, roleKey, cache);
  return TENANCY_CAPABILITIES.some((key) => perms.has(key));
}
