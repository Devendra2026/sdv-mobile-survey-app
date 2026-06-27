/**
 * Admin-only operations.
 *
 * Every function in this file calls `requireRole(me, "admin")` so the
 * mobile app can call these directly without an additional auth check.
 * Supervisors get a curated subset via `supervisor.ts` (created in a
 * later phase).
 */
import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query, type QueryCtx } from './_generated/server';
import { replaceUserAllotments, upsertAllotmentForUser } from './allotments';
import { hasCapability, roleRequiresTenancy } from './capabilities';
import { clientError, requireRole, requireUser, writeAudit } from './helpers';
import { userRole } from './schema';
import { resolveMasterCategory } from './taxationMasters';

const allotmentInput = v.object({
  districtId: v.optional(v.id('districts')),
  municipalityId: v.optional(v.id('municipalities')),
  isActive: v.boolean(),
});

/** Capability checks for `updateUser` — supports custom roles, not only `role === "admin"`. */
async function assertCanPatchUser(
  ctx: Parameters<typeof hasCapability>[0],
  me: Doc<'users'>,
  args: {
    role?: string;
    status?: 'active' | 'disabled';
    municipalityId?: unknown;
    districtId?: unknown;
    wardAssignments?: unknown;
  },
): Promise<void> {
  const required: string[] = [];
  if (args.status !== undefined) required.push('users.disable');
  if (args.role !== undefined) required.push('users.approve');
  if (args.municipalityId !== undefined || args.districtId !== undefined || args.wardAssignments !== undefined) {
    required.push('users.assignTenant');
  }
  if (required.length === 0) return;

  const allowed = await Promise.all(required.map((cap) => hasCapability(ctx, me, cap)));
  if (!allowed.every(Boolean)) {
    throw new ConvexError({
      code: 'FORBIDDEN',
      message: "You don't have permission for this action.",
    });
  }
}

/** Read paths that list or hydrate user rows for admin UI and survey reassignment. */
async function assertCanListUsers(ctx: QueryCtx, me: Doc<'users'>): Promise<void> {
  const canList =
    (await hasCapability(ctx, me, 'users.view')) ||
    (await hasCapability(ctx, me, 'users.approve')) ||
    (await hasCapability(ctx, me, 'surveys.viewAll')) ||
    (await hasCapability(ctx, me, 'surveys.reassign'));
  if (!canList) {
    clientError('FORBIDDEN', "You don't have permission for this action.");
  }
}

/* ────────────────────────── approval workflow ────────────────────────── */

/**
 * Returns every user awaiting approval, newest first. Drives the admin
 * "Pending approvals" inbox.
 */
