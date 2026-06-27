/**
 * Precomputed survey counters — avoids full-table collects on dashboard/analytics.
 *
 * Buckets: surveyor, municipality, district, ward (when wardNo set).
 * Updated on survey insert/patch/delete via syncSurveyAggregates().
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fieldSurveyAccess } from "../fieldAccess";
import { resolveTenantScope, tenantMunicipalityIds } from "../tenancy";

export type SurveyCounterSlice = {
  total: number;
  drafts: number;
  submitted: number;
  pending: number;
  approved: number;
  rejected: number;
};

export type DashboardCountsFromAggregates = SurveyCounterSlice & {
  today: number;
  submittedToday: number;
};

const ZERO: SurveyCounterSlice = {
  total: 0,
  drafts: 0,
  submitted: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
};

export function emptyCounters(): SurveyCounterSlice {
  return { ...ZERO };
}

/** Classify a survey row into counter buckets (matches masters.dashboardCounts logic). */
export function classifySurveyCounters(survey: Doc<"surveys">): SurveyCounterSlice {
  const drafts = survey.status === "draft" ? 1 : 0;
  const submitted = survey.status === "submitted" ? 1 : 0;
  const pending = survey.qcStatus === "pending" && survey.status === "submitted" ? 1 : 0;
  const approved = survey.qcStatus === "approved" ? 1 : 0;
  const rejected = survey.qcStatus === "rejected" ? 1 : 0;
  return { total: 1, drafts, submitted, pending, approved, rejected };
}

export function subtractCounters(a: SurveyCounterSlice, b: SurveyCounterSlice): SurveyCounterSlice {
  return {
    total: a.total - b.total,
    drafts: a.drafts - b.drafts,
    submitted: a.submitted - b.submitted,
    pending: a.pending - b.pending,
    approved: a.approved - b.approved,
    rejected: a.rejected - b.rejected,
  };
}

export function addCounters(a: SurveyCounterSlice, b: SurveyCounterSlice): SurveyCounterSlice {
  return {
    total: a.total + b.total,
    drafts: a.drafts + b.drafts,
    submitted: a.submitted + b.submitted,
    pending: a.pending + b.pending,
    approved: a.approved + b.approved,
    rejected: a.rejected + b.rejected,
  };
}

export function bucketKeysForSurvey(survey: Doc<"surveys">): string[] {
  const keys = [
    `surveyor:${survey.surveyorId}`,
    `municipality:${survey.municipalityId}`,
    `district:${survey.districtId}`,
  ];
  const ward = survey.wardNo?.trim();
  if (ward) keys.push(`ward:${survey.municipalityId}:${ward}`);
  return keys;
}

function dateKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function getOrCreateBucket(ctx: MutationCtx, bucketKey: string) {
  const existing = await ctx.db
    .query("surveyAggregateBuckets")
    .withIndex("by_bucketKey", (q) => q.eq("bucketKey", bucketKey))
    .unique();
  if (existing) return existing;
  const id = await ctx.db.insert("surveyAggregateBuckets", { bucketKey, ...ZERO });
  const row = await ctx.db.get(id);
  if (!row) throw new Error("Failed to create aggregate bucket");
  return row;
}

async function applyBucketDelta(ctx: MutationCtx, bucketKey: string, delta: SurveyCounterSlice) {
  if (
    delta.total === 0 &&
    delta.drafts === 0 &&
    delta.submitted === 0 &&
    delta.pending === 0 &&
    delta.approved === 0 &&
    delta.rejected === 0
  ) {
    return;
  }
  const row = await getOrCreateBucket(ctx, bucketKey);
  await ctx.db.patch(row._id, {
    total: Math.max(0, row.total + delta.total),
    drafts: Math.max(0, row.drafts + delta.drafts),
    submitted: Math.max(0, row.submitted + delta.submitted),
    pending: Math.max(0, row.pending + delta.pending),
    approved: Math.max(0, row.approved + delta.approved),
    rejected: Math.max(0, row.rejected + delta.rejected),
  });
}

