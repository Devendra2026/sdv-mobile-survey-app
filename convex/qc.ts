/**
 * QC workflow.
 *
 *  - `decide`        — supervisor/admin approves or rejects; cascades to survey.qcStatus
 *  - `addRemark`     — append-only thread; supervisor and the assigned surveyor
 *                       can both write. Notifies the other party.
 *  - `listRemarks`   — full thread, ordered desc
 *  - `resolveRemark` — flips a single remark to "resolved" once addressed
 */
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireCapability } from "./capabilities";
import { assertCanAccessSurvey, fieldSurveyAccess } from "./fieldAccess";
import { assertCanReadWard, clientError, mapTruthyById, requireUser, writeAudit } from "./helpers";
import { computeQcWardAggregates } from "./lib/qcWardStats";
import { syncSurveyAggregates } from "./lib/surveyAggregates";
import { normalizeParcelKey, resolvePropertyId } from "./propertyId";
import { qcStatus, surveyStatus } from "./schema";
import { collectSurveysForListPaginated } from "./survey";
import { assertMunicipalityInScope, resolveTenantScope, tenantDistrictIds, tenantMunicipalityIds } from "./tenancy";

const wardStatsEntryShape = {
  wardNo: v.string(),
  municipalityId: v.id("municipalities"),
  city: v.string(),
  pending: v.number(),
  approved: v.number(),
  rejected: v.number(),
  drafts: v.number(),
  total: v.number(),
  qcCompletionPct: v.number(),
  firstPendingId: v.optional(v.id("surveys")),
};

const commandCenterStatsShape = {
  pending: v.number(),
  approved: v.number(),
  rejected: v.number(),
  drafts: v.number(),
  submittedToday: v.number(),
  submitted: v.number(),
  qcCompletionPct: v.number(),
  wardStats: v.array(v.object(wardStatsEntryShape)),
};

/** Scoped KPI counts for the QC command center — full dataset, not client-capped. */
export const commandCenterStats = query({
  args: {
    districtId: v.optional(v.id("districts")),
    municipalityId: v.optional(v.id("municipalities")),
    wardNo: v.optional(v.string()),
    fromMs: v.optional(v.number()),
    toMs: v.optional(v.number()),
    nowMs: v.number(),
  },
  returns: v.object(commandCenterStatsShape),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    await requireCapability(ctx, me, "qc.review");

    const scope = await resolveTenantScope(ctx, me);
    const districtIds = tenantDistrictIds(scope);
    const muniIds = tenantMunicipalityIds(scope);
    const access = await fieldSurveyAccess(ctx, me);

    if (args.municipalityId) {
      await assertMunicipalityInScope(ctx, me, args.municipalityId);
    }
    if (args.districtId && access !== "admin" && !districtIds.has(args.districtId)) {
      clientError("FORBIDDEN", "This district is outside your assigned scope");
    }

    const rows = await collectSurveysForListPaginated(
      ctx,
      me,
      {
        districtId: args.districtId,
        municipalityId: args.municipalityId,
        wardNo: args.wardNo,
      },
      scope,
      muniIds,
      access,
    );

    const inDateRange = (submittedAt: number | undefined, creationTime: number) => {
      const ts = submittedAt ?? creationTime;
      if (args.fromMs !== undefined && ts < args.fromMs) return false;
      if (args.toMs !== undefined && ts > args.toMs) return false;
      return true;
    };

    const filtered = rows.filter((r) => inDateRange(r.submittedAt, r._creationTime));

    const todayMs = (() => {
      const d = new Date(args.nowMs);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })();

    const pending = filtered.filter((r) => r.qcStatus === "pending" && r.status === "submitted").length;
    const approved = filtered.filter((r) => r.qcStatus === "approved").length;
    const rejected = filtered.filter((r) => r.qcStatus === "rejected").length;
    const decided = pending + approved + rejected;
    const qcCompletionPct = decided > 0 ? Math.round((approved / decided) * 100) : 0;
    const wardStats = computeQcWardAggregates(filtered);

    return {
      pending,
      approved,
      rejected,
      drafts: filtered.filter((r) => r.status === "draft").length,
      submittedToday: filtered.filter(
        (r) =>
          r.status === "submitted" &&
          (r.submittedAt !== undefined ? r.submittedAt >= todayMs : r._creationTime >= todayMs),
      ).length,
      submitted: filtered.filter((r) => r.status === "submitted").length,
      qcCompletionPct,
      wardStats,
    };
  },
});

