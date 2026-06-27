/**
 * Field-role access: surveyor (own), supervisor/QC (assigned), admin (all).
 * Centralises multi-city allotment + ward rules used by survey list, analytics, exports.
 */
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { hasCapability, type PermissionCache } from "./capabilities";
import { assertCanReadWard, canReadWard } from "./helpers";
import { assertMunicipalityInScope, resolveTenantScope, tenantDistrictIds, tenantMunicipalityIds } from "./tenancy";

export type FieldSurveyAccess = "own" | "assigned" | "admin" | "none";

/**
 * True when the user syncs drafts by `localId` under their own `surveyorId`.
 * Intentionally separate from `fieldSurveyAccess` so list visibility (assigned vs
 * own) does not block draft creation for misconfigured or mixed-capability roles.
 */
export async function isOwnScopeSurveyor(ctx: QueryCtx, user: Doc<"users">, cache?: PermissionCache): Promise<boolean> {
  if (user.role === "surveyor") return true;
  return await hasCapability(ctx, user, "surveys.viewOwn", cache);
}

/**
 * Whether `saveDraft` may insert a new row when no existing survey is resolved.
 * QC-only editors must open a record by server id; field surveyors and supervisors may create.
 */
export async function canInsertSurveyDraft(
  ctx: QueryCtx,
  user: Doc<"users">,
  cache?: PermissionCache,
): Promise<boolean> {
  if (await isOwnScopeSurveyor(ctx, user, cache)) return true;
  if (user.role === "supervisor") return true;
  const [editDraft, submit, viewAssigned, qcReview] = await Promise.all([
    hasCapability(ctx, user, "surveys.editDraft", cache),
    hasCapability(ctx, user, "surveys.submit", cache),
    hasCapability(ctx, user, "surveys.viewAssigned", cache),
    hasCapability(ctx, user, "qc.review", cache),
  ]);
  return editDraft && submit && viewAssigned && !qcReview;
}

type SurveyAccessCtx = QueryCtx | MutationCtx;

/** Enforce municipality scope + field-role access on a single survey read. */
export async function assertCanAccessSurvey(
  ctx: SurveyAccessCtx,
  me: Doc<"users">,
  survey: Doc<"surveys">,
  cache?: PermissionCache,
): Promise<void> {
  await assertMunicipalityInScope(ctx, me, survey.municipalityId);

  const access = await fieldSurveyAccess(ctx, me, cache);
  if (access === "none") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "You don't have permission to view this survey.",
    });
  }

  if (access === "own") {
    if (survey.surveyorId !== me._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only view your own surveys.",
      });
    }
    if (survey.wardNo?.trim()) {
      assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    }
    return;
  }

  assertCanReadWard(me, survey.municipalityId, survey.wardNo);
}

export async function fieldSurveyAccess(
  ctx: QueryCtx,
  user: Doc<"users">,
  cache?: PermissionCache,
): Promise<FieldSurveyAccess> {
  if (user.role === "admin" || (await hasCapability(ctx, user, "surveys.viewAll", cache))) {
    return "admin";
  }
  // Surveyors must always resolve to own-scope, even if dynamic role permissions
  // accidentally include broader capabilities.
  if (user.role === "surveyor") return "own";
  // Assigned / QC scope is broader than own — check it first so dual-capability users
  // (e.g. supervisor profile with leftover viewOwn) still see the full ULB.
  if (
    (await hasCapability(ctx, user, "surveys.viewAssigned", cache)) ||
    (await hasCapability(ctx, user, "qc.review", cache))
  ) {
    return "assigned";
  }
  if (await hasCapability(ctx, user, "surveys.viewOwn", cache)) return "own";
  return "none";
}

type SurveyListQueryArgs = {
  municipalityId?: Id<"municipalities">;
  districtId?: Id<"districts">;
  status?: Doc<"surveys">["status"];
  surveyorId?: Id<"users">;
  limit: number;
};

async function queryByMunicipality(
  ctx: QueryCtx,
  municipalityId: Id<"municipalities">,
  status: Doc<"surveys">["status"] | undefined,
  take: number,
): Promise<Doc<"surveys">[]> {
  return ctx.db
    .query("surveys")
    .withIndex("by_municipality_status", (q) =>
      status ? q.eq("municipalityId", municipalityId).eq("status", status) : q.eq("municipalityId", municipalityId),
    )
    .order("desc")
    .take(take);
}

