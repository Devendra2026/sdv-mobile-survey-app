import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, query, type QueryCtx } from "./_generated/server";
import { mapTruthyById, requireRole, requireUser } from "./helpers";
import {
  mergeActorSnapshotIntoMetadata,
  readActorSnapshotFromMetadata,
  readReassignmentFromMetadata,
  resolveAuditActor,
} from "./lib/auditActor";

async function hydrateAuditRows(ctx: QueryCtx, rows: Doc<"auditLogs">[]) {
  const actorIdSet = new Set<Id<"users">>();
  for (const row of rows) {
    if (row.actorId) actorIdSet.add(row.actorId);
    const reassign = readReassignmentFromMetadata(row.metadata);
    if (reassign.fromSurveyorId) actorIdSet.add(reassign.fromSurveyorId);
  }

  const actors = await Promise.all([...actorIdSet].map((id) => ctx.db.get("users", id)));
  const byId = mapTruthyById(actors);

  /** When creator user was deleted, infer from a later draft reassignment on the same survey. */
  const priorSurveyorBySurvey = new Map<string, string>();
  for (const row of rows) {
    if (row.action !== "survey.draft_reassigned" || row.entity !== "survey" || !row.entityId) continue;
    const reassign = readReassignmentFromMetadata(row.metadata);
    if (reassign.fromSurveyorName) {
      priorSurveyorBySurvey.set(row.entityId, reassign.fromSurveyorName);
      continue;
    }
    if (reassign.fromSurveyorId) {
      const fromUser = byId.get(reassign.fromSurveyorId);
      if (fromUser) priorSurveyorBySurvey.set(row.entityId, fromUser.name);
    }
  }

  return rows.map((r) => {
    let actor = resolveAuditActor(r.actorId, r.actorId ? byId.get(r.actorId) : undefined, r.metadata);

    if (actor?.name === "Unknown" && r.action === "survey.created" && r.entity === "survey" && r.entityId) {
      const inferred = priorSurveyorBySurvey.get(r.entityId);
      if (inferred && actor) {
        actor = { ...actor, name: inferred };
      }
    }

    return {
      _id: r._id,
      _creationTime: r._creationTime,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId ?? null,
      metadata: r.metadata ?? null,
      actor,
    };
  });
}

function auditQuery(ctx: QueryCtx, args: { entity?: string; entityId?: string; actorId?: Id<"users"> }) {
  if (args.entity) {
    return ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) =>
        args.entityId ? q.eq("entity", args.entity!).eq("entityId", args.entityId) : q.eq("entity", args.entity!),
      );
  }
  if (args.actorId) {
    return ctx.db.query("auditLogs").withIndex("by_actor", (q) => q.eq("actorId", args.actorId!));
  }
  return ctx.db.query("auditLogs");
}

/**
 * audit.ts — READ surface over the existing `auditLogs` table.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS (and why it does not break the "reuse, don't fork" rule)
 * ─────────────────────────────────────────────────────────────────────────
 * The mobile backend writes audit rows through `helpers.writeAudit` from every
 * mutation, but it never exposed a *read* query — the mobile app has no audit
 * screen. The web Audit module needs one. Per the brief:
 *
 *     "Reuse existing Convex functions. Create server-side mutations and
 *      queries only when missing. All permissions must be enforced on the
 *      server."
 *
 * This module ADDS a read query only. It:
 *   • introduces no new table and changes no field name,
 *   • writes nothing (append-only invariant of `auditLogs` is preserved),
 *   • reuses the exact same `requireUser` / `requireRole` helpers,
 *   • uses the indexes already declared on `auditLogs` (by_entity, by_actor).
 *
 * It is therefore an interface-only addition over the source-of-truth schema.
 */

/**
 * Paginated, filterable audit feed. Admin-only — matches the role matrix
 * (only ADMIN has "View audit logs").
 *
 * Filters mirror the index shapes so we never force a table scan when a
 * caller narrows by entity or actor.
 */
