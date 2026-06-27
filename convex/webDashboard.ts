/**
 * Web-only dashboard queries — single-pass aggregates for the home screen.
 * Mobile does not call these; existing `masters.dashboardCounts` / `analytics.*`
 * endpoints remain unchanged for backward compatibility.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { hasCapability } from "./capabilities";
import { fieldSurveyAccess, querySurveysInFieldScope } from "./fieldAccess";
import { requireUser } from "./helpers";
import {
  bucketKeysForUserScope,
  readBucketByKey,
  readDailyTrendFromAggregates,
  readDashboardCountsFromAggregates,
  readWardCoverageFromAggregates,
  sumDailyForDate,
} from "./lib/surveyAggregates";
import { qcStatus, surveyStatus } from "./schema";
import { resolveTenantScope, tenantDistrictIds, tenantMunicipalityIds } from "./tenancy";

const surveyCountsShape = {
  total: v.number(),
  today: v.number(),
  drafts: v.number(),
  submitted: v.number(),
  approved: v.number(),
  rejected: v.number(),
};

const breakdownRow = { ...surveyCountsShape };

const dashboardCountsShape = {
  total: v.number(),
  today: v.number(),
  drafts: v.number(),
  pending: v.number(),
  submittedToday: v.number(),
  approved: v.number(),
  submitted: v.number(),
  rejected: v.number(),
};

const qcSupervisorRow = {
  reviewerId: v.id("users"),
  name: v.string(),
  email: v.string(),
  approved: v.number(),
  rejected: v.number(),
  total: v.number(),
};

const userFilterOption = v.object({
  _id: v.id("users"),
  name: v.string(),
  email: v.string(),
});

const statsBreakdownShape = v.object({
  summary: v.object(surveyCountsShape),
  byDistrict: v.array(
    v.object({
      districtId: v.id("districts"),
      code: v.string(),
      name: v.string(),
      ...breakdownRow,
    }),
  ),
  byUlb: v.array(
    v.object({
      municipalityId: v.id("municipalities"),
      code: v.string(),
      name: v.string(),
      districtId: v.id("districts"),
      districtName: v.string(),
      ...breakdownRow,
    }),
  ),
  bySurveyor: v.array(
    v.object({
      surveyorId: v.id("users"),
      name: v.string(),
      email: v.string(),
      municipalityName: v.union(v.string(), v.null()),
      districtName: v.union(v.string(), v.null()),
      status: v.literal("active"),
      ...breakdownRow,
    }),
  ),
  byQcSupervisor: v.array(v.object(qcSupervisorRow)),
  filterOptions: v.object({
    districts: v.array(
      v.object({
        _id: v.id("districts"),
        code: v.string(),
        name: v.string(),
      }),
    ),
    municipalities: v.array(
      v.object({
        _id: v.id("municipalities"),
        code: v.string(),
        name: v.string(),
        districtId: v.id("districts"),
      }),
    ),
    surveyors: v.array(userFilterOption),
    qcSupervisors: v.array(userFilterOption),
  }),
});

const dailyTrendPointShape = v.object({
  date: v.string(),
  created: v.number(),
  submitted: v.number(),
  approved: v.number(),
  rejected: v.number(),
});

const wardCoverageRowShape = v.object({
  municipalityId: v.id("municipalities"),
  municipalityName: v.string(),
  wardNo: v.string(),
  total: v.number(),
  approved: v.number(),
  approvalRate: v.number(),
});

const homeBundleShape = v.object({
  counts: v.object(dashboardCountsShape),
  analytics: v.union(
    v.null(),
    v.object({
      breakdown: statsBreakdownShape,
      dailyTrend: v.array(dailyTrendPointShape),
      wardCoverage: v.array(wardCoverageRowShape),
    }),
  ),
});

const EMPTY_COUNTS = {
  total: 0,
  today: 0,
  drafts: 0,
  pending: 0,
  submittedToday: 0,
  approved: 0,
  submitted: 0,
  rejected: 0,
};

type SurveyCounts = {
  total: number;
  today: number;
  drafts: number;
  submitted: number;
  approved: number;
  rejected: number;
};

function countRows(rows: Doc<"surveys">[], todayStartMs: number | null): SurveyCounts {
  return {
    total: rows.length,
    today: todayStartMs !== null ? rows.filter((r) => r._creationTime >= todayStartMs).length : 0,
    drafts: rows.filter((r) => r.status === "draft").length,
    submitted: rows.filter((r) => r.status === "submitted").length,
    approved: rows.filter((r) => r.qcStatus === "approved").length,
    rejected: rows.filter((r) => r.qcStatus === "rejected").length,
  };
}

function computeDashboardCounts(rows: Doc<"surveys">[], todayMs: number | null) {
  return {
    total: rows.length,
    today: todayMs !== null ? rows.filter((r) => r._creationTime >= todayMs).length : 0,
    drafts: rows.filter((r) => r.status === "draft").length,
    pending: rows.filter((r) => r.qcStatus === "pending" && r.status === "submitted").length,
    submittedToday:
      todayMs !== null
        ? rows.filter(
            (r) =>
              r.status === "submitted" &&
              (r.submittedAt !== undefined ? r.submittedAt >= todayMs : r._creationTime >= todayMs),
          ).length
        : 0,
    approved: rows.filter((r) => r.qcStatus === "approved").length,
    submitted: rows.filter((r) => r.status === "submitted").length,
    rejected: rows.filter((r) => r.qcStatus === "rejected").length,
  };
}

function groupCounts(rows: Doc<"surveys">[], keyFn: (row: Doc<"surveys">) => string): Map<string, Doc<"surveys">[]> {
  const groups = new Map<string, Doc<"surveys">[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

function filterActiveUsersInScope(
  users: Doc<"users">[],
  muniIds: Set<Id<"municipalities">>,
  districtIds: Set<Id<"districts">>,
): Doc<"users">[] {
  return users.filter((u) => {
    if (u.municipalityId && !muniIds.has(u.municipalityId)) return false;
    if (u.districtId && !districtIds.has(u.districtId)) return false;
    return true;
  });
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Pick the cheaper QC decision load strategy based on scope size. */
async function loadScopedQcDecisionsByReviewer(
  ctx: QueryCtx,
  scopedSurveyIds: Set<Id<"surveys">>,
  activeQcSupervisors: Doc<"users">[],
): Promise<Map<Id<"users">, Doc<"qcDecisions">[]>> {
  const byReviewer = new Map<Id<"users">, Doc<"qcDecisions">[]>();
  for (const u of activeQcSupervisors) {
    byReviewer.set(u._id, []);
  }

  if (scopedSurveyIds.size === 0 || activeQcSupervisors.length === 0) {
    return byReviewer;
  }

  if (scopedSurveyIds.size <= activeQcSupervisors.length) {
    const allDecisions: Doc<"qcDecisions">[] = [];
    await Promise.all(
      [...scopedSurveyIds].map(async (surveyId) => {
        const decisions = await ctx.db
          .query("qcDecisions")
          .withIndex("by_survey", (q) => q.eq("surveyId", surveyId))
          .collect();
        allDecisions.push(...decisions);
      }),
    );
    for (const d of allDecisions) {
      const bucket = byReviewer.get(d.reviewerId);
      if (bucket) bucket.push(d);
    }
    return byReviewer;
  }

  await Promise.all(
    activeQcSupervisors.map(async (u) => {
      const decisions = await ctx.db
        .query("qcDecisions")
        .withIndex("by_reviewer", (q) => q.eq("reviewerId", u._id))
        .collect();
      byReviewer.set(
        u._id,
        decisions.filter((d) => scopedSurveyIds.has(d.surveyId)),
      );
    }),
  );
  return byReviewer;
}