function wardNumbersMatch(rowWard: string, filterWard: string): boolean {
  if (rowWard === filterWard) return true;
  const a = Number(rowWard);
  const b = Number(filterWard);
  return !Number.isNaN(a) && !Number.isNaN(b) && a === b;
}

const parcelSiblingEntry = v.object({
  _id: v.id("surveys"),
  propertyId: v.optional(v.string()),
  propertyUse: v.string(),
  unitNo: v.string(),
  wardNo: v.string(),
  parcelNo: v.string(),
  respondentName: v.optional(v.string()),
  qcStatus,
  status: surveyStatus,
  surveyorName: v.optional(v.string()),
});

/** Other surveys on the same ward + parcel as the given record (QC review context). */
export const listParcelSiblings = query({
  args: { surveyId: v.id("surveys") },
  returns: v.array(parcelSiblingEntry),
  handler: async (ctx, args) => {
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.surveyId)]);
    await requireCapability(ctx, me, "qc.review");
    if (!survey) return [];

    await assertMunicipalityInScope(ctx, me, survey.municipalityId);
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);

    const parcelKey = normalizeParcelKey(survey.parcelNo);
    const wardVariants = new Set([survey.wardNo.trim()]);
    const wardNum = Number(survey.wardNo);
    if (!Number.isNaN(wardNum)) {
      wardVariants.add(String(wardNum));
      wardVariants.add(String(wardNum).padStart(2, "0"));
    }

    const wardRows: Doc<"surveys">[] = [];
    const batches = await Promise.all(
      [...wardVariants].map((ward) =>
        ctx.db
          .query("surveys")
          .withIndex("by_municipality_ward", (q) => q.eq("municipalityId", survey.municipalityId).eq("wardNo", ward))
          .collect(),
      ),
    );
    for (const batch of batches) {
      for (const row of batch) {
        if (!wardRows.some((existing) => existing._id === row._id)) wardRows.push(row);
      }
    }

    const siblings = wardRows.filter(
      (row) =>
        row._id !== args.surveyId &&
        wardNumbersMatch(row.wardNo, survey.wardNo) &&
        normalizeParcelKey(row.parcelNo) === parcelKey,
    );

    const surveyorIds = Array.from(new Set(siblings.map((s) => s.surveyorId)));
    const surveyors = await Promise.all(surveyorIds.map((id) => ctx.db.get(id)));
    const surveyorById = mapTruthyById(surveyors);

    return siblings.map((row) => ({
      _id: row._id,
      propertyId: row.propertyId,
      propertyUse: row.propertyUse,
      unitNo: row.unitNo,
      wardNo: row.wardNo,
      parcelNo: row.parcelNo,
      respondentName: row.respondentName,
      qcStatus: row.qcStatus,
      status: row.status,
      surveyorName: surveyorById.get(row.surveyorId)?.name,
    }));
  },
});

