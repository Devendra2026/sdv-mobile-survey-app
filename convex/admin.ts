/**
 * Admin-only operations.
 *
 * Every function in this file calls `requireRole(me, "admin")` so the
 * mobile app can call these directly without an additional auth check.
 * Supervisors get a curated subset via `supervisor.ts` (created in a
 * later phase).
 */
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { replaceUserAllotments, upsertAllotmentForUser } from "./allotments";
import { clientError, requireRole, requireUser, writeAudit } from "./helpers";
import { userRole } from "./schema";
import { resolveMasterCategory } from "./taxationMasters";

const allotmentInput = v.object({
  districtId: v.optional(v.id("districts")),
  municipalityId: v.optional(v.id("municipalities")),
  isActive: v.boolean(),
});

/* ────────────────────────── approval workflow ────────────────────────── */

/**
 * Returns every user awaiting approval, newest first. Drives the admin
 * "Pending approvals" inbox.
 */
export const listPendingApprovals = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const rows = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "pending_approval"))
      .order("desc")
      .collect();

    return rows.map((u) => ({
      _id: u._id,
      email: u.email,
      name: u.name,
      avatarUrl: u.avatarUrl,
      requestedRole: u.requestedRole,
      requestedReason: u.requestedReason,
      createdAt: u._creationTime,
    }));
  },
});

/**
 * Approve a pending user, granting role + tenant scope in one atomic step.
 *
 * - role must be surveyor | supervisor | admin (not "pending")
 * - surveyor & supervisor require municipalityId (district is denormalized from ULB)
 * - ward is chosen on each survey at start (not required at approval)
 */
export const approveUser = mutation({
  args: {
    userId: v.id("users"),
    role: v.string(),
    municipalityId: v.optional(v.id("municipalities")),
    districtId: v.optional(v.id("districts")),
    wardAssignments: v.optional(v.array(v.string())),
    allotments: v.optional(v.array(allotmentInput)),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const target = await ctx.db.get(args.userId);
    if (!target) clientError("NOT_FOUND", "User not found");
    if (target.status === "active" && target.role !== "pending") {
      clientError("ALREADY_APPROVED", "This user is already active");
    }

    // Validate role-specific requirements
    const wards = args.wardAssignments ?? [];
    let districtId = args.districtId;
    const hasAllotments = (args.allotments?.length ?? 0) > 0;
    const roleRow = await ctx.db
      .query("roles")
      .withIndex("by_key", (q) => q.eq("key", args.role))
      .unique();
    if (!roleRow || roleRow.isActive === false) {
      clientError("BAD_REQUEST", "Unknown or inactive role");
    }
    if (args.role === "pending") {
      clientError("BAD_REQUEST", "Cannot approve with pending role");
    }

    if (args.role !== "admin") {
      if (!args.municipalityId && !args.districtId && !hasAllotments) {
        clientError("BAD_REQUEST", "Assign a district, ULB, or allotment list for surveyor/supervisor", {
          municipalityId: ["select a ULB, district, or allotments"],
        });
      }
      if (args.municipalityId) {
        const muni = await ctx.db.get(args.municipalityId);
        if (!muni) clientError("BAD_REQUEST", "Unknown municipality");
        districtId = muni.districtId;
      } else if (args.districtId) {
        const dist = await ctx.db.get(args.districtId);
        if (!dist) clientError("BAD_REQUEST", "Unknown district");
      }
    }
    await ctx.db.patch(args.userId, {
      role: args.role,
      status: "active",
      districtId: args.role === "admin" ? undefined : districtId,
      municipalityId: args.municipalityId,
      wardAssignments: wards,
      approvedBy: me._id,
      approvedAt: Date.now(),
    });

    if (args.role !== "admin" && hasAllotments) {
      await replaceUserAllotments(ctx, {
        userId: args.userId,
        allotments: args.allotments!,
        assignedBy: me._id,
      });
    } else if (args.role !== "admin" && (args.municipalityId || args.districtId)) {
      await upsertAllotmentForUser(ctx, {
        userId: args.userId,
        municipalityId: args.municipalityId,
        districtId: args.districtId,
        assignedBy: me._id,
      });
    }

    await writeAudit(ctx, {
      actorId: me._id,
      action: "user.approved",
      entity: "user",
      entityId: args.userId,
      metadata: {
        role: args.role,
        municipalityId: args.municipalityId,
        wardAssignments: wards,
      },
    });

    // Drop a notification so the user sees "approved!" next time they open the app.
    await ctx.db.insert("notifications", {
      userId: args.userId,
      type: "account_approved",
      title: "Account approved",
      body: `You've been granted ${args.role} access. Pull-to-refresh to start.`,
    });
  },
});

/** Reject a pending user — keeps the row (audit trail) but disables it. */
export const rejectUser = mutation({
  args: {
    userId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const target = await ctx.db.get(args.userId);
    if (!target) clientError("NOT_FOUND", "User not found");

    await ctx.db.patch(args.userId, {
      status: "disabled",
      disabledBy: me._id,
      disabledAt: Date.now(),
    });

    await writeAudit(ctx, {
      actorId: me._id,
      action: "user.rejected",
      entity: "user",
      entityId: args.userId,
      metadata: { reason: args.reason },
    });

    await ctx.db.insert("notifications", {
      userId: args.userId,
      type: "account_rejected",
      title: "Account request denied",
      body: args.reason ?? "Contact your administrator for more information.",
    });
  },
});

/* ────────────────────────── user management ────────────────────────── */