async function queryByDistrict(
  ctx: QueryCtx,
  districtId: Id<"districts">,
  status: Doc<"surveys">["status"] | undefined,
  take: number,
): Promise<Doc<"surveys">[]> {
  return ctx.db
    .query("surveys")
    .withIndex("by_district_status", (q) =>
      status ? q.eq("districtId", districtId).eq("status", status) : q.eq("districtId", districtId),
    )
    .order("desc")
    .take(take);
}

/** Ward narrowing is for surveyors and QC supervisors with ward assignments. */
async function wardLimitsApply(ctx: QueryCtx, user: Doc<"users">): Promise<boolean> {
  if (user.role === "admin" || user.role === "supervisor") return false;
  if (await hasCapability(ctx, user, "surveys.viewAll")) return false;
  if (user.role === "qc_supervisor") return user.wardAssignments.length > 0;
  if (user.wardAssignments.length === 0) return false;
  const [viewAssigned, qcReview, viewOwn] = await Promise.all([
    hasCapability(ctx, user, "surveys.viewAssigned"),
    hasCapability(ctx, user, "qc.review"),
    hasCapability(ctx, user, "surveys.viewOwn"),
  ]);
  if (viewAssigned || qcReview) return false;
  return viewOwn;
}

async function filterSurveysInScope(
  ctx: QueryCtx,
  rows: Doc<"surveys">[],
  me: Doc<"users">,
  muniIds: Set<Id<"municipalities">>,
): Promise<Doc<"surveys">[]> {
  const applyWardLimits = await wardLimitsApply(ctx, me);
  return rows.filter((r) => {
    if (!muniIds.has(r.municipalityId)) return false;
    if (!applyWardLimits) return true;
    // In-progress drafts may not have ward set yet — always show the collector their own rows.
    if (!r.wardNo?.trim() && r.surveyorId === me._id) return true;
    return canReadWard(me, r.municipalityId, r.wardNo);
  });
}

/** Load surveys visible to surveyor / supervisor / QC / admin within tenant scope. */
export async function querySurveysInFieldScope(
  ctx: QueryCtx,
  me: Doc<"users">,
  args: SurveyListQueryArgs,
): Promise<Doc<"surveys">[]> {
  const [access, scope] = await Promise.all([fieldSurveyAccess(ctx, me), resolveTenantScope(ctx, me)]);
  const muniIds = tenantMunicipalityIds(scope);
  const districtIds = tenantDistrictIds(scope);
  const take = args.limit * 2;

  if (access === "none") return [];

  if (access === "own") {
    const rows = await ctx.db
      .query("surveys")
      .withIndex("by_surveyor", (q) => q.eq("surveyorId", me._id))
      .order("desc")
      .take(take);
    return (await filterSurveysInScope(ctx, rows, me, muniIds)).slice(0, args.limit);
  }

  if (args.surveyorId) {
    const rows = await ctx.db
      .query("surveys")
      .withIndex("by_surveyor", (q) => q.eq("surveyorId", args.surveyorId!))
      .order("desc")
      .take(take);
    return (await filterSurveysInScope(ctx, rows, me, muniIds)).slice(0, args.limit);
  }

  if (access === "admin") {
    if (args.municipalityId) {
      return (await queryByMunicipality(ctx, args.municipalityId, args.status, take)).slice(0, args.limit);
    }
    if (args.districtId) {
      return (await queryByDistrict(ctx, args.districtId, args.status, take)).slice(0, args.limit);
    }
    const rows = await ctx.db.query("surveys").order("desc").take(take);
    return (await filterSurveysInScope(ctx, rows, me, muniIds)).slice(0, args.limit);
  }

  // Assigned scope (supervisor / QC): honour every active ULB allotment, not only profile municipalityId.
  const scopedMunis = args.municipalityId
    ? [args.municipalityId]
    : scope.municipalities.length > 0
      ? scope.municipalities.map((m) => m._id)
      : me.municipalityId
        ? [me.municipalityId]
        : [];

  let rows: Doc<"surveys">[] = [];

  if (scopedMunis.length > 1) {
    const batches = await Promise.all(
      scopedMunis.map((municipalityId) => queryByMunicipality(ctx, municipalityId, args.status, take)),
    );
    const seen = new Set<string>();
    for (const batch of batches) {
      for (const row of batch) {
        if (seen.has(row._id)) continue;
        seen.add(row._id);
        rows.push(row);
      }
    }
    rows.sort((a, b) => b._creationTime - a._creationTime);
  } else if (scopedMunis.length === 1) {
    const muniId = scopedMunis[0]!;
    rows = args.status
      ? await ctx.db
          .query("surveys")
          .withIndex("by_municipality_status", (q) => q.eq("municipalityId", muniId).eq("status", args.status!))
          .collect()
      : await ctx.db
          .query("surveys")
          .withIndex("by_municipality_status", (q) => q.eq("municipalityId", muniId))
          .collect();
  } else {
    const districtKey =
      args.districtId ?? (scope.districts.length === 1 ? scope.districts[0]!._id : (me.districtId ?? undefined));
    if (districtKey && districtIds.has(districtKey)) {
      rows = await queryByDistrict(ctx, districtKey, args.status, take);
    }
  }

  return (await filterSurveysInScope(ctx, rows, me, muniIds)).slice(0, args.limit);
}