export const listPendingApprovals = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    requireRole(me, 'admin');

    const rows = await ctx.db
      .query('users')
      .withIndex('by_status', (q) => q.eq('status', 'pending_approval'))
      .order('desc')
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
    userId: v.id('users'),
    role: v.string(),
    municipalityId: v.optional(v.id('municipalities')),
    districtId: v.optional(v.id('districts')),
    wardAssignments: v.optional(v.array(v.string())),
    allotments: v.optional(v.array(allotmentInput)),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, 'admin');

    const target = await ctx.db.get(args.userId);
    if (!target) clientError('NOT_FOUND', 'User not found');
    if (target.status === 'active' && target.role !== 'pending') {
      clientError('ALREADY_APPROVED', 'This user is already active');
    }

    // Validate role-specific requirements
    const wards = args.wardAssignments ?? [];
    let districtId = args.districtId;
    const hasAllotments = (args.allotments?.length ?? 0) > 0;
    const roleRow = await ctx.db
      .query('roles')
      .withIndex('by_key', (q) => q.eq('key', args.role))
      .unique();
    if (!roleRow || roleRow.isActive === false) {
      clientError('BAD_REQUEST', 'Unknown or inactive role');
    }
    if (args.role === 'pending') {
      clientError('BAD_REQUEST', 'Cannot approve with pending role');
    }

    if (args.role !== 'admin') {
      if (!args.municipalityId && !args.districtId && !hasAllotments) {
        clientError('BAD_REQUEST', 'Assign a district, ULB, or allotment list for surveyor/supervisor', {
          municipalityId: ['select a ULB, district, or allotments'],
        });
      }
      if (args.municipalityId) {
        const muni = await ctx.db.get(args.municipalityId);
        if (!muni) clientError('BAD_REQUEST', 'Unknown municipality');
        districtId = muni.districtId;
      } else if (args.districtId) {
        const dist = await ctx.db.get(args.districtId);
        if (!dist) clientError('BAD_REQUEST', 'Unknown district');
      }
    }
    await ctx.db.patch(args.userId, {
      role: args.role,
      status: 'active',
      districtId: args.role === 'admin' ? undefined : districtId,
      municipalityId: args.municipalityId,
      wardAssignments: wards,
      approvedBy: me._id,
      approvedAt: Date.now(),
    });

    if (args.role !== 'admin' && hasAllotments) {
      await replaceUserAllotments(ctx, {
        userId: args.userId,
        allotments: args.allotments!,
        assignedBy: me._id,
      });
    } else if (args.role !== 'admin' && (args.municipalityId || args.districtId)) {
      await upsertAllotmentForUser(ctx, {
        userId: args.userId,
        municipalityId: args.municipalityId,
        districtId: args.districtId,
        assignedBy: me._id,
      });
    }

    await writeAudit(ctx, {
      actorId: me._id,
      action: 'user.approved',
      entity: 'user',
      entityId: args.userId,
      metadata: {
        role: args.role,
        municipalityId: args.municipalityId,
        wardAssignments: wards,
      },
    });

    // Drop a notification so the user sees "approved!" next time they open the app.
    await ctx.db.insert('notifications', {
      userId: args.userId,
      type: 'account_approved',
      title: 'Account approved',
      body: `You've been granted ${args.role} access. Pull-to-refresh to start.`,
    });
  },
});

/** Reject a pending user — keeps the row (audit trail) but disables it. */
export const rejectUser = mutation({
  args: {
    userId: v.id('users'),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const [me, target] = await Promise.all([requireUser(ctx), ctx.db.get(args.userId)]);
    requireRole(me, 'admin');
    if (!target) clientError('NOT_FOUND', 'User not found');

    await Promise.all([
      ctx.db.patch(args.userId, {
        status: 'disabled',
        disabledBy: me._id,
        disabledAt: Date.now(),
      }),
      writeAudit(ctx, {
        actorId: me._id,
        action: 'user.rejected',
        entity: 'user',
        entityId: args.userId,
        metadata: { reason: args.reason },
      }),
      ctx.db.insert('notifications', {
        userId: args.userId,
        type: 'account_rejected',
        title: 'Account request denied',
        body: args.reason ?? 'Contact your administrator for more information.',
      }),
    ]);
  },
});

/* ────────────────────────── user management ────────────────────────── */

