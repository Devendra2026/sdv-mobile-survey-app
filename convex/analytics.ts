/**
 * Survey analytics — district, ULB, and surveyor breakdowns for admin & supervisor panels.
 *
 * All counts respect `resolveTenantScope`: supervisors see only their district/ULB;
 * admins see the full catalog. Optional filters narrow the summary and child tables.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { requireCapability } from "./capabilities";
import { collectSurveysInFieldScope } from "./fieldAccess";
import { clientError, requireUser } from "./helpers";
import { assertMunicipalityInScope, resolveTenantScope, tenantDistrictIds, tenantMunicipalityIds } from "./tenancy";

export const surveyCountsShape = {
  total: v.number(),
  today: v.number(),
  drafts: v.number(),
  submitted: v.number(),
  approved: v.number(),
  rejected: v.number(),
};

const breakdownRow = {
  ...surveyCountsShape,
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

export type SurveyCounts = {
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

/** Load every survey row visible to admin, supervisor, or QC within tenant scope. */
async function loadScopedSurveys(ctx: QueryCtx, me: Doc<"users">): Promise<Doc<"surveys">[]> {
  return collectSurveysInFieldScope(ctx, me);
}

async function assertDistrictInScope(
  me: Doc<"users">,
  districtId: Id<"districts">,
  allowedDistrictIds: Set<Id<"districts">>,
) {
  if (me.role === "admin") return;
  if (!allowedDistrictIds.has(districtId)) {
    clientError("FORBIDDEN", "This district is outside your assigned scope");
  }
}

async function assertSurveyorInScope(
  ctx: QueryCtx,
  me: Doc<"users">,
  surveyor: Doc<"users">,
  muniIds: Set<Id<"municipalities">>,
  districtIds: Set<Id<"districts">>,
) {
  if (me.role === "admin") return;
  if (surveyor.municipalityId && muniIds.has(surveyor.municipalityId)) return;
  if (surveyor.districtId && districtIds.has(surveyor.districtId)) return;
  clientError("FORBIDDEN", "This surveyor is outside your assigned scope");
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
  districtFilter?: Id<"districts">,
  muniFilter?: Id<"municipalities">,
  muniMap?: Map<Id<"municipalities">, Doc<"municipalities">>,
): Doc<"users">[] {
  return users.filter((u) => {
    if (u.municipalityId && !muniIds.has(u.municipalityId)) return false;
    if (u.districtId && !districtIds.has(u.districtId)) return false;
    if (muniFilter && u.municipalityId !== muniFilter) return false;
    if (districtFilter && u.districtId !== districtFilter) {
      if (u.municipalityId && muniMap) {
        const m = muniMap.get(u.municipalityId);
        if (m?.districtId !== districtFilter) return false;
      } else return false;
    }
    return true;
  });
}

/**
 * Aggregated survey KPIs with district / ULB / surveyor breakdown tables.
 * Drives admin Reports and supervisor dashboard analytics.
 */