/** Collect all surveys in assigned/admin scope (analytics dashboards). */
export async function collectSurveysInFieldScope(ctx: QueryCtx, me: Doc<"users">): Promise<Doc<"surveys">[]> {
  const [access, scope] = await Promise.all([fieldSurveyAccess(ctx, me), resolveTenantScope(ctx, me)]);
  const muniIds = tenantMunicipalityIds(scope);

  if (access === "none") return [];

  if (access === "own") {
    const rows = await ctx.db
      .query("surveys")
      .withIndex("by_surveyor", (q) => q.eq("surveyorId", me._id))
      .collect();
    return await filterSurveysInScope(ctx, rows, me, muniIds);
  }

  if (access === "admin") {
    const scopedMunis = scope.municipalities.length > 0 ? scope.municipalities.map((m) => m._id) : [...muniIds];
    if (scopedMunis.length > 0) {
      const batches = await Promise.all(
        scopedMunis.map((municipalityId) =>
          ctx.db
            .query("surveys")
            .withIndex("by_municipality_status", (q) => q.eq("municipalityId", municipalityId))
            .collect(),
        ),
      );
      const seen = new Set<string>();
      const rows: Doc<"surveys">[] = [];
      for (const batch of batches) {
        for (const row of batch) {
          if (seen.has(row._id)) continue;
          seen.add(row._id);
          rows.push(row);
        }
      }
      return await filterSurveysInScope(ctx, rows, me, muniIds);
    }
    const rows = await ctx.db.query("surveys").collect();
    return await filterSurveysInScope(ctx, rows, me, muniIds);
  }

  const scopedMunis =
    scope.municipalities.length > 0
      ? scope.municipalities.map((m) => m._id)
      : me.municipalityId
        ? [me.municipalityId]
        : [];

  let rows: Doc<"surveys">[] = [];

  if (scopedMunis.length > 1) {
    const batches = await Promise.all(
      scopedMunis.map((id) =>
        ctx.db
          .query("surveys")
          .withIndex("by_municipality_status", (q) => q.eq("municipalityId", id))
          .collect(),
      ),
    );
    const seen = new Set<string>();
    for (const batch of batches) {
      for (const row of batch) {
        if (seen.has(row._id)) continue;
        seen.add(row._id);
        rows.push(row);
      }
    }
  } else if (scopedMunis.length === 1) {
    rows = await ctx.db
      .query("surveys")
      .withIndex("by_municipality_status", (q) => q.eq("municipalityId", scopedMunis[0]!))
      .collect();
  } else if (scope.districts.length === 1) {
    rows = await ctx.db
      .query("surveys")
      .withIndex("by_district", (q) => q.eq("districtId", scope.districts[0]!._id))
      .collect();
  }

  return await filterSurveysInScope(ctx, rows, me, muniIds);
}