async function buildScopeLabel(
  ctx: QueryCtx,
  user: Doc<'users'>,
  districts: Map<string, string>,
  munis: Map<string, { name: string; code: string; districtId: string }>,
): Promise<string | null> {
  const allotmentRows = await ctx.db
    .query('userAllotments')
    .withIndex('by_user', (q) => q.eq('userId', user._id))
    .collect();
  const active = allotmentRows.filter((r) => r.isActive);

  const muniNames = new Set<string>();
  const districtNames = new Set<string>();

  const missingMuniIds = new Set<NonNullable<(typeof active)[number]['municipalityId']>>();
  const missingDistrictIds = new Set<NonNullable<(typeof active)[number]['districtId']>>();
  for (const row of active) {
    if (row.municipalityId && !munis.has(row.municipalityId)) {
      missingMuniIds.add(row.municipalityId);
    } else if (row.districtId && !row.municipalityId && !districts.has(row.districtId)) {
      missingDistrictIds.add(row.districtId);
    }
  }

  const [missingMuniDocs, missingDistrictDocs] = await Promise.all([
    Promise.all([...missingMuniIds].map((id) => ctx.db.get(id))),
    Promise.all([...missingDistrictIds].map((id) => ctx.db.get(id))),
  ]);
  for (const doc of missingMuniDocs) {
    if (doc) munis.set(doc._id, { name: doc.name, code: doc.code, districtId: doc.districtId });
  }
  for (const doc of missingDistrictDocs) {
    if (doc) districts.set(doc._id, doc.name);
  }

  for (const row of active) {
    if (row.municipalityId) {
      const m = munis.get(row.municipalityId);
      if (m) muniNames.add(m.name);
    } else if (row.districtId) {
      const name = districts.get(row.districtId);
      if (name) districtNames.add(`${name} (district)`);
    }
  }

  if (user.municipalityId) {
    const primary = munis.get(user.municipalityId)?.name;
    if (primary) muniNames.add(primary);
  }
  if (user.districtId && muniNames.size === 0) {
    const name = districts.get(user.districtId);
    if (name) districtNames.add(`${name} (district)`);
  }

  const parts = [...muniNames, ...districtNames];
  return parts.length > 0 ? parts.join(', ') : null;
}

async function hydrateUsersForAdmin(ctx: QueryCtx, rows: Doc<'users'>[]) {
  const munis = new Map<string, { name: string; code: string; districtId: string }>();
  const districts = new Map<string, string>();
  const missingDistrictIds = new Set<NonNullable<(typeof rows)[number]['districtId']>>();
  const missingMuniIds = new Set<NonNullable<(typeof rows)[number]['municipalityId']>>();
  for (const u of rows) {
    if (u.districtId && !districts.has(u.districtId)) missingDistrictIds.add(u.districtId);
    if (u.municipalityId && !munis.has(u.municipalityId)) missingMuniIds.add(u.municipalityId);
  }
  const [missingDistrictDocs, missingMuniDocs] = await Promise.all([
    Promise.all([...missingDistrictIds].map((id) => ctx.db.get(id))),
    Promise.all([...missingMuniIds].map((id) => ctx.db.get(id))),
  ]);
  for (const d of missingDistrictDocs) {
    if (d) districts.set(d._id, d.name);
  }
  for (const m of missingMuniDocs) {
    if (m) munis.set(m._id, { name: m.name, code: m.code, districtId: m.districtId });
  }

  const scopeLabels = await Promise.all(rows.map((u) => buildScopeLabel(ctx, u, districts, munis)));

  return rows.map((u, i) => ({
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
    scopeLabel: scopeLabels[i] ?? null,
    lastSeenAt: u.lastSeenAt,
    createdAt: u._creationTime,
  }));
}

function parseUserListOffset(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const n = Number(cursor);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

const USER_STATUSES = ['pending_approval', 'active', 'disabled'] as const;

export const listUsers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    role: v.optional(userRole),
    status: v.optional(v.union(v.literal('pending_approval'), v.literal('active'), v.literal('disabled'))),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    await assertCanListUsers(ctx, me);

    if (args.role && !args.status) {
      const allRows = (
        await Promise.all(
          USER_STATUSES.map((status) =>
            ctx.db
              .query('users')
              .withIndex('by_role_status', (qb) => qb.eq('role', args.role!).eq('status', status))
              .collect(),
          ),
        )
      ).flat();
      allRows.sort((a, b) => b._creationTime - a._creationTime);

      const offset = parseUserListOffset(args.paginationOpts.cursor);
      const numItems = args.paginationOpts.numItems;
      const pageRows = allRows.slice(offset, offset + numItems);
      const nextOffset = offset + pageRows.length;

      return {
        page: await hydrateUsersForAdmin(ctx, pageRows),
        continueCursor: nextOffset < allRows.length ? String(nextOffset) : '',
        isDone: nextOffset >= allRows.length,
      };
    }

    let q;
    if (args.role && args.status) {
      q = ctx.db
        .query('users')
        .withIndex('by_role_status', (qb) => qb.eq('role', args.role!).eq('status', args.status!));
    } else if (args.status) {
      q = ctx.db.query('users').withIndex('by_status', (qb) => qb.eq('status', args.status!));
    } else {
      q = ctx.db.query('users');
    }

    const page = await q.order('desc').paginate(args.paginationOpts);
    return {
      ...page,
      page: await hydrateUsersForAdmin(ctx, page.page),
      continueCursor: page.continueCursor ?? '',
    };
  },
});