export const surveyStatsBreakdown = query({
  args: {
    districtId: v.optional(v.id("districts")),
    municipalityId: v.optional(v.id("municipalities")),
    surveyorId: v.optional(v.id("users")),
    nowMs: v.optional(v.number()),
  },
  returns: v.object({
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
  }),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    await requireCapability(ctx, me, "analytics.view");

    const scope = await resolveTenantScope(ctx, me);
    const districtIds = tenantDistrictIds(scope);
    const muniIds = tenantMunicipalityIds(scope);

    let rows = await loadScopedSurveys(ctx, me);

    if (args.districtId) {
      await assertDistrictInScope(me, args.districtId, districtIds);
      rows = rows.filter((r) => r.districtId === args.districtId);
    }
    if (args.municipalityId) {
      await assertMunicipalityInScope(ctx, me, args.municipalityId);
      rows = rows.filter((r) => r.municipalityId === args.municipalityId);
    }
    if (args.surveyorId) {
      const surveyor = await ctx.db.get("users", args.surveyorId);
      if (!surveyor || surveyor.role !== "surveyor") {
        clientError("BAD_REQUEST", "Unknown surveyor");
      }
      await assertSurveyorInScope(ctx, me, surveyor, muniIds, districtIds);
      rows = rows.filter((r) => r.surveyorId === args.surveyorId);
    }

    const todayStartMs =
      args.nowMs !== undefined
        ? (() => {
            const d = new Date(args.nowMs);
            d.setHours(0, 0, 0, 0);
            return d.getTime();
          })()
        : null;

    const districtMap = new Map(scope.districts.map((d) => [d._id, d]));
    const muniMap = new Map(scope.municipalities.map((m) => [m._id, m]));

    const byDistrictGroups = groupCounts(rows, (r) => r.districtId);
    const byDistrict = [...byDistrictGroups.entries()]
      .map(([districtId, group]) => {
        const d = districtMap.get(districtId as Id<"districts">);
        return {
          districtId: districtId as Id<"districts">,
          code: d?.code ?? "—",
          name: d?.name ?? "Unknown district",
          ...countRows(group, todayStartMs),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const byUlbGroups = groupCounts(rows, (r) => r.municipalityId);
    const byUlb = [...byUlbGroups.entries()]
      .map(([municipalityId, group]) => {
        const m = muniMap.get(municipalityId as Id<"municipalities">);
        const d = m ? districtMap.get(m.districtId) : undefined;
        return {
          municipalityId: municipalityId as Id<"municipalities">,
          code: m?.code ?? "—",
          name: m?.name ?? "Unknown ULB",
          districtId: m?.districtId ?? group[0]!.districtId,
          districtName: d?.name ?? "—",
          ...countRows(group, todayStartMs),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const bySurveyorGroups = groupCounts(rows, (r) => r.surveyorId);

    const activeSurveyors = filterActiveUsersInScope(
      await ctx.db
        .query("users")
        .withIndex("by_role_status", (q) => q.eq("role", "surveyor").eq("status", "active"))
        .collect(),
      muniIds,
      districtIds,
      args.districtId,
      args.municipalityId,
      muniMap,
    );

    const bySurveyor = activeSurveyors
      .map((u) => {
        const group = bySurveyorGroups.get(u._id) ?? [];
        const muni = u.municipalityId ? muniMap.get(u.municipalityId) : undefined;
        const dist = u.districtId ? districtMap.get(u.districtId) : muni ? districtMap.get(muni.districtId) : undefined;
        return {
          surveyorId: u._id,
          name: u.name,
          email: u.email,
          municipalityName: muni?.name ?? null,
          districtName: dist?.name ?? null,
          status: "active" as const,
          ...countRows(group, todayStartMs),
        };
      })
      .sort((a, b) => b.approved + b.submitted - (a.approved + a.submitted));

    const activeQcSupervisors = filterActiveUsersInScope(
      await ctx.db
        .query("users")
        .withIndex("by_role_status", (q) => q.eq("role", "qc_supervisor").eq("status", "active"))
        .collect(),
      muniIds,
      districtIds,
      args.districtId,
      args.municipalityId,
      muniMap,
    );

    const scopedSurveyIds = new Set(rows.map((r) => r._id));
    const byQcSupervisor = await Promise.all(
      activeQcSupervisors.map(async (u) => {
        const decisions = await ctx.db
          .query("qcDecisions")
          .withIndex("by_reviewer", (q) => q.eq("reviewerId", u._id))
          .collect();
        const scoped = decisions.filter((d) => scopedSurveyIds.has(d.surveyId));
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
      }),
    );
    byQcSupervisor.sort((a, b) => b.total - a.total);

    const filterMunicipalities = scope.municipalities.filter(
      (m) => !args.districtId || m.districtId === args.districtId,
    );

    return {
      summary: countRows(rows, todayStartMs),
      byDistrict,
      byUlb,
      bySurveyor,
      byQcSupervisor,
      filterOptions: {
        districts: scope.districts.map((d) => ({ _id: d._id, code: d.code, name: d.name })),
        municipalities: filterMunicipalities.map((m) => ({
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
  },
});
