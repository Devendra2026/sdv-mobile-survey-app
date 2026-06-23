/**
 * Server-side capability resolution from dynamic roles + permissions tables.
 */
import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { SYSTEM_ROLE_PERMISSIONS } from "./permissionCatalog";

type Ctx = QueryCtx | MutationCtx;

export async function permissionsForRole(ctx: Ctx, roleKey: string): Promise<Set<string>> {
  const role = await ctx.db
    .query("roles")
    .withIndex("by_key", (q) => q.eq("key", roleKey))
    .unique();

  if (!role || role.isActive === false) {
    const fallback = SYSTEM_ROLE_PERMISSIONS[roleKey];
    return fallback ? new Set(fallback) : new Set();
  }

  const rows = await ctx.db
    .query("rolePermissions")
    .withIndex("by_role", (q) => q.eq("roleId", role._id))
    .collect();

  return new Set(rows.map((r) => r.permissionKey));
}

export async function userCapabilities(ctx: Ctx, user: Doc<"users">): Promise<string[]> {
  const perms = await permissionsForRole(ctx, user.role);
  return Array.from(perms).sort();
}

export async function hasCapability(ctx: Ctx, user: Doc<"users">, capability: string): Promise<boolean> {
  const perms = await permissionsForRole(ctx, user.role);
  return perms.has(capability);
}

export async function requireCapability(ctx: Ctx, user: Doc<"users">, capability: string): Promise<void> {
  const ok = await hasCapability(ctx, user, capability);
  if (!ok) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "You don't have permission for this action.",
    });
  }
}

const TENANCY_CAPABILITIES = ["surveys.viewAssigned", "surveys.viewOwn", "qc.review"] as const;

/** Field roles (system or custom) that need district / ULB / ward scope. */
export async function roleRequiresTenancy(ctx: Ctx, roleKey: string): Promise<boolean> {
  if (roleKey === "admin" || roleKey === "pending") return false;
  const perms = await permissionsForRole(ctx, roleKey);
  return TENANCY_CAPABILITIES.some((key) => perms.has(key));
}