/** Active user count for admin dashboard cards. */
export const countActiveUsers = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    await assertCanListUsers(ctx, me);

    const rows = await ctx.db
      .query('users')
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .collect();
    return rows.length;
  },
});

/** Single user row for admin assignment / detail screens. */
export const getUserForAdmin = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const [me, row] = await Promise.all([requireUser(ctx), ctx.db.get(args.userId)]);
    await assertCanListUsers(ctx, me);
    if (!row) return null;

    const [user] = await hydrateUsersForAdmin(ctx, [row]);
    return user ?? null;
  },
});

/** Assign district + ULB for an active surveyor or supervisor. */
export const assignTenant = mutation({
  args: {
    userId: v.id('users'),
    municipalityId: v.id('municipalities'),
    wardAssignments: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, 'admin');

    const [target, muni] = await Promise.all([ctx.db.get(args.userId), ctx.db.get(args.municipalityId)]);
    if (!target) clientError('NOT_FOUND', 'User not found');
    if (!(await roleRequiresTenancy(ctx, target.role))) {
      clientError('BAD_REQUEST', 'Tenant assignment applies to field roles with tenant scope only');
    }
    if (!muni || muni.isActive === false) {
      clientError('BAD_REQUEST', 'Unknown municipality');
    }

    await Promise.all([
      ctx.db.patch(args.userId, {
        municipalityId: args.municipalityId,
        districtId: muni.districtId,
        wardAssignments: args.wardAssignments ?? [],
      }),
      upsertAllotmentForUser(ctx, {
        userId: args.userId,
        municipalityId: args.municipalityId,
        assignedBy: me._id,
      }),
      writeAudit(ctx, {
        actorId: me._id,
        action: 'user.tenant_assigned',
        entity: 'user',
        entityId: args.userId,
        metadata: { municipalityId: args.municipalityId, districtId: muni.districtId },
      }),
    ]);
  },
});

export const updateUser = mutation({
  args: {
    userId: v.id('users'),
    role: v.optional(userRole),
    municipalityId: v.optional(v.id('municipalities')),
    districtId: v.optional(v.id('districts')),
    wardAssignments: v.optional(v.array(v.string())),
    status: v.optional(v.union(v.literal('active'), v.literal('disabled'))),
  },
  handler: async (ctx, args) => {
    const [me, target] = await Promise.all([requireUser(ctx), ctx.db.get(args.userId)]);
    await assertCanPatchUser(ctx, me, args);
    if (!target) clientError('NOT_FOUND', 'User not found');

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
      if (args.status === 'disabled') {
        patch.disabledBy = me._id;
        patch.disabledAt = Date.now();
      }
    }
    if (Object.keys(patch).length === 0) {
      throw new ConvexError({ code: 'BAD_REQUEST', message: 'Nothing to update' });
    }
    await Promise.all([
      ctx.db.patch(args.userId, patch),
      writeAudit(ctx, {
        actorId: me._id,
        action: 'user.updated',
        entity: 'user',
        entityId: args.userId,
        metadata: patch,
      }),
    ]);
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
    requireRole(me, 'admin');
    const category = resolveMasterCategory(args.category);

    const existing = await ctx.db
      .query('masters')
      .withIndex('by_category_value', (q) => q.eq('category', category).eq('value', args.value))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        label: args.label,
        position: args.position,
        isActive: args.isActive,
      });
      return existing._id;
    }
    return await ctx.db.insert('masters', { ...args, category });
  },
});

export const deleteMaster = mutation({
  args: { id: v.id('masters') },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, 'admin');
    await ctx.db.delete(args.id);
  },
});