/** Other surveys sharing the same resolved Property ID (blocks QC save until resolved). */
export const listPropertyIdConflicts = query({
  args: { surveyId: v.id("surveys") },
  returns: v.array(parcelSiblingEntry),
  handler: async (ctx, args) => {
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.surveyId)]);
    await requireCapability(ctx, me, "qc.review");
    if (!survey) return [];

    await assertMunicipalityInScope(ctx, me, survey.municipalityId);
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);

    const muni = await ctx.db.get(survey.municipalityId);
    const resolvedId = resolvePropertyId(survey, muni?.code ?? "");
    if (!resolvedId) return [];

    const matches = await ctx.db
      .query("surveys")
      .withIndex("by_property_id", (q) => q.eq("propertyId", resolvedId))
      .collect();

    const conflicts = matches.filter((row) => row._id !== args.surveyId);
    if (conflicts.length === 0) return [];

    const surveyorIds = Array.from(new Set(conflicts.map((s) => s.surveyorId)));
    const surveyors = await Promise.all(surveyorIds.map((id) => ctx.db.get(id)));
    const surveyorById = mapTruthyById(surveyors);

    return conflicts.map((row) => ({
      _id: row._id,
      propertyId: row.propertyId,
      propertyUse: row.propertyUse,
      unitNo: row.unitNo,
      wardNo: row.wardNo,
      parcelNo: row.parcelNo,
      respondentName: row.respondentName,
      qcStatus: row.qcStatus,
      status: row.status,
      surveyorName: surveyorById.get(row.surveyorId)?.name,
    }));
  },
});

export const listRemarks = query({
  args: { surveyId: v.id("surveys") },
  handler: async (ctx, args) => {
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.surveyId)]);
    if (!survey) return [];
    await assertCanAccessSurvey(ctx, me, survey);

    const rows = await ctx.db
      .query("qcRemarks")
      .withIndex("by_survey", (q) => q.eq("surveyId", args.surveyId))
      .order("desc")
      .collect();

    // Hydrate author display
    const authorIds = Array.from(new Set(rows.map((r) => r.authorId)));
    const authors = await Promise.all(authorIds.map((id) => ctx.db.get(id)));
    const byId = mapTruthyById(authors);

    return rows.map((r) => ({
      ...r,
      author: byId.get(r.authorId)
        ? { _id: r.authorId, name: byId.get(r.authorId)!.name, role: byId.get(r.authorId)!.role }
        : null,
    }));
  },
});

export const addRemark = mutation({
  args: {
    surveyId: v.id("surveys"),
    message: v.string(),
    taggedSections: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (args.message.trim().length === 0) {
      clientError("VALIDATION", "Message cannot be empty");
    }
    const survey = await ctx.db.get(args.surveyId);
    if (!survey) clientError("NOT_FOUND", "Survey not found");

    // Surveyors can only write on their own surveys; supervisors/admins on any
    if (me.role === "surveyor" && survey.surveyorId !== me._id) {
      clientError("FORBIDDEN", "Not your survey");
    }
    if (me.role !== "surveyor") {
      assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    }

    const remarkId = await ctx.db.insert("qcRemarks", {
      surveyId: args.surveyId,
      authorId: me._id,
      authorRole: me.role,
      message: args.message.trim(),
      taggedSections: args.taggedSections ?? [],
      status: "open",
    });

    // Notify the other party
    const recipientId = me.role === "surveyor" ? null : survey.surveyorId;
    if (recipientId) {
      await ctx.db.insert("notifications", {
        userId: recipientId,
        type: "qc_remark_received",
        title: "QC remark received",
        body: args.message.slice(0, 120),
        relatedEntity: "survey",
        relatedId: args.surveyId,
      });
    }

    await writeAudit(ctx, {
      actorId: me._id,
      action: "qc.remark_added",
      entity: "survey",
      entityId: args.surveyId,
      metadata: { remarkId, taggedSections: args.taggedSections },
    });
    return remarkId;
  },
});

export const resolveRemark = mutation({
  args: { id: v.id("qcRemarks") },
  handler: async (ctx, args) => {
    const [me, remark] = await Promise.all([requireUser(ctx), ctx.db.get(args.id)]);
    if (!remark) clientError("NOT_FOUND", "Remark not found");
    await ctx.db.patch(args.id, { status: "resolved" });
    await writeAudit(ctx, {
      actorId: me._id,
      action: "qc.remark_resolved",
      entity: "qcRemark",
      entityId: args.id,
      metadata: { surveyId: remark.surveyId },
    });
  },
});

