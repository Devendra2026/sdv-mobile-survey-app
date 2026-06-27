/**
 * Master data + bundles. The mobile app calls `bundle` once on app start
 * (and then relies on Convex's reactive cache to push updates).
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { CONSTRUCTION_TYPES, FLOOR_NAMES, FLOOR_USAGE_FACTORS, FLOOR_USAGE_TYPES } from "./areaMasters";
import { filterWardsForUser, requireUser } from "./helpers";
import { readDashboardCountsFromAggregates } from "./lib/surveyAggregates";
import { RESPONDENT_RELATIONSHIPS } from "./ownerConstants";
import { mergeMasterOptions, SANITATION_TYPES, WATER_SOURCES } from "./serviceMasters";
import {
  OWNERSHIP_TYPES,
  PROPERTY_USE_SUBCATEGORIES,
  PROPERTY_USES,
  PROPERTY_USES_REQUIRING_SUBCATEGORY,
  ROAD_TYPES,
  SITUATIONS,
  TAX_RATE_ZONES,
} from "./taxationMasters";
import { assertMunicipalityInScope, resolveTenantScope } from "./tenancy";

interface Option {
  value: string;
  label: string;
}

/** Master categories included in `bundle` dropdown payloads. */
const MASTER_BUNDLE_CATEGORIES = [
  "assessment_year",
  "ownership_type",
  "property_use",
  "situation",
  "road_type",
  "tax_rate_zone",
  "water_source",
  "sanitation_type",
  "usage_factor",
  "usage_type",
  "floor_usage_type",
  "construction_type",
  "floor_name",
] as const;

async function loadActiveMastersByCategory(
  ctx: QueryCtx,
): Promise<{ grouped: Record<string, Option[]>; catalogVersion: number }> {
  const grouped: Record<string, Option[]> = {};
  let catalogVersion = 0;

  const categoryRows = await Promise.all(
    MASTER_BUNDLE_CATEGORIES.map((category) =>
      ctx.db
        .query("masters")
        .withIndex("by_category_position", (q) => q.eq("category", category).eq("isActive", true))
        .collect(),
    ),
  );

  for (const rows of categoryRows) {
    for (const row of rows) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category]!.push({ value: row.value, label: row.label });
      if (row._creationTime > catalogVersion) catalogVersion = row._creationTime;
    }
  }

  return { grouped, catalogVersion };
}

/** Load wards only for municipalities in scope (indexed per ULB — not a full-table scan). */
async function loadWardsForMunicipalities(
  ctx: QueryCtx,
  municipalities: Doc<"municipalities">[],
): Promise<
  Array<{
    _id: Id<"wards">;
    municipalityId: Id<"municipalities">;
    municipalityCode: string;
    wardNo: string;
    wardCode: string;
    name: string;
  }>
> {
  const muniById = new Map(municipalities.map((m) => [m._id, m]));
  const wardRows = await Promise.all(
    municipalities.map((muni) =>
      ctx.db
        .query("wards")
        .withIndex("by_municipality_ward", (q) => q.eq("municipalityId", muni._id))
        .collect(),
    ),
  );

  const wardOut: Array<{
    _id: Id<"wards">;
    municipalityId: Id<"municipalities">;
    municipalityCode: string;
    wardNo: string;
    wardCode: string;
    name: string;
  }> = [];

  for (const rows of wardRows) {
    for (const w of rows) {
      wardOut.push({
        _id: w._id,
        municipalityId: w.municipalityId,
        municipalityCode: muniById.get(w.municipalityId)?.code ?? "",
        wardNo: w.wardNo,
        wardCode: w.wardCode ?? w.wardNo,
        name: w.name,
      });
    }
  }

  return wardOut;
}

/**
 * Returns every active dropdown grouped by category, plus the full set of
 * municipalities and wards the caller has any read access to. The mobile
 * uses this as the single source of truth for every dropdown menu.
 */
