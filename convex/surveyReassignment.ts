/**
 * Admin draft reassignment — transfer in-progress surveys between field collectors.
 *
 * Business rules:
 *  - Only `status === "draft"` rows move (includes QC-returned drafts).
 *  - The new assignee owns the row (`surveyorId`); prior assignee is audit-only.
 *  - Mobile idempotency (`localId`) is preserved when possible; collisions get a suffix.
 *  - Orphaned drafts: assignee disabled, deleted, or no longer a field collector.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireCapability } from "./capabilities";
import { collectSurveysInFieldScope } from "./fieldAccess";
import { canReadWard, clientError, requireUser, writeAudit } from "./helpers";
import { resolveTenantScope, tenantMunicipalityIds } from "./tenancy";

const FIELD_COLLECTOR_ROLES = new Set(["surveyor", "supervisor"]);

const draftOwnerRow = v.object({
  surveyorId: v.id("users"),
  name: v.string(),
  email: v.string(),
  role: v.string(),
  status: v.string(),
  draftCount: v.number(),
  isOrphaned: v.boolean(),
});

const reassignResult = v.object({
  transferred: v.number(),
  skipped: v.number(),
  localIdAdjusted: v.number(),
});

export function isOrphanedAssignee(user: Doc<"users"> | null): boolean {
  if (!user) return true;
  if (user.status !== "active") return true;
  return !FIELD_COLLECTOR_ROLES.has(user.role);
}

function isTransferableDraft(survey: Doc<"surveys">): boolean {
  return survey.status === "draft";
}

async function loadTargetSurveyor(ctx: QueryCtx | MutationCtx, userId: Id<"users">): Promise<Doc<"users">> {
  const target = await ctx.db.get(userId);
  if (!target) clientError("NOT_FOUND", "Target surveyor not found");
  if (target.status !== "active") {
    clientError("BAD_REQUEST", "Target user must be an active account");
  }
  if (!FIELD_COLLECTOR_ROLES.has(target.role)) {
    clientError("BAD_REQUEST", "Target must be a surveyor or field supervisor");
  }
  return target;
}

/** Target must cover the survey's ULB and ward (when ward assignments exist). */
async function assertTargetCoversSurvey(
  ctx: QueryCtx | MutationCtx,
  target: Doc<"users">,
  survey: Doc<"surveys">,
): Promise<void> {
  const scope = await resolveTenantScope(ctx, target);
  const muniIds = tenantMunicipalityIds(scope);
  if (!muniIds.has(survey.municipalityId)) {
    clientError("BAD_REQUEST", "Target user is not allotted to this ULB", {
      toSurveyorId: ["assign ULB scope to the target user first"],
    });
  }
  if (!canReadWard(target, survey.municipalityId, survey.wardNo)) {
    clientError("BAD_REQUEST", "Target user is not assigned to this ward", {
      toSurveyorId: ["add ward assignment or broaden target scope"],
    });
  }
}

async function resolveLocalIdForTransfer(
  ctx: MutationCtx,
  targetId: Id<"users">,
  localId: string,
  surveyId: Id<"surveys">,
): Promise<{ localId: string; adjusted: boolean }> {
  const clash = await ctx.db
    .query("surveys")
    .withIndex("by_surveyor_localId", (q) => q.eq("surveyorId", targetId).eq("localId", localId))
    .unique();
  if (!clash || clash._id === surveyId) {
    return { localId, adjusted: false };
  }
  const suffix = surveyId.slice(-6);
  return { localId: `${localId}-xfer-${suffix}`, adjusted: true };
}