async function countsFromBucket(ctx: QueryCtx, bucketKey: string, todayDateKey: string | null) {
  const c = await readBucketByKey(ctx, bucketKey);
  let today = 0;
  if (todayDateKey) {
    const daily = await sumDailyForDate(ctx, [bucketKey], todayDateKey);
    today = daily.created;
  }
  return {
    total: c.total,
    today,
    drafts: c.drafts,
    submitted: c.submitted,
    approved: c.approved,
    rejected: c.rejected,
  };
}

async function computeStatsBreakdown(ctx: QueryCtx, me: Doc<"users">, todayStartMs: number | null) {
  const scope = await resolveTenantScope(ctx, me);
  const districtIds = tenantDistrictIds(scope);
  const muniIds = tenantMunicipalityIds(scope);
  const districtMap = new Map(scope.districts.map((d) => [d._id, d]));
  const muniMap = new Map(scope.municipalities.map((m) => [m._id, m]));
  const todayDateKey =
    todayStartMs !== null
      ? `${new Date(todayStartMs).getFullYear()}-${String(new Date(todayStartMs).getMonth() + 1).padStart(2, "0")}-${String(new Date(todayStartMs).getDate()).padStart(2, "0")}`
      : null;

  const byDistrict = await Promise.all(
    scope.districts.map(async (d) => ({
      districtId: d._id,
      code: d.code,
      name: d.name,
      ...(await countsFromBucket(ctx, `district:${d._id}`, todayDateKey)),
    })),
  );
  byDistrict.sort((a, b) => a.name.localeCompare(b.name));

  const byUlb = await Promise.all(
    scope.municipalities.map(async (m) => {
      const d = districtMap.get(m.districtId);
      return {
        municipalityId: m._id,
        code: m.code,
        name: m.name,
        districtId: m.districtId,
        districtName: d?.name ?? "—",
        ...(await countsFromBucket(ctx, `municipality:${m._id}`, todayDateKey)),
      };
    }),
  );
  byUlb.sort((a, b) => a.name.localeCompare(b.name));

  const activeSurveyors = filterActiveUsersInScope(
    await ctx.db
      .query("users")
      .withIndex("by_role_status", (q) => q.eq("role", "surveyor").eq("status", "active"))
      .collect(),
    muniIds,
    districtIds,
  );

  const bySurveyor = (
    await Promise.all(
      activeSurveyors.map(async (u) => {
        const muni = u.municipalityId ? muniMap.get(u.municipalityId) : undefined;
        const dist = u.districtId ? districtMap.get(u.districtId) : muni ? districtMap.get(muni.districtId) : undefined;
        return {
          surveyorId: u._id,
          name: u.name,
          email: u.email,
          municipalityName: muni?.name ?? null,
          districtName: dist?.name ?? null,
          status: "active" as const,
          ...(await countsFromBucket(ctx, `surveyor:${u._id}`, todayDateKey)),
        };
      }),
    )
  ).sort((a, b) => b.approved + b.submitted - (a.approved + a.submitted));

  const activeQcSupervisors = filterActiveUsersInScope(
    await ctx.db
      .query("users")
      .withIndex("by_role_status", (q) => q.eq("role", "qc_supervisor").eq("status", "active"))
      .collect(),
    muniIds,
    districtIds,
  );

  const { collectSurveysInFieldScope } = await import("./fieldAccess");
  const rows = await collectSurveysInFieldScope(ctx, me);
  const scopedSurveyIds = new Set(rows.map((r) => r._id));
  const decisionsByReviewer = await loadScopedQcDecisionsByReviewer(ctx, scopedSurveyIds, activeQcSupervisors);

  const byQcSupervisor = activeQcSupervisors
    .map((u) => {
      const scoped = decisionsByReviewer.get(u._id) ?? [];
      const approved = scoped.filter((d) => d.decision === "approve").length;
      const rejected = scoped.filter((d) => d.decision === "reject").length;
      return {
        reviewerId: u._id,
        name: u.name,
        email: u.email,
        approved,
        rejected,
        total: scoped.length,
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    summary: await (async () => {
      const access = await fieldSurveyAccess(ctx, me);
      const keys = await bucketKeysForUserScope(ctx, me, scope, access);
      let summary = { total: 0, today: 0, drafts: 0, submitted: 0, approved: 0, rejected: 0 };
      for (const key of keys) {
        const part = await countsFromBucket(ctx, key, todayDateKey);
        summary = {
          total: summary.total + part.total,
          today: summary.today + part.today,
          drafts: summary.drafts + part.drafts,
          submitted: summary.submitted + part.submitted,
          approved: summary.approved + part.approved,
          rejected: summary.rejected + part.rejected,
        };
      }
      return summary;
    })(),
    byDistrict,
    byUlb,
    bySurveyor,
    byQcSupervisor,
    filterOptions: {
      districts: scope.districts.map((d) => ({ _id: d._id, code: d.code, name: d.name })),
      municipalities: scope.municipalities.map((m) => ({
        _id: m._id,
        code: m.code,
        name: m.name,
        districtId: m.districtId,
      })),
      surveyors: activeSurveyors.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
      })),
      qcSupervisors: activeQcSupervisors.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
      })),
    },
  };
}