export const bundle = query({
  args: {
    /** Web clients should pass false and load wards via `wardsForMunicipality` on demand. */
    includeWards: v.optional(v.boolean()),
    /** Pass false when only dropdown masters are needed (e.g. floors editor) — skips tenant scope reads. */
    includeTenantCatalog: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const includeWards = args.includeWards ?? true;
    const includeTenantCatalog = args.includeTenantCatalog ?? true;

    const { grouped, catalogVersion } = await loadActiveMastersByCategory(ctx);

    let districtsOut: Array<{ _id: Id<"districts">; code: string; name: string; stateName: string }> = [];
    let ulbs: Array<{
      _id: Id<"municipalities">;
      code: string;
      name: string;
      bodyType: string;
      districtId: Id<"districts">;
      districtName: string;
      districtCode: string;
      stateName: string;
      postalCode: string | null;
    }> = [];
    let wardOut: Awaited<ReturnType<typeof loadWardsForMunicipalities>> = [];

    if (includeTenantCatalog) {
      const { districts: visibleDistricts, municipalities: visibleMunis } = await resolveTenantScope(ctx, me);
      const districtsById = new Map(visibleDistricts.map((d) => [d._id, d]));

      districtsOut = visibleDistricts.map((d) => ({
        _id: d._id,
        code: d.code,
        name: d.name,
        stateName: d.stateName,
      }));

      ulbs = visibleMunis.map((m) => {
        const d = districtsById.get(m.districtId);
        return {
          _id: m._id,
          code: m.code,
          name: m.name,
          bodyType: m.bodyType,
          districtId: m.districtId,
          districtName: d?.name ?? "",
          districtCode: d?.code ?? "",
          stateName: d?.stateName ?? "",
          postalCode: m.postalCode ?? null,
        };
      });

      wardOut = includeWards ? filterWardsForUser(me, await loadWardsForMunicipalities(ctx, visibleMunis)) : [];
    }

    return {
      updatedAt: catalogVersion,
      districts: districtsOut,
      ulbs,
      wards: wardOut,
      tenantScope: includeTenantCatalog
        ? {
            districtCount: districtsOut.length,
            municipalityCount: ulbs.length,
            wardCount: wardOut.length,
            primaryMunicipalityId: me.municipalityId ?? null,
            wardAssignments: me.wardAssignments,
          }
        : null,
      // Each category is optional in case it isn't seeded yet on a fresh deployment.
      assessmentYears: grouped["assessment_year"] ?? [],
      ownershipTypes: grouped["ownership_type"]?.length ? grouped["ownership_type"]! : OWNERSHIP_TYPES,
      propertyUses: (grouped["property_use"]?.length ? grouped["property_use"]! : PROPERTY_USES).filter(
        (o) => o.value !== "agricultural_land",
      ),
      propertyUseSubcategories: PROPERTY_USE_SUBCATEGORIES,
      propertyUsesRequiringSubcategory: PROPERTY_USES_REQUIRING_SUBCATEGORY,
      situations: grouped["situation"]?.length ? grouped["situation"]! : SITUATIONS,
      roadTypes: grouped["road_type"]?.length ? grouped["road_type"]! : ROAD_TYPES,
      taxRateZones: grouped["tax_rate_zone"]?.length ? grouped["tax_rate_zone"]! : TAX_RATE_ZONES,
      relationships: RESPONDENT_RELATIONSHIPS,
      waterSources: mergeMasterOptions(WATER_SOURCES, grouped["water_source"]),
      sanitationTypes: mergeMasterOptions(SANITATION_TYPES, grouped["sanitation_type"]),
      usageFactors: grouped["usage_factor"]?.length
        ? grouped["usage_factor"]!
        : grouped["usage_type"]?.length
          ? grouped["usage_type"]!
          : FLOOR_USAGE_FACTORS,
      usageTypes: grouped["floor_usage_type"]?.length ? grouped["floor_usage_type"]! : FLOOR_USAGE_TYPES,
      constructionTypes: grouped["construction_type"]?.length ? grouped["construction_type"]! : CONSTRUCTION_TYPES,
      floors: mergeMasterOptions(FLOOR_NAMES, grouped["floor_name"]),
    };
  },
});