export const list = query({
  args: {
    entity: v.optional(v.string()),
    entityId: v.optional(v.string()),
    actorId: v.optional(v.id("users")),
    action: v.optional(v.string()), // exact match on action verb, e.g. "survey.approved"
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const limit = Math.min(args.limit ?? 100, 500);

    let rows = await auditQuery(ctx, args)
      .order("desc")
      .take(limit * 2);

    if (args.action) {
      rows = rows.filter((r) => r.action === args.action);
    }
    rows = rows.slice(0, limit);

    return hydrateAuditRows(ctx, rows);
  },
});

/** Cursor-paginated audit feed — fetches one page at a time for fast UI render. */
export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    entity: v.optional(v.string()),
    entityId: v.optional(v.string()),
    actorId: v.optional(v.id("users")),
    action: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const page = await auditQuery(ctx, args).order("desc").paginate(args.paginationOpts);
    let rows = page.page;
    if (args.action) {
      rows = rows.filter((r) => r.action === args.action);
    }

    return {
      ...page,
      page: await hydrateAuditRows(ctx, rows),
    };
  },
});

/** Lightweight KPI stats — scans a recent window instead of hydrating the full feed. */
export const summary = query({
  args: { nowMs: v.number() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");

    const recent = await ctx.db.query("auditLogs").order("desc").take(1000);
    const dayMs = 86_400_000;

    return {
      total: recent.length,
      capped: recent.length === 1000,
      actions: new Set(recent.map((r) => r.action)).size,
      entities: new Set(recent.map((r) => r.entity)).size,
      today: recent.filter((r) => args.nowMs - r._creationTime < dayMs).length,
    };
  },
});

/** Distinct action + entity values — drives both filter dropdowns in one round trip. */
export const actionFacets = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    requireRole(me, "admin");
    const rows = await ctx.db.query("auditLogs").order("desc").take(1000);
    return {
      actions: Array.from(new Set(rows.map((r) => r.action))).sort(),
      entities: Array.from(new Set(rows.map((r) => r.entity))).sort(),
    };
  },
});

/** One-time backfill: snapshot actor names on legacy rows where the user still exists. */
export const backfillActorSnapshots = internalMutation({
  args: { batchSize: v.optional(v.number()) },
  returns: v.object({ patched: v.number(), scanned: v.number() }),
  handler: async (ctx, args) => {
    const batchSize = Math.min(args.batchSize ?? 200, 500);
    const rows = await ctx.db.query("auditLogs").order("desc").take(batchSize);

    let patched = 0;
    for (const row of rows) {
      let metadata = row.metadata;
      let changed = false;

      if (row.actorId && !readActorSnapshotFromMetadata(metadata).actorName) {
        const actor = await ctx.db.get("users", row.actorId);
        if (actor) {
          metadata = mergeActorSnapshotIntoMetadata(metadata, {
            actorName: actor.name,
            actorEmail: actor.email,
          });
          changed = true;
        }
      }

      if (row.action === "survey.draft_reassigned") {
        const reassign = readReassignmentFromMetadata(metadata);
        const updates: Record<string, string> = {};
        if (reassign.fromSurveyorId && !reassign.fromSurveyorName) {
          const from = await ctx.db.get("users", reassign.fromSurveyorId);
          if (from) updates.fromSurveyorName = from.name;
        }
        const toId =
          metadata && typeof metadata === "object" && !Array.isArray(metadata)
            ? (metadata as Record<string, unknown>).toSurveyorId
            : undefined;
        const toName =
          metadata && typeof metadata === "object" && !Array.isArray(metadata)
            ? (metadata as Record<string, unknown>).toSurveyorName
            : undefined;
        if (typeof toId === "string" && typeof toName !== "string") {
          const to = await ctx.db.get("users", toId as Id<"users">);
          if (to) updates.toSurveyorName = to.name;
        }
        if (Object.keys(updates).length > 0) {
          metadata = {
            ...(metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}),
            ...updates,
          };
          changed = true;
        }
      }

      if (changed) {
        await ctx.db.patch(row._id, { metadata });
        patched += 1;
      }
    }

    return { patched, scanned: rows.length };
  },
});