function computeDailyTrend(rows: Doc<"surveys">[], days: number, nowMs: number) {
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const startMs = start.getTime();

  type Bucket = { created: number; submitted: number; approved: number; rejected: number };
  const buckets = new Map<string, Bucket>();
  for (let i = 0; i < days; i++) {
    const d = new Date(startMs);
    d.setDate(d.getDate() + i);
    buckets.set(dayKey(d.getTime()), { created: 0, submitted: 0, approved: 0, rejected: 0 });
  }

  for (const r of rows) {
    if (r._creationTime >= startMs) {
      const b = buckets.get(dayKey(r._creationTime));
      if (b) b.created += 1;
    }
    if (r.submittedAt && r.submittedAt >= startMs) {
      const b = buckets.get(dayKey(r.submittedAt));
      if (b) {
        b.submitted += 1;
        if (r.qcStatus === "approved") b.approved += 1;
        else if (r.qcStatus === "rejected") b.rejected += 1;
      }
    }
  }

  return [...buckets.entries()].map(([date, b]) => ({ date, ...b }));
}

function computeWardCoverage(rows: Doc<"surveys">[], muniMap: Map<Id<"municipalities">, Doc<"municipalities">>) {
  const groups = new Map<
    string,
    { municipalityId: Id<"municipalities">; wardNo: string; total: number; approved: number }
  >();
  for (const r of rows) {
    const key = `${r.municipalityId}::${r.wardNo}`;
    const g = groups.get(key) ?? { municipalityId: r.municipalityId, wardNo: r.wardNo, total: 0, approved: 0 };
    g.total += 1;
    if (r.qcStatus === "approved") g.approved += 1;
    groups.set(key, g);
  }

  return [...groups.values()]
    .map((g) => ({
      ...g,
      municipalityName: muniMap.get(g.municipalityId)?.name ?? "—",
      approvalRate: g.total > 0 ? Math.round((g.approved / g.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Home dashboard bundle for the web app — uses precomputed survey aggregates.
 */
export const homeBundle = query({
  args: {
    nowMs: v.number(),
    trendDays: v.optional(v.number()),
  },
  returns: homeBundleShape,
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, { allowPending: true });

    if (me.status !== "active") {
      return { counts: EMPTY_COUNTS, analytics: null };
    }

    const agg = await readDashboardCountsFromAggregates(ctx, me, args.nowMs);
    const counts = {
      total: agg.total,
      today: agg.today,
      drafts: agg.drafts,
      pending: agg.pending,
      submittedToday: agg.submittedToday,
      approved: agg.approved,
      submitted: agg.submitted,
      rejected: agg.rejected,
    };

    const canViewAnalytics = await hasCapability(ctx, me, "analytics.view");
    if (!canViewAnalytics) {
      return { counts, analytics: null };
    }

    const days = Math.min(Math.max(args.trendDays ?? 30, 1), 180);
    const scope = await resolveTenantScope(ctx, me);
    const access = await fieldSurveyAccess(ctx, me);
    const keys = await bucketKeysForUserScope(ctx, me, scope, access);
    const muniMap = new Map(scope.municipalities.map((m) => [m._id, m]));

    const todayMs = (() => {
      const d = new Date(args.nowMs);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })();

    const [breakdown, dailyTrend, wardRows] = await Promise.all([
      computeStatsBreakdown(ctx, me, todayMs),
      readDailyTrendFromAggregates(ctx, keys, days, args.nowMs),
      readWardCoverageFromAggregates(
        ctx,
        scope.municipalities.map((m) => m._id),
      ),
    ]);

    const wardCoverage = wardRows.map((g) => ({
      ...g,
      municipalityName: muniMap.get(g.municipalityId)?.name ?? "—",
      approvalRate: g.total > 0 ? Math.round((g.approved / g.total) * 100) : 0,
    }));

    return {
      counts,
      analytics: { breakdown, dailyTrend, wardCoverage },
    };
  },
});

const recentActivityRowShape = v.object({
  _id: v.id("surveys"),
  propertyId: v.optional(v.string()),
  parcelNo: v.optional(v.string()),
  status: surveyStatus,
  qcStatus: qcStatus,
  _creationTime: v.number(),
  submittedAt: v.optional(v.number()),
  surveyor: v.optional(v.object({ name: v.optional(v.string()) })),
});

/** Lightweight recent surveys for the home activity feed (web only). */
export const recentActivity = query({
  args: {},
  returns: v.array(recentActivityRowShape),
  handler: async (ctx) => {
    const me = await requireUser(ctx, { allowPending: true });
    if (me.status !== "active") return [];

    const rows = await querySurveysInFieldScope(ctx, me, { limit: 20 });
    const surveyorIds = [...new Set(rows.map((r) => r.surveyorId))];
    const surveyors = await Promise.all(surveyorIds.map((id) => ctx.db.get("users", id)));
    const nameById = new Map<Id<"users">, string>();
    for (const s of surveyors) {
      if (s) nameById.set(s._id, s.name);
    }

    return rows.map((r) => ({
      _id: r._id,
      propertyId: r.propertyId,
      parcelNo: r.parcelNo,
      status: r.status,
      qcStatus: r.qcStatus,
      _creationTime: r._creationTime,
      submittedAt: r.submittedAt,
      surveyor: { name: nameById.get(r.surveyorId) },
    }));
  },
});