async function hydrateUsersForAdmin(ctx: QueryCtx, rows: Doc<"users">[]) {
  const munis = new Map<string, { name: string; code: string; districtId: string }>();
  const districts = new Map<string, string>();
  for (const u of rows) {
    if (u.districtId && !districts.has(u.districtId)) {
      const d = await ctx.db.get(u.districtId);
      if (d) districts.set(u.districtId, d.name);
    }
    if (u.municipalityId && !munis.has(u.municipalityId)) {
      const m = await ctx.db.get(u.municipalityId);
      if (m) munis.set(u.municipalityId, { name: m.name, code: m.code, districtId: m.districtId });
    }
  }
  return rows.map((u) => ({
    _id: u._id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    districtId: u.districtId,
    municipalityId: u.municipalityId,
    wardAssignments: u.wardAssignments,
    districtName: u.districtId ? (districts.get(u.districtId) ?? null) : null,
    municipalityName: u.municipalityId ? (munis.get(u.municipalityId)?.name ?? null) : null,
    municipalityCode: u.municipalityId ? (munis.get(u.municipalityId)?.code ?? null) : null,
    lastSeenAt: u.lastSeenAt,
    createdAt: u._creationTime,
  }));
}

export const listUsers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    role: v.optional(userRole),
    status: v.optional(v.union(v.literal("pending_approval"), v.literal("active"), v.literal("disabled"))),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin", "supervisor");

    let q;
    if (args.role && args.status) {
      q = ctx.db
        .query("users")
        .withIndex("by_role_status", (qb) => qb.eq("role", args.role!).eq("status", args.status!));
    } else if (args.status) {
      q = ctx.db.query("users").withIndex("by_status", (qb) => qb.eq("status", args.status!));
    } else if (args.role) {
      q = ctx.db.query("users").filter((q) => q.eq(q.field("role"), args.role!));
    } else {
      q = ctx.db.query("users");
    }

    const page = await q.order("desc").paginate(args.paginationOpts);
    return {
      ...page,
      page: await hydrateUsersForAdmin(ctx, page.page),
    };
  },
});

/** Active user count for admin dashboard cards. */
export const countActiveUsers = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin", "supervisor");

    const rows = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return rows.length;
  },
});

/** Single user row for admin assignment / detail screens. */
export const getUserForAdmin = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin", "supervisor");

    const row = await ctx.db.get(args.userId);
    if (!row) return null;

    const [user] = await hydrateUsersForAdmin(ctx, [row]);
    return user ?? null;
  },
});

/** Assign district + ULB for an active surveyor or supervisor. */
export const assignTenant = mutation({
  args: {
    userId: v.id("users"),
    municipalityId: v.id("municipalities"),
    wardAssignments: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const target = await ctx.db.get(args.userId);
    if (!target) clientError("NOT_FOUND", "User not found");
    if (target.role !== "surveyor" && target.role !== "supervisor") {
      clientError("BAD_REQUEST", "Tenant assignment applies to surveyors and supervisors only");
    }

    const muni = await ctx.db.get(args.municipalityId);
    if (!muni || muni.isActive === false) {
      clientError("BAD_REQUEST", "Unknown municipality");
    }

    await ctx.db.patch(args.userId, {
      municipalityId: args.municipalityId,
      districtId: muni.districtId,
      wardAssignments: args.wardAssignments ?? [],
    });

    await upsertAllotmentForUser(ctx, {
      userId: args.userId,
      municipalityId: args.municipalityId,
      assignedBy: me._id,
    });

    await writeAudit(ctx, {
      actorId: me._id,
      action: "user.tenant_assigned",
      entity: "user",
      entityId: args.userId,
      metadata: { municipalityId: args.municipalityId, districtId: muni.districtId },
    });
  },
});

export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    role: v.optional(userRole),
    municipalityId: v.optional(v.id("municipalities")),
    districtId: v.optional(v.id("districts")),
    wardAssignments: v.optional(v.array(v.string())),
    status: v.optional(v.union(v.literal("active"), v.literal("disabled"))),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const target = await ctx.db.get(args.userId);
    if (!target) clientError("NOT_FOUND", "User not found");

    const patch: Record<string, unknown> = {};
    if (args.role !== undefined) patch.role = args.role;
    if (args.municipalityId !== undefined) {
      patch.municipalityId = args.municipalityId;
      const muni = await ctx.db.get(args.municipalityId);
      if (muni) patch.districtId = muni.districtId;
    }
    if (args.districtId !== undefined) patch.districtId = args.districtId;
    if (args.wardAssignments !== undefined) patch.wardAssignments = args.wardAssignments;
    if (args.status !== undefined) {
      patch.status = args.status;
      if (args.status === "disabled") {
        patch.disabledBy = me._id;
        patch.disabledAt = Date.now();
      }
    }
    if (Object.keys(patch).length === 0) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "Nothing to update" });
    }
    await ctx.db.patch(args.userId, patch);
    await writeAudit(ctx, {
      actorId: me._id,
      action: "user.updated",
      entity: "user",
      entityId: args.userId,
      metadata: patch,
    });
  },
});

/* ────────────────────────── master data CRUD ────────────────────────── */

export const upsertMaster = mutation({
  args: {
    category: v.string(),
    value: v.string(),
    label: v.string(),
    position: v.number(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");
    const category = resolveMasterCategory(args.category);

    const existing = await ctx.db
      .query("masters")
      .withIndex("by_category_value", (q) => q.eq("category", category).eq("value", args.value))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        label: args.label,
        position: args.position,
        isActive: args.isActive,
      });
      return existing._id;
    }
    return await ctx.db.insert("masters", { ...args, category });
  },
});

export const deleteMaster = mutation({
  args: { id: v.id("masters") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");
    await ctx.db.delete(args.id);
  },
});