async function applyDailyDelta(
  ctx: MutationCtx,
  bucketKey: string,
  dateKey: string,
  field: "created" | "submitted",
  delta: number,
) {
  if (delta === 0) return;
  const existing = await ctx.db
    .query("surveyDailyRollups")
    .withIndex("by_bucket_date", (q) => q.eq("bucketKey", bucketKey).eq("dateKey", dateKey))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { [field]: Math.max(0, existing[field] + delta) });
    return;
  }
  await ctx.db.insert("surveyDailyRollups", {
    bucketKey,
    dateKey,
    created: field === "created" ? Math.max(0, delta) : 0,
    submitted: field === "submitted" ? Math.max(0, delta) : 0,
  });
}

function dailyDeltasForSurvey(survey: Doc<"surveys">, sign: 1 | -1) {
  const createdDate = dateKeyFromMs(survey._creationTime);
  const submittedDate = survey.submittedAt !== undefined ? dateKeyFromMs(survey.submittedAt) : null;
  return { createdDate, submittedDate, sign };
}

async function applySurveyToBuckets(ctx: MutationCtx, survey: Doc<"surveys">, sign: 1 | -1) {
  const counters = classifySurveyCounters(survey);
  const delta: SurveyCounterSlice = {
    total: counters.total * sign,
    drafts: counters.drafts * sign,
    submitted: counters.submitted * sign,
    pending: counters.pending * sign,
    approved: counters.approved * sign,
    rejected: counters.rejected * sign,
  };
  const keys = bucketKeysForSurvey(survey);
  await Promise.all(keys.map((key) => applyBucketDelta(ctx, key, delta)));

  const { createdDate, submittedDate, sign: s } = dailyDeltasForSurvey(survey, sign);
  const createdDelta = s;
  await Promise.all(keys.map((key) => applyDailyDelta(ctx, key, createdDate, "created", createdDelta)));
  if (submittedDate && survey.status === "submitted") {
    await Promise.all(keys.map((key) => applyDailyDelta(ctx, key, submittedDate, "submitted", s)));
  }
}

/** Call after survey insert, patch, or delete. */
export async function syncSurveyAggregates(
  ctx: MutationCtx,
  before: Doc<"surveys"> | null,
  after: Doc<"surveys"> | null,
) {
  if (before && after && before._id === after._id) {
    const oldKeys = new Set(bucketKeysForSurvey(before));
    const newKeys = new Set(bucketKeysForSurvey(after));
    const counterChanged =
      JSON.stringify(classifySurveyCounters(before)) !== JSON.stringify(classifySurveyCounters(after));
    const keysChanged = oldKeys.size !== newKeys.size || [...oldKeys].some((k) => !newKeys.has(k));
    const submittedAtChanged = before.submittedAt !== after.submittedAt;
    if (!counterChanged && !keysChanged && !submittedAtChanged) return;
  }
  if (before) await applySurveyToBuckets(ctx, before, -1);
  if (after) await applySurveyToBuckets(ctx, after, 1);
}

async function readBucket(ctx: QueryCtx, bucketKey: string): Promise<SurveyCounterSlice> {
  const row = await ctx.db
    .query("surveyAggregateBuckets")
    .withIndex("by_bucketKey", (q) => q.eq("bucketKey", bucketKey))
    .unique();
  return row
    ? {
        total: row.total,
        drafts: row.drafts,
        submitted: row.submitted,
        pending: row.pending,
        approved: row.approved,
        rejected: row.rejected,
      }
    : emptyCounters();
}

async function sumBuckets(ctx: QueryCtx, keys: string[]): Promise<SurveyCounterSlice> {
  let acc = emptyCounters();
  for (const key of keys) {
    acc = addCounters(acc, await readBucket(ctx, key));
  }
  return acc;
}

export async function sumDailyForDate(
  ctx: QueryCtx,
  keys: string[],
  dateKey: string,
): Promise<{ created: number; submitted: number }> {
  let created = 0;
  let submitted = 0;
  for (const key of keys) {
    const row = await ctx.db
      .query("surveyDailyRollups")
      .withIndex("by_bucket_date", (q) => q.eq("bucketKey", key).eq("dateKey", dateKey))
      .unique();
    if (row) {
      created += row.created;
      submitted += row.submitted;
    }
  }
  return { created, submitted };
}

