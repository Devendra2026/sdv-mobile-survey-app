/**
 * Multi-district / multi-ULB allotments for supervisors and surveyors.
 * Example: supervisor active on Agra MC + Mathura MC + Hathras district-wide.
 */
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { roleRequiresTenancy } from "./capabilities";
import { clientError, requireRole, requireUser, writeAudit } from "./helpers";

const allotmentInput = v.object({
  districtId: v.optional(v.id("districts")),
  municipalityId: v.optional(v.id("municipalities")),
  isActive: v.boolean(),
});

async function validateAllotmentTarget(
  ctx: MutationCtx,
  row: { districtId?: Id<"districts">; municipalityId?: Id<"municipalities"> },
): Promise<{ districtId?: Id<"districts">; municipalityId?: Id<"municipalities"> }> {
  if (!row.districtId && !row.municipalityId) {
    clientError("BAD_REQUEST", "Each allotment needs a district or a municipality");
  }
  if (row.municipalityId) {
    const muni = await ctx.db.get(row.municipalityId);
    if (!muni || muni.isActive === false) {
      clientError("BAD_REQUEST", "Unknown or inactive municipality");
    }
    return { municipalityId: row.municipalityId, districtId: muni.districtId };
  }
  const dist = await ctx.db.get(row.districtId!);
  if (!dist || dist.isActive === false) {
    clientError("BAD_REQUEST", "Unknown or inactive district");
  }
  return { districtId: row.districtId };
}

type AllotmentRow = {
  districtId?: Id<"districts">;
  municipalityId?: Id<"municipalities">;
  isActive: boolean;
};

/** Replace all allotments for a field user (shared by admin approve + setForUser). */
export async function replaceUserAllotments(
  ctx: MutationCtx,
  opts: {
    userId: Id<"users">;
    allotments: AllotmentRow[];
    assignedBy: Id<"users">;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("userAllotments")
    .withIndex("by_user", (q) => q.eq("userId", opts.userId))
    .collect();
  await Promise.all(existing.map((row) => ctx.db.delete(row._id)));

  const validated = await Promise.all(
    opts.allotments.map(async (a) => ({
      a,
      normalized: await validateAllotmentTarget(ctx, a),
    })),
  );

  const now = Date.now();
  const activeMunis: Id<"municipalities">[] = [];
  let primaryDistrict: Id<"districts"> | undefined;
  const existingUser = await ctx.db.get(opts.userId);

  await Promise.all(
    validated.map(({ a, normalized }) =>
      ctx.db.insert("userAllotments", {
        userId: opts.userId,
        districtId: normalized.districtId,
        municipalityId: normalized.municipalityId,
        isActive: a.isActive,
        assignedBy: opts.assignedBy,
        assignedAt: now,
      }),
    ),
  );

  for (const { a, normalized } of validated) {
    if (a.isActive) {
      if (normalized.municipalityId) activeMunis.push(normalized.municipalityId);
      if (normalized.districtId) primaryDistrict = normalized.districtId;
    }
  }

  const patch: {
    municipalityId?: Id<"municipalities">;
    districtId?: Id<"districts">;
  } = {};

  if (activeMunis.length > 0) {
    const keepPrimary =
      existingUser?.municipalityId && activeMunis.includes(existingUser.municipalityId)
        ? existingUser.municipalityId
        : activeMunis[0]!;
    patch.municipalityId = keepPrimary;
    const m = await ctx.db.get(keepPrimary);
    if (m) patch.districtId = m.districtId;
  } else if (primaryDistrict) {
    patch.districtId = primaryDistrict;
    patch.municipalityId = undefined;
  }

  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(opts.userId, patch);
  }
}

/** Replace all allotments for a field user (admin). */
export const setForUser = mutation({
  args: {
    userId: v.id("users"),
    allotments: v.array(allotmentInput),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const target = await ctx.db.get(args.userId);
    if (!target) clientError("NOT_FOUND", "User not found");
    if (!(await roleRequiresTenancy(ctx, target.role))) {
      clientError("BAD_REQUEST", "Allotments apply to field roles with tenant scope only");
    }

    await replaceUserAllotments(ctx, {
      userId: args.userId,
      allotments: args.allotments,
      assignedBy: me._id,
    });

    await writeAudit(ctx, {
      actorId: me._id,
      action: "user.allotments_set",
      entity: "user",
      entityId: args.userId,
      metadata: { count: args.allotments.length },
    });
  },
});

