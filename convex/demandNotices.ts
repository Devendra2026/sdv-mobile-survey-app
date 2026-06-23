import { v } from "convex/values";
import { buildBulkDemandNoticeFilename } from "../lib/reports/demand-notice-filename";
import { mutation, query } from "./_generated/server";
import { requireCapability } from "./capabilities";
import { buildNoticePayloadsForSurveys } from "./demandNoticeData";
import { fieldSurveyAccess } from "./fieldAccess";
import { clientError, requireUser } from "./helpers";
import { compareWardThenParcel } from "./propertyId";
import { collectSurveysForListPaginated } from "./survey";
import { assertMunicipalityInScope, resolveTenantScope, tenantMunicipalityIds } from "./tenancy";

const MAX_EXPORT_SURVEYS = 5000;

const jobStatusValidator = v.union(
  v.literal("queued"),
  v.literal("rendering"),
  v.literal("uploading"),
  v.literal("completed"),
  v.literal("failed"),
);

const exportJobValidator = v.object({
  _id: v.id("demandNoticeExportJobs"),
  status: jobStatusValidator,
  processedCount: v.number(),
  totalCount: v.number(),
  filename: v.string(),
  errorMessage: v.union(v.string(), v.null()),
  downloadUrl: v.union(v.string(), v.null()),
});

function assertJobAccess(
  me: Awaited<ReturnType<typeof requireUser>>,
  job: { requestedBy: import("./_generated/dataModel").Id<"users"> } | null,
) {
  if (!job) clientError("NOT_FOUND", "Export job not found");
  if (job.requestedBy !== me._id && me.role !== "admin") {
    clientError("FORBIDDEN", "You do not have access to this export job");
  }
}

export const startBulkExport = mutation({
  args: {
    municipalityId: v.id("municipalities"),
    districtId: v.optional(v.id("districts")),
    wardNo: v.optional(v.string()),
    reportDateMs: v.number(),
  },
  returns: v.id("demandNoticeExportJobs"),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    await requireCapability(ctx, me, "reports.export");
    await assertMunicipalityInScope(ctx, me, args.municipalityId);

    const scope = await resolveTenantScope(ctx, me);
    const muniIds = tenantMunicipalityIds(scope);
    const access = await fieldSurveyAccess(ctx, me);

    const filtered = await collectSurveysForListPaginated(
      ctx,
      me,
      {
        qcStatus: "approved",
        municipalityId: args.municipalityId,
        districtId: args.districtId,
        wardNo: args.wardNo,
      },
      scope,
      muniIds,
      access,
    );

    if (filtered.length === 0) {
      clientError("VALIDATION", "No QC-approved properties found for this scope");
    }
    if (filtered.length > MAX_EXPORT_SURVEYS) {
      clientError("VALIDATION", `Export is limited to ${MAX_EXPORT_SURVEYS} properties per run`);
    }

    const sorted = filtered.toSorted(compareWardThenParcel);
    const surveyIds = sorted.map((row) => row._id);

    const muni = await ctx.db.get(args.municipalityId);
    const filename = buildBulkDemandNoticeFilename({
      ulbName: muni?.name,
      wardNo: args.wardNo,
    });

    const jobId = await ctx.db.insert("demandNoticeExportJobs", {
      requestedBy: me._id,
      municipalityId: args.municipalityId,
      districtId: args.districtId,
      wardNo: args.wardNo,
      status: "queued",
      surveyIds,
      processedCount: 0,
      totalCount: surveyIds.length,
      filename,
      reportDateMs: args.reportDateMs,
      createdAt: Date.now(),
    });

    await ctx.db.patch(jobId, { status: "rendering" });
    return jobId;
  },
});

export const getExportJob = query({
  args: { jobId: v.id("demandNoticeExportJobs") },
  returns: exportJobValidator,
  handler: async (ctx, args) => {
    const [me, job] = await Promise.all([requireUser(ctx), ctx.db.get(args.jobId)]);
    assertJobAccess(me, job);

    let downloadUrl: string | null = null;
    if (job!.status === "completed" && job!.storageId) {
      downloadUrl = await ctx.storage.getUrl(job!.storageId);
    }

    return {
      _id: job!._id,
      status: job!.status,
      processedCount: job!.processedCount,
      totalCount: job!.totalCount,
      filename: job!.filename,
      errorMessage: job!.errorMessage ?? null,
      downloadUrl,
    };
  },
});

export const getNoticeForSurvey = query({
  args: {
    surveyId: v.id("surveys"),
    reportDateMs: v.optional(v.number()),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.surveyId)]);
    if (!survey || survey.qcStatus !== "approved") return null;
    await assertMunicipalityInScope(ctx, me, survey.municipalityId);

    const payloads = await buildNoticePayloadsForSurveys(ctx, me, {
      surveyIds: [args.surveyId],
      municipalityId: survey.municipalityId,
      reportDateMs: args.reportDateMs ?? Date.now(),
    });

    return payloads[0] ?? null;
  },
});

export const getNoticePayloads = query({
  args: { jobId: v.id("demandNoticeExportJobs") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const [me, job] = await Promise.all([requireUser(ctx), ctx.db.get(args.jobId)]);
    assertJobAccess(me, job);

    return await buildNoticePayloadsForSurveys(ctx, me, {
      surveyIds: job!.surveyIds,
      municipalityId: job!.municipalityId,
      reportDateMs: job!.reportDateMs,
    });
  },
});

export const updateExportProgress = mutation({
  args: {
    jobId: v.id("demandNoticeExportJobs"),
    processedCount: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [me, job] = await Promise.all([requireUser(ctx), ctx.db.get(args.jobId)]);
    assertJobAccess(me, job);

    await ctx.db.patch(args.jobId, {
      processedCount: Math.min(args.processedCount, job!.totalCount),
      status: "rendering",
    });
    return null;
  },
});

export const generateUploadUrl = mutation({
  args: { jobId: v.id("demandNoticeExportJobs") },
  returns: v.string(),
  handler: async (ctx, args) => {
    const [me, job] = await Promise.all([requireUser(ctx), ctx.db.get(args.jobId)]);
    assertJobAccess(me, job);
    const [, uploadUrl] = await Promise.all([
      ctx.db.patch(args.jobId, { status: "uploading" }),
      ctx.storage.generateUploadUrl(),
    ]);
    return uploadUrl;
  },
});

export const completeExport = mutation({
  args: {
    jobId: v.id("demandNoticeExportJobs"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [me, job] = await Promise.all([requireUser(ctx), ctx.db.get(args.jobId)]);
    assertJobAccess(me, job);

    await ctx.db.patch(args.jobId, {
      status: "completed",
      storageId: args.storageId,
      processedCount: job!.totalCount,
      completedAt: Date.now(),
    });
    return null;
  },
});

export const failExport = mutation({
  args: {
    jobId: v.id("demandNoticeExportJobs"),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [me, job] = await Promise.all([requireUser(ctx), ctx.db.get(args.jobId)]);
    assertJobAccess(me, job);

    await ctx.db.patch(args.jobId, {
      status: "failed",
      errorMessage: args.errorMessage,
      completedAt: Date.now(),
    });
    return null;
  },
});
