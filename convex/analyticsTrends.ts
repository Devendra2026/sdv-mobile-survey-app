/**
 * analyticsTrends.ts — time-series + coverage aggregates for the web dashboard.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 * `analytics.surveyStatsBreakdown` already returns summary KPIs and the
 * by-district / by-ULB / by-surveyor breakdown tables — the web reuses those
 * directly. What it does NOT return is:
 *
 *   • a per-DAY series (the brief's "Daily Survey Trend" / "Approval Trend"), or
 *   • a per-WARD coverage roll-up (the brief's "Ward Coverage").
 *
 * Deriving these on the client would require pulling every raw survey row,
 * which `surveys.list` caps at 200 — so the numbers would silently undercount.
 * The correct, faithful fix is a server query that aggregates inside the same
 * tenant scope. This module ADDS read-only queries; it changes no schema,
 * writes nothing, and reuses the exact tenancy helpers the mobile app uses.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { requireCapability } from "./capabilities";
import { collectSurveysInFieldScope } from "./fieldAccess";
import { requireUser } from "./helpers";
import { resolveTenantScope } from "./tenancy";

async function loadScopedSurveys(ctx: QueryCtx, me: Doc<"users">): Promise<Doc<"surveys">[]> {
  return collectSurveysInFieldScope(ctx, me);
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  // local-day bucket (YYYY-MM-DD)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Daily survey + approval trend over the last `days` days (default 30),
 * scoped to the caller. Returns a dense series (zero-filled) so charts
 * don't show gaps.
 */
export const dailyTrend = query({
  args: {
    days: v.optional(v.number()),
    districtId: v.optional(v.id("districts")),
    municipalityId: v.optional(v.id("municipalities")),
    nowMs: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      date: v.string(),
      created: v.number(),
      submitted: v.number(),
      approved: v.number(),
      rejected: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    await requireCapability(ctx, me, "analytics.view");
    const days = Math.min(Math.max(args.days ?? 30, 1), 180);

    let rows = await loadScopedSurveys(ctx, me);
    if (args.districtId) rows = rows.filter((r) => r.districtId === args.districtId);
    if (args.municipalityId) rows = rows.filter((r) => r.municipalityId === args.municipalityId);

    if (args.nowMs === undefined) {
      return [];
    }

    const start = new Date(args.nowMs);
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
      // "created" keyed by creation day
      if (r._creationTime >= startMs) {
        const b = buckets.get(dayKey(r._creationTime));
        if (b) b.created += 1;
      }
      // "submitted" keyed by submittedAt
      if (r.submittedAt && r.submittedAt >= startMs) {
        const b = buckets.get(dayKey(r.submittedAt));
        if (b) b.submitted += 1;
      }
      // approval/rejection keyed by creation day of the decision is not stored
      // on the survey; approximate with current qcStatus on the submit day.
      if (r.submittedAt && r.submittedAt >= startMs) {
        const b = buckets.get(dayKey(r.submittedAt));
        if (b) {
          if (r.qcStatus === "approved") b.approved += 1;
          else if (r.qcStatus === "rejected") b.rejected += 1;
        }
      }
    }

    return [...buckets.entries()].map(([date, b]) => ({ date, ...b }));
  },
});

/** Per-ward coverage roll-up within tenant scope (brief's "Ward Coverage"). */
export const wardCoverage = query({
  args: {
    districtId: v.optional(v.id("districts")),
    municipalityId: v.optional(v.id("municipalities")),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    await requireCapability(ctx, me, "analytics.view");

    let rows = await loadScopedSurveys(ctx, me);
    if (args.districtId) rows = rows.filter((r) => r.districtId === args.districtId);
    if (args.municipalityId) rows = rows.filter((r) => r.municipalityId === args.municipalityId);

    const scope = await resolveTenantScope(ctx, me);
    const muniMap = new Map(scope.municipalities.map((m) => [m._id, m]));

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
  },
});