export const setActive = mutation({
  args: {
    allotmentId: v.id("userAllotments"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const row = await ctx.db.get(args.allotmentId);
    if (!row) clientError("NOT_FOUND", "Allotment not found");

    await ctx.db.patch(args.allotmentId, { isActive: args.isActive });
    await writeAudit(ctx, {
      actorId: me._id,
      action: "user.allotment_toggled",
      entity: "userAllotments",
      entityId: args.allotmentId,
      metadata: { isActive: args.isActive },
    });
  },
});

export const listForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin", "supervisor");

    const rows = await ctx.db
      .query("userAllotments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const districtIds = new Set<Id<"districts">>();
    const municipalityIds = new Set<Id<"municipalities">>();
    for (const a of rows) {
      if (a.districtId) districtIds.add(a.districtId);
      if (a.municipalityId) municipalityIds.add(a.municipalityId);
    }

    const [districtDocs, municipalityDocs] = await Promise.all([
      Promise.all([...districtIds].map((id) => ctx.db.get(id))),
      Promise.all([...municipalityIds].map((id) => ctx.db.get(id))),
    ]);
    const districtById = new Map<Id<"districts">, string>();
    for (const d of districtDocs) {
      if (d) districtById.set(d._id, d.name);
    }
    const municipalityById = new Map<Id<"municipalities">, NonNullable<(typeof municipalityDocs)[number]>>();
    for (const m of municipalityDocs) {
      if (m) municipalityById.set(m._id, m);
    }

    const missingDistrictIds = new Set<Id<"districts">>();
    for (const m of municipalityDocs) {
      if (m && !districtById.has(m.districtId)) missingDistrictIds.add(m.districtId);
    }
    if (missingDistrictIds.size > 0) {
      const extraDistrictDocs = await Promise.all([...missingDistrictIds].map((id) => ctx.db.get(id)));
      for (const d of extraDistrictDocs) {
        if (d) districtById.set(d._id, d.name);
      }
    }

    const result = rows.map((a) => {
      let districtName: string | null = a.districtId ? (districtById.get(a.districtId) ?? null) : null;
      const m = a.municipalityId ? municipalityById.get(a.municipalityId) : undefined;
      const municipalityName = m?.name ?? null;
      if (!districtName && m) {
        districtName = districtById.get(m.districtId) ?? null;
      }
      return { ...a, districtName, municipalityName };
    });
    return result.sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.assignedAt - a.assignedAt);
  },
});

/** Upsert one allotment row (used by assignTenant). */
export async function upsertAllotmentForUser(
  ctx: import("./_generated/server").MutationCtx,
  opts: {
    userId: Id<"users">;
    municipalityId?: Id<"municipalities">;
    districtId?: Id<"districts">;
    assignedBy: Id<"users">;
    isActive?: boolean;
  },
): Promise<void> {
  const [normalized, existing] = await Promise.all([
    validateAllotmentTarget(ctx, {
      municipalityId: opts.municipalityId,
      districtId: opts.districtId,
    }),
    ctx.db
      .query("userAllotments")
      .withIndex("by_user", (q) => q.eq("userId", opts.userId))
      .collect(),
  ]);

  const match = existing.find((r) => {
    if (normalized.municipalityId) {
      return r.municipalityId === normalized.municipalityId;
    }
    return !r.municipalityId && r.districtId === normalized.districtId;
  });

  const now = Date.now();
  const isActive = opts.isActive ?? true;

  if (match) {
    await ctx.db.patch(match._id, { isActive, assignedBy: opts.assignedBy, assignedAt: now });
    return;
  }

  await ctx.db.insert("userAllotments", {
    userId: opts.userId,
    districtId: normalized.districtId,
    municipalityId: normalized.municipalityId,
    isActive,
    assignedBy: opts.assignedBy,
    assignedAt: now,
  });
}
