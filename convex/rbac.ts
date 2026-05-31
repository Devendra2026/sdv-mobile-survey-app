/**
 * Dynamic roles & permissions — admin-managed; reactive on web + mobile via Convex.
 */
import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { clientError, requireRole, requireUser, writeAudit } from "./helpers";
import { PERMISSION_CATALOG, SYSTEM_ROLE_PERMISSIONS, SYSTEM_ROLES } from "./permissionCatalog";
import { userCapabilities } from "./capabilities";

/** Idempotent seed for permissions, system roles, and default grants. */
export async function seedSystemRbac(ctx: MutationCtx) {
  for (const p of PERMISSION_CATALOG) {
    const existing = await ctx.db
      .query("permissions")
      .withIndex("by_key", (q) => q.eq("key", p.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { label: p.label, category: p.category, isActive: true });
    } else {
      await ctx.db.insert("permissions", {
        key: p.key,
        label: p.label,
        category: p.category,
        isActive: true,
      });
    }
  }

  for (const r of SYSTEM_ROLES) {
    let roleId = (
      await ctx.db
        .query("roles")
        .withIndex("by_key", (q) => q.eq("key", r.key))
        .unique()
    )?._id;

    if (roleId) {
      await ctx.db.patch(roleId, { name: r.name, isSystem: r.isSystem, isActive: true });
    } else {
      roleId = await ctx.db.insert("roles", {
        key: r.key,
        name: r.name,
        isSystem: r.isSystem,
        isActive: true,
      });
    }

    const desired = SYSTEM_ROLE_PERMISSIONS[r.key] ?? [];
    const existingPerms = await ctx.db
      .query("rolePermissions")
      .withIndex("by_role", (q) => q.eq("roleId", roleId))
      .collect();
    const existingKeys = new Set(existingPerms.map((row) => row.permissionKey));

    for (const key of desired) {
      if (!existingKeys.has(key)) {
        await ctx.db.insert("rolePermissions", { roleId, permissionKey: key });
      }
    }
  }
}

export const seedSystem = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");
    await seedSystemRbac(ctx);
    await writeAudit(ctx, { actorId: me._id, action: "rbac.seeded", entity: "rbac" });
    return { ok: true as const };
  },
});

export const listPermissions = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const rows = await ctx.db.query("permissions").collect();
    return rows
      .filter((p) => args.includeInactive || p.isActive)
      .sort((a, b) => a.category.localeCompare(b.category) || a.key.localeCompare(b.key));
  },
});

export const listRoles = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const roles = await ctx.db.query("roles").collect();
    const filtered = roles.filter((r) => args.includeInactive || r.isActive);

    const result = [];
    for (const role of filtered.sort((a, b) => a.name.localeCompare(b.name))) {
      const permRows = await ctx.db
        .query("rolePermissions")
        .withIndex("by_role", (q) => q.eq("roleId", role._id))
        .collect();
      result.push({
        ...role,
        permissionKeys: permRows.map((p) => p.permissionKey).sort(),
      });
    }
    return result;
  },
});

export const myCapabilities = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx, { allowPending: true });
    return await userCapabilities(ctx, me);
  },
});

export const createRole = mutation({
  args: {
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    permissionKeys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const key = args.key.trim().toLowerCase().replace(/\s+/g, "_");
    if (!/^[a-z][a-z0-9_]{1,48}$/.test(key)) {
      clientError("BAD_REQUEST", "Role key must be 2–49 lowercase letters, numbers, or underscores");
    }
    if (SYSTEM_ROLES.some((r) => r.key === key)) {
      clientError("BAD_REQUEST", "This role key is reserved for a system role");
    }

    const dup = await ctx.db
      .query("roles")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (dup) clientError("BAD_REQUEST", "Role key already exists");

    const roleId = await ctx.db.insert("roles", {
      key,
      name: args.name.trim(),
      description: args.description?.trim(),
      isSystem: false,
      isActive: true,
    });

    for (const permissionKey of args.permissionKeys) {
      await ctx.db.insert("rolePermissions", { roleId, permissionKey });
    }

    await writeAudit(ctx, {
      actorId: me._id,
      action: "role.created",
      entity: "role",
      entityId: roleId,
      metadata: { key, permissionKeys: args.permissionKeys },
    });
    return roleId;
  },
});

export const updateRole = mutation({
  args: {
    roleId: v.id("roles"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    permissionKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const role = await ctx.db.get(args.roleId);
    if (!role) clientError("NOT_FOUND", "Role not found");

    const patch: { name?: string; description?: string; isActive?: boolean } = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description.trim();
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.roleId, patch);
    }

    if (args.permissionKeys !== undefined) {
      const existing = await ctx.db
        .query("rolePermissions")
        .withIndex("by_role", (q) => q.eq("roleId", args.roleId))
        .collect();
      for (const row of existing) {
        await ctx.db.delete(row._id);
      }
      for (const permissionKey of args.permissionKeys) {
        await ctx.db.insert("rolePermissions", { roleId: args.roleId, permissionKey });
      }
    }

    await writeAudit(ctx, {
      actorId: me._id,
      action: "role.updated",
      entity: "role",
      entityId: args.roleId,
      metadata: { ...patch, permissionKeys: args.permissionKeys },
    });
  },
});

export const createPermission = mutation({
  args: {
    key: v.string(),
    label: v.string(),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const key = args.key.trim();
    const existing = await ctx.db
      .query("permissions")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) clientError("BAD_REQUEST", "Permission key already exists");

    const id = await ctx.db.insert("permissions", {
      key,
      label: args.label.trim(),
      category: args.category.trim(),
      isActive: true,
    });
    await writeAudit(ctx, {
      actorId: me._id,
      action: "permission.created",
      entity: "permission",
      entityId: id,
      metadata: { key },
    });
    return id;
  },
});