function todayDateKey(nowMs: number): string {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return dateKeyFromMs(d.getTime());
}

/** Resolve bucket keys visible to the caller for dashboard-style aggregates. */
export async function bucketKeysForUserScope(
  ctx: QueryCtx,
  me: Doc<"users">,
  scope: Awaited<ReturnType<typeof resolveTenantScope>>,
  access: Awaited<ReturnType<typeof fieldSurveyAccess>>,
): Promise<string[]> {
  if (access === "none") return [];
  if (access === "own") return [`surveyor:${me._id}`];

  const muniIdSet = tenantMunicipalityIds(scope);
  const muniIds = scope.municipalities.length > 0 ? scope.municipalities.map((m) => m._id) : [...muniIdSet];

  if (access === "admin" || access === "assigned") {
    if (muniIds.length > 0) {
      return muniIds.map((id) => `municipality:${id}`);
    }
    return scope.districts.map((d) => `district:${d._id}`);
  }
  return [];
}
export async function readDashboardCountsFromAggregates(
  ctx: QueryCtx,
  me: Doc<"users">,
  nowMs: number,
): Promise<DashboardCountsFromAggregates> {
  const [access, scope] = await Promise.all([fieldSurveyAccess(ctx, me), resolveTenantScope(ctx, me)]);
  const keys = await bucketKeysForUserScope(ctx, me, scope, access);
  if (keys.length === 0) {
    return { ...emptyCounters(), today: 0, submittedToday: 0 };
  }

  const counters = await sumBuckets(ctx, keys);
  const dateKey = todayDateKey(nowMs);
  const daily = await sumDailyForDate(ctx, keys, dateKey);

  return {
    ...counters,
    today: daily.created,
    submittedToday: daily.submitted,
    pending: counters.pending,
  };
}

export async function readBucketByKey(ctx: QueryCtx, bucketKey: string): Promise<SurveyCounterSlice> {
  return readBucket(ctx, bucketKey);
}

export async function readDailyTrendFromAggregates(
  ctx: QueryCtx,
  keys: string[],
  days: number,
  nowMs: number,
): Promise<Array<{ date: string; created: number; submitted: number; approved: number; rejected: number }>> {
  const buckets: Map<string, { created: number; submitted: number }> = new Map();
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    buckets.set(dateKeyFromMs(d.getTime()), { created: 0, submitted: 0 });
  }

  for (const key of keys) {
    const rows = await ctx.db
      .query("surveyDailyRollups")
      .withIndex("by_bucketKey", (q) => q.eq("bucketKey", key))
      .collect();
    for (const row of rows) {
      const b = buckets.get(row.dateKey);
      if (b) {
        b.created += row.created;
        b.submitted += row.submitted;
      }
    }
  }

  return [...buckets.entries()].map(([date, b]) => ({
    date,
    created: b.created,
    submitted: b.submitted,
    approved: 0,
    rejected: 0,
  }));
}

export async function readWardCoverageFromAggregates(
  ctx: QueryCtx,
  municipalityIds: Id<"municipalities">[],
): Promise<
  Array<{
    municipalityId: Id<"municipalities">;
    wardNo: string;
    total: number;
    approved: number;
  }>
> {
  const results: Array<{
    municipalityId: Id<"municipalities">;
    wardNo: string;
    total: number;
    approved: number;
  }> = [];

  for (const muniId of municipalityIds) {
    const wards = await ctx.db
      .query("wards")
      .withIndex("by_municipality_ward", (q) => q.eq("municipalityId", muniId))
      .collect();
    for (const ward of wards) {
      const bucket = await readBucket(ctx, `ward:${muniId}:${ward.wardNo}`);
      if (bucket.total === 0) continue;
      results.push({
        municipalityId: muniId,
        wardNo: ward.wardNo,
        total: bucket.total,
        approved: bucket.approved,
      });
    }
  }
  return results.sort((a, b) => b.total - a.total);
}