/**
 * Supervisor decision — approve or reject. Cascades to survey:
 *  - approve → survey.qcStatus='approved', status='approved'
 *  - reject  → survey.qcStatus='rejected', status='rejected'
 *
 * Either way the surveyor is notified.
 */
export const decide = mutation({
  args: {
    surveyId: v.id("surveys"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    comment: v.optional(v.string()),
    taggedSections: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.surveyId)]);
    await requireCapability(ctx, me, "qc.decide");
    if (!survey) clientError("NOT_FOUND", "Survey not found");
    if (me.role !== "admin") {
      await assertMunicipalityInScope(ctx, me, survey.municipalityId);
      assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    }
    if (survey.status === "draft") {
      clientError("BAD_STATE", "Draft surveys cannot be reviewed");
    }

    const now = Date.now();
    await Promise.all([
      ctx.db.insert("qcDecisions", {
        surveyId: args.surveyId,
        reviewerId: me._id,
        decision: args.decision,
        comment: args.comment,
        taggedSections: args.taggedSections ?? [],
        decidedAt: now,
      }),
      ctx.db.patch(args.surveyId, {
        qcStatus: args.decision === "approve" ? "approved" : "rejected",
        // Rejection returns the survey to draft so the surveyor can edit and resubmit.
        status: args.decision === "approve" ? "approved" : "draft",
        serverVersion: survey.serverVersion + 1,
      }),
    ]);
    const updated = await ctx.db.get(args.surveyId);
    if (updated) await syncSurveyAggregates(ctx, survey, updated);

    // If there's a comment, persist it as a remark too so the thread is complete.
    if (args.comment && args.comment.trim().length > 0) {
      await ctx.db.insert("qcRemarks", {
        surveyId: args.surveyId,
        authorId: me._id,
        authorRole: me.role,
        message: args.comment.trim(),
        taggedSections: args.taggedSections ?? [],
        status: args.decision === "approve" ? "resolved" : "open",
      });
    }

    await ctx.db.insert("notifications", {
      userId: survey.surveyorId,
      type: args.decision === "approve" ? "qc_approved" : "qc_rejected",
      title: args.decision === "approve" ? "Survey approved" : "Survey returned for revision",
      body:
        args.comment?.slice(0, 120) ??
        (args.decision === "approve"
          ? "Your survey has been approved."
          : "Open the survey to see what needs revising."),
      relatedEntity: "survey",
      relatedId: args.surveyId,
    });

    await writeAudit(ctx, {
      actorId: me._id,
      action: `qc.${args.decision}`,
      entity: "survey",
      entityId: args.surveyId,
      metadata: { taggedSections: args.taggedSections, comment: args.comment },
    });
  },
});

/** Reopen an approved survey for further editing — admin or supervisor only. */
export const reopen = mutation({
  args: { surveyId: v.id("surveys"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.surveyId)]);
    await requireCapability(ctx, me, "qc.reopen");
    if (!survey) clientError("NOT_FOUND", "Survey not found");
    if (me.role !== "admin") {
      await assertMunicipalityInScope(ctx, me, survey.municipalityId);
      assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    }
    if (survey.qcStatus !== "approved") {
      clientError("BAD_STATE", "Only approved surveys can be reopened");
    }
    await Promise.all([
      ctx.db.patch(args.surveyId, {
        qcStatus: "pending",
        status: "submitted",
        serverVersion: survey.serverVersion + 1,
      }),
      writeAudit(ctx, {
        actorId: me._id,
        action: "qc.reopened",
        entity: "survey",
        entityId: args.surveyId,
        metadata: { reason: args.reason },
      }),
    ]);
    const updated = await ctx.db.get(args.surveyId);
    if (updated) await syncSurveyAggregates(ctx, survey, updated);
  },
});