async function collectDraftsInAdminScope(
  ctx: QueryCtx,
  me: Doc<"users">,
  filters: {
    districtId?: Id<"districts">;
    municipalityId?: Id<"municipalities">;
    wardNo?: string;
    fromSurveyorId?: Id<"users">;
    orphanedOnly?: boolean;
  },
): Promise<Doc<"surveys">[]> {
  let rows = (await collectSurveysInFieldScope(ctx, me)).filter(isTransferableDraft);

  if (filters.districtId) {
    rows = rows.filter((r) => r.districtId === filters.districtId);
  }
  if (filters.municipalityId) {
    rows = rows.filter((r) => r.municipalityId === filters.municipalityId);
  }
  if (filters.wardNo) {
    rows = rows.filter((r) => r.wardNo === filters.wardNo);
  }
  if (filters.fromSurveyorId) {
    rows = rows.filter((r) => r.surveyorId === filters.fromSurveyorId);
  }
  if (filters.orphanedOnly) {
    const assigneeIds = [...new Set(rows.map((r) => r.surveyorId))];
    const assignees = await Promise.all(assigneeIds.map((id) => ctx.db.get(id)));
    const orphanedIds = new Set(assigneeIds.filter((id, i) => isOrphanedAssignee(assignees[i] ?? null)));
    rows = rows.filter((r) => orphanedIds.has(r.surveyorId));
  }

  return rows;
}

/** Draft counts grouped by current assignee — drives admin reassignment picker. */
export const listDraftOwners = query({
  args: {
    districtId: v.optional(v.id("districts")),
    municipalityId: v.optional(v.id("municipalities")),
    wardNo: v.optional(v.string()),
  },
  returns: v.object({
    owners: v.array(draftOwnerRow),
    orphanedCount: v.number(),
    totalDrafts: v.number(),
  }),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    await requireCapability(ctx, me, "surveys.reassign");

    const drafts = await collectDraftsInAdminScope(ctx, me, args);
    const bySurveyor = new Map<Id<"users">, number>();
    for (const row of drafts) {
      bySurveyor.set(row.surveyorId, (bySurveyor.get(row.surveyorId) ?? 0) + 1);
    }

    const owners = await Promise.all(
      [...bySurveyor.entries()].map(async ([surveyorId, draftCount]) => {
        const user = await ctx.db.get(surveyorId);
        const orphaned = isOrphanedAssignee(user);
        return {
          surveyorId,
          name: user?.name ?? "Unknown user",
          email: user?.email ?? "",
          role: user?.role ?? "unknown",
          status: user?.status ?? "unknown",
          draftCount,
          isOrphaned: orphaned,
        };
      }),
    );

    owners.sort((a, b) => {
      if (a.isOrphaned !== b.isOrphaned) return a.isOrphaned ? -1 : 1;
      return b.draftCount - a.draftCount;
    });

    const orphanedCount = owners.filter((o) => o.isOrphaned).reduce((n, o) => n + o.draftCount, 0);
    return { owners, orphanedCount, totalDrafts: drafts.length };
  },
});