/** Wards for one ULB — used by survey start when the bundle list is incomplete. */
export const wardsForMunicipality = query({
  args: { municipalityId: v.id("municipalities") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const [muni, rows] = await Promise.all([
      assertMunicipalityInScope(ctx, me, args.municipalityId),
      ctx.db
        .query("wards")
        .withIndex("by_municipality_ward", (q) => q.eq("municipalityId", args.municipalityId))
        .collect(),
    ]);
    const wards = rows
      .sort((a, b) => a.wardNo.localeCompare(b.wardNo, undefined, { numeric: true }))
      .map((w) => ({
        _id: w._id,
        municipalityId: w.municipalityId,
        municipalityCode: muni.code,
        wardNo: w.wardNo,
        wardCode: w.wardCode ?? w.wardNo,
        name: w.name,
      }));
    return filterWardsForUser(me, wards);
  },
});

/** Read-only scope summary for field users (mobile/web diagnostics). */
export const myTenantScope = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const [scope, allotments] = await Promise.all([
      resolveTenantScope(ctx, me),
      ctx.db
        .query("userAllotments")
        .withIndex("by_user", (q) => q.eq("userId", me._id))
        .collect(),
    ]);

    const activeAllotments: { districtId: Id<"districts"> | null; municipalityId: Id<"municipalities"> | null }[] = [];
    for (const a of allotments) {
      if (!a.isActive) continue;
      activeAllotments.push({
        districtId: a.districtId ?? null,
        municipalityId: a.municipalityId ?? null,
      });
    }

    return {
      role: me.role,
      primaryMunicipalityId: me.municipalityId ?? null,
      primaryDistrictId: me.districtId ?? null,
      wardAssignments: me.wardAssignments,
      districts: scope.districts.map((d) => ({ _id: d._id, code: d.code, name: d.name })),
      municipalities: scope.municipalities.map((m) => ({ _id: m._id, code: m.code, name: m.name })),
      activeAllotments,
    };
  },
});

/* ────────────────────────── notifications ────────────────────────── */

export const listNotifications = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const limit = Math.min(args.limit ?? 30, 100);
    return await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .order("desc")
      .take(limit);
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx, { allowPending: true });
    let count = 0;
    let cursor: string | null = null;
    while (true) {
      const batch = await ctx.db
        .query("notifications")
        .withIndex("by_user_read", (q) => q.eq("userId", me._id).eq("readAt", undefined))
        .paginate({ numItems: 100, cursor });
      count += batch.page.length;
      if (batch.isDone) break;
      cursor = batch.continueCursor;
    }
    return count;
  },
});

export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const [me, n] = await Promise.all([requireUser(ctx), ctx.db.get(args.id)]);
    if (!n || n.userId !== me._id) return;
    if (n.readAt) return;
    await ctx.db.patch(args.id, { readAt: Date.now() });
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) => q.eq("userId", me._id).eq("readAt", undefined))
      .collect();
    const now = Date.now();
    await Promise.all(unread.map((n) => ctx.db.patch(n._id, { readAt: now })));
  },
});

/* ────────────────────────── dashboard ────────────────────────── */

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

/**
 * Quick KPI counts for the home screen. Scoped to whatever the caller
 * can see — surveyor sees own, supervisor sees ULB, admin sees all.
 */
export const dashboardCounts = query({
  args: { nowMs: v.optional(v.number()) },
  returns: v.object(dashboardCountsShape),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, { allowPending: true });
    if (me.status !== "active") {
      return { total: 0, today: 0, drafts: 0, pending: 0, submittedToday: 0, approved: 0, submitted: 0, rejected: 0 };
    }

    const nowMs = args.nowMs ?? Date.now();
    const agg = await readDashboardCountsFromAggregates(ctx, me, nowMs);
    return {
      total: agg.total,
      today: agg.today,
      drafts: agg.drafts,
      pending: agg.pending,
      submittedToday: agg.submittedToday,
      approved: agg.approved,
      submitted: agg.submitted,
      rejected: agg.rejected,
    };
  },
});
