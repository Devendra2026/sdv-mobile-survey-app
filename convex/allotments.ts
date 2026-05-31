/**
 * Multi-district / multi-ULB allotments for supervisors and surveyors.
 * Example: supervisor active on Agra MC + Mathura MC + Hathras district-wide.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { clientError, requireRole, requireUser, writeAudit } from "./helpers";

const allotmentInput = v.object({
  districtId: v.optional(v.id("districts")),
  municipalityId: v.optional(v.id("municipalities")),
  isActive: v.boolean(),
});

function isFieldRole(role: Doc<"users">["role"]): boolean {
  return role === "surveyor" || role === "supervisor";
}

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
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }

  const now = Date.now();
  let primaryMuni: Id<"municipalities"> | undefined;
  let primaryDistrict: Id<"districts"> | undefined;

  for (const a of opts.allotments) {
    const normalized = await validateAllotmentTarget(ctx, a);
    await ctx.db.insert("userAllotments", {
      userId: opts.userId,
      districtId: normalized.districtId,
      municipalityId: normalized.municipalityId,
      isActive: a.isActive,
      assignedBy: opts.assignedBy,
      assignedAt: now,
    });
    if (a.isActive) {
      if (normalized.municipalityId) primaryMuni = normalized.municipalityId;
      if (normalized.districtId) primaryDistrict = normalized.districtId;
    }
  }

  const patch: {
    municipalityId?: Id<"municipalities">;
    districtId?: Id<"districts">;
  } = {};
  if (primaryMuni) {
    patch.municipalityId = primaryMuni;
    const m = await ctx.db.get(primaryMuni);
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
    if (!isFieldRole(target.role)) {
      clientError("BAD_REQUEST", "Allotments apply to surveyors and supervisors only");
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

    const result = [];
    for (const a of rows) {
      let districtName: string | null = null;
      let municipalityName: string | null = null;
      if (a.districtId) {
        const d = await ctx.db.get(a.districtId);
        districtName = d?.name ?? null;
      }
      if (a.municipalityId) {
        const m = await ctx.db.get(a.municipalityId);
        municipalityName = m?.name ?? null;
        if (!districtName && m) {
          const d = await ctx.db.get(m.districtId);
          districtName = d?.name ?? null;
        }
      }
      result.push({ ...a, districtName, municipalityName });
    }
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
  const normalized = await validateAllotmentTarget(ctx, {
    municipalityId: opts.municipalityId,
    districtId: opts.districtId,
  });

  const existing = await ctx.db
    .query("userAllotments")
    .withIndex("by_user", (q) => q.eq("userId", opts.userId))
    .collect();

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