/** Count drafts per ward for QC command center (includes unsubmitted field work). */
export const wardDraftCounts = query({
  args: {
    districtId: v.optional(v.id("districts")),
    municipalityId: v.optional(v.id("municipalities")),
  },
  returns: v.array(
    v.object({
      municipalityId: v.id("municipalities"),
      wardNo: v.string(),
      draftCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    await requireCapability(ctx, me, "qc.review");

    const drafts = await collectDraftsInAdminScope(ctx, me, {
      districtId: args.districtId,
      municipalityId: args.municipalityId,
    });

    const byKey = new Map<string, { municipalityId: Id<"municipalities">; wardNo: string; draftCount: number }>();
    for (const row of drafts) {
      if (!row.wardNo) continue;
      const key = `${row.municipalityId}:${row.wardNo}`;
      const entry = byKey.get(key);
      if (entry) {
        entry.draftCount += 1;
      } else {
        byKey.set(key, { municipalityId: row.municipalityId, wardNo: row.wardNo, draftCount: 1 });
      }
    }

    return Array.from(byKey.values()).toSorted((a, b) =>
      a.wardNo.localeCompare(b.wardNo, undefined, { numeric: true }),
    );
  },
});

/**
 * Transfer draft surveys to another field collector.
 *
 * Modes:
 *  - `fromSurveyor` — all drafts for `fromSurveyorId` (optional ULB/ward filters)
 *  - `orphaned`     — drafts whose assignee is disabled / non-field
 *  - `selected`     — explicit `surveyIds` list
 */
export const reassignDrafts = mutation({
  args: {
    toSurveyorId: v.id("users"),
    mode: v.union(v.literal("fromSurveyor"), v.literal("orphaned"), v.literal("selected")),
    fromSurveyorId: v.optional(v.id("users")),
    surveyIds: v.optional(v.array(v.id("surveys"))),
    districtId: v.optional(v.id("districts")),
    municipalityId: v.optional(v.id("municipalities")),
    wardNo: v.optional(v.string()),
  },
  returns: reassignResult,
  handler: async (ctx, args) => {
    const [me, target] = await Promise.all([requireUser(ctx), loadTargetSurveyor(ctx, args.toSurveyorId)]);
    await requireCapability(ctx, me, "surveys.reassign");
    if (args.toSurveyorId === args.fromSurveyorId) {
      clientError("BAD_REQUEST", "Source and target surveyor must differ");
    }

    let drafts: Doc<"surveys">[] = [];

    if (args.mode === "selected") {
      if (!args.surveyIds?.length) {
        clientError("BAD_REQUEST", "Select at least one draft survey");
      }
      const rows = await Promise.all(args.surveyIds.map((id) => ctx.db.get(id)));
      drafts = rows.filter((r): r is Doc<"surveys"> => r != null && isTransferableDraft(r));
      if (drafts.length !== args.surveyIds.length) {
        clientError("BAD_REQUEST", "Only draft surveys can be reassigned");
      }
    } else if (args.mode === "fromSurveyor") {
      if (!args.fromSurveyorId) {
        clientError("BAD_REQUEST", "Select the surveyor whose drafts should move");
      }
      drafts = await collectDraftsInAdminScope(ctx, me, {
        fromSurveyorId: args.fromSurveyorId,
        districtId: args.districtId,
        municipalityId: args.municipalityId,
        wardNo: args.wardNo,
      });
    } else {
      drafts = await collectDraftsInAdminScope(ctx, me, {
        orphanedOnly: true,
        districtId: args.districtId,
        municipalityId: args.municipalityId,
        wardNo: args.wardNo,
      });
    }

    if (drafts.length === 0) {
      clientError("BAD_REQUEST", "No draft surveys matched this reassignment");
    }

    let transferred = 0;
    let skipped = 0;
    let localIdAdjusted = 0;
    const now = Date.now();

    for (const survey of drafts) {
      if (survey.surveyorId === args.toSurveyorId) {
        skipped += 1;
        continue;
      }

      try {
        await assertTargetCoversSurvey(ctx, target, survey);
      } catch {
        skipped += 1;
        continue;
      }

      const { localId, adjusted } = await resolveLocalIdForTransfer(ctx, args.toSurveyorId, survey.localId, survey._id);
      if (adjusted) localIdAdjusted += 1;

      const fromSurveyorId = survey.surveyorId;
      const [fromSurveyor, toSurveyor] = await Promise.all([
        ctx.db.get("users", fromSurveyorId),
        ctx.db.get("users", args.toSurveyorId),
      ]);

      await Promise.all([
        ctx.db.patch(survey._id, {
          surveyorId: args.toSurveyorId,
          localId,
          serverVersion: survey.serverVersion + 1,
          clientUpdatedAt: now,
        }),
        ctx.db.insert("notifications", {
          userId: args.toSurveyorId,
          type: "survey_draft_assigned",
          title: "Draft surveys assigned to you",
          body: `A draft in Ward ${survey.wardNo || "—"} was assigned by an administrator.`,
          relatedEntity: "survey",
          relatedId: survey._id,
        }),
        writeAudit(ctx, {
          actorId: me._id,
          action: "survey.draft_reassigned",
          entity: "survey",
          entityId: survey._id,
          metadata: {
            fromSurveyorId,
            fromSurveyorName: fromSurveyor?.name,
            toSurveyorId: args.toSurveyorId,
            toSurveyorName: toSurveyor?.name,
            mode: args.mode,
            localIdAdjusted: adjusted,
            wardNo: survey.wardNo,
            municipalityId: survey.municipalityId,
          },
        }),
      ]);

      transferred += 1;
    }

    if (transferred === 0) {
      clientError("BAD_REQUEST", "No drafts could be transferred — check target ULB/ward scope");
    }

    return { transferred, skipped, localIdAdjusted };
  },
});
