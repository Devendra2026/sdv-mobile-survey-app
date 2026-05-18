/**
 * Master data + bundles. The mobile app calls `bundle` once on app start
 * (and then relies on Convex's reactive cache to push updates).
 */
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { CONSTRUCTION_TYPES, FLOOR_NAMES, FLOOR_USAGE_TYPES } from './areaMasters';
import { requireUser } from './helpers';
import { RESPONDENT_RELATIONSHIPS } from './ownerRules';
import {
  OWNERSHIP_TYPES,
  PROPERTY_USE_SUBCATEGORIES,
  PROPERTY_USES,
  PROPERTY_USES_REQUIRING_SUBCATEGORY,
  ROAD_TYPES,
  SITUATIONS,
  TAX_RATE_ZONES,
} from './taxationMasters';
import { assertMunicipalityInScope, resolveTenantScope } from './tenancy';

interface Option {
  value: string;
  label: string;
}

/**
 * Returns every active dropdown grouped by category, plus the full set of
 * municipalities and wards the caller has any read access to. The mobile
 * uses this as the single source of truth for every dropdown menu.
 */
export const bundle = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);

    // Dropdown masters — by_category_position index for grouped iteration
    const masters = await ctx.db
      .query('masters')
      .filter((q) => q.eq(q.field('isActive'), true))
      .collect();
    const groupedRaw: Record<string, Option[]> = {};
    for (const m of masters.sort((a, b) => a.position - b.position)) {
      groupedRaw[m.category] = groupedRaw[m.category] ?? [];
      groupedRaw[m.category]!.push({ value: m.value, label: m.label });
    }
    const grouped = groupedRaw;

    const { districts: visibleDistricts, municipalities: visibleMunis } = await resolveTenantScope(ctx, me);
    const districtsById = new Map(visibleDistricts.map((d) => [d._id, d]));

    const districtsOut = visibleDistricts.map((d) => ({
      _id: d._id,
      code: d.code,
      name: d.name,
      stateName: d.stateName,
    }));

    const ulbs = visibleMunis.map((m) => {
      const d = districtsById.get(m.districtId);
      return {
        _id: m._id,
        code: m.code,
        name: m.name,
        bodyType: m.bodyType,
        districtId: m.districtId,
        districtName: d?.name ?? '',
        districtCode: d?.code ?? '',
        stateName: d?.stateName ?? '',
        postalCode: m.postalCode ?? null,
      };
    });

    const wards = await ctx.db.query('wards').collect();
    const wardsForUser = wards.filter((w) => visibleMunis.some((m) => m._id === w.municipalityId));
    const muniById = new Map(visibleMunis.map((m) => [m._id, m]));

    const wardOut = wardsForUser.map((w) => ({
      _id: w._id,
      municipalityId: w.municipalityId,
      municipalityCode: muniById.get(w.municipalityId)?.code ?? '',
      wardNo: w.wardNo,
      wardCode: w.wardCode ?? w.wardNo,
      name: w.name,
    }));

    return {
      updatedAt: Date.now(),
      districts: districtsOut,
      ulbs,
      wards: wardOut,
      // Each category is optional in case it isn't seeded yet on a fresh deployment.
      assessmentYears: grouped['assessment_year'] ?? [],
      ownershipTypes: grouped['ownership_type']?.length ? grouped['ownership_type']! : OWNERSHIP_TYPES,
      propertyUses: grouped['property_use']?.length ? grouped['property_use']! : PROPERTY_USES,
      propertyUseSubcategories: PROPERTY_USE_SUBCATEGORIES,
      propertyUsesRequiringSubcategory: PROPERTY_USES_REQUIRING_SUBCATEGORY,
      situations: grouped['situation']?.length ? grouped['situation']! : SITUATIONS,
      roadTypes: grouped['road_type']?.length ? grouped['road_type']! : ROAD_TYPES,
      taxRateZones: grouped['tax_rate_zone']?.length ? grouped['tax_rate_zone']! : TAX_RATE_ZONES,
      relationships: RESPONDENT_RELATIONSHIPS,
      waterSources: grouped['water_source'] ?? [],
      sanitationTypes: grouped['sanitation_type'] ?? [],
      solidWasteTypes: grouped['solid_waste_type'] ?? [],
      usageTypes: grouped['usage_type']?.length ? grouped['usage_type']! : FLOOR_USAGE_TYPES,
      constructionTypes: grouped['construction_type']?.length ? grouped['construction_type']! : CONSTRUCTION_TYPES,
      floors: grouped['floor_name']?.length ? grouped['floor_name']! : FLOOR_NAMES,
    };
  },
});

/** Wards for one ULB — used by survey start when the bundle list is incomplete. */
export const wardsForMunicipality = query({
  args: { municipalityId: v.id('municipalities') },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const muni = await assertMunicipalityInScope(ctx, me, args.municipalityId);
    const rows = await ctx.db.query('wards').collect();
    return rows
      .filter((w) => w.municipalityId === args.municipalityId)
      .sort((a, b) => a.wardNo.localeCompare(b.wardNo, undefined, { numeric: true }))
      .map((w) => ({
        _id: w._id,
        municipalityId: w.municipalityId,
        municipalityCode: muni.code,
        wardNo: w.wardNo,
        wardCode: w.wardCode ?? w.wardNo,
        name: w.name,
      }));
  },
});

/* ────────────────────────── notifications ────────────────────────── */

export const listNotifications = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const limit = Math.min(args.limit ?? 30, 100);
    return await ctx.db
      .query('notifications')
      .withIndex('by_user', (q) => q.eq('userId', me._id))
      .order('desc')
      .take(limit);
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx, { allowPending: true });
    const rows = await ctx.db
      .query('notifications')
      .withIndex('by_user_read', (q) => q.eq('userId', me._id).eq('readAt', undefined))
      .collect();
    return rows.length;
  },
});

export const markRead = mutation({
  args: { id: v.id('notifications') },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const n = await ctx.db.get(args.id);
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
      .query('notifications')
      .withIndex('by_user_read', (q) => q.eq('userId', me._id).eq('readAt', undefined))
      .collect();
    const now = Date.now();
    for (const n of unread) {
      await ctx.db.patch(n._id, { readAt: now });
    }
  },
});

/* ────────────────────────── dashboard ────────────────────────── */

/**
 * Quick KPI counts for the home screen. Scoped to whatever the caller
 * can see — surveyor sees own, supervisor sees ULB, admin sees all.
 */
export const dashboardCounts = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx, { allowPending: true });
    if (me.status !== 'active') {
      return { total: 0, today: 0, drafts: 0, submitted: 0, approved: 0, rejected: 0 };
    }

    let rows;
    const scope = await resolveTenantScope(ctx, me);
    const districtIds = new Set(scope.districts.map((d) => d._id));

    if (me.role === 'surveyor') {
      rows = (
        await ctx.db
          .query('surveys')
          .withIndex('by_surveyor', (q) => q.eq('surveyorId', me._id))
          .collect()
      ).filter((r) => !r.districtId || districtIds.has(r.districtId));
    } else if (me.role === 'supervisor' || me.role === 'admin') {
      if (scope.districts.length === 1) {
        rows = await ctx.db
          .query('surveys')
          .withIndex('by_district', (q) => q.eq('districtId', scope.districts[0]!._id))
          .collect();
      } else if (me.municipalityId) {
        rows = await ctx.db
          .query('surveys')
          .withIndex('by_municipality_status', (q) => q.eq('municipalityId', me.municipalityId!))
          .collect();
      } else {
        rows = (await ctx.db.query('surveys').collect()).filter((r) => !r.districtId || districtIds.has(r.districtId));
      }
    } else {
      rows = (await ctx.db.query('surveys').collect()).filter((r) => !r.districtId || districtIds.has(r.districtId));
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    return {
      total: rows.length,
      today: rows.filter((r) => r._creationTime >= todayMs).length,
      drafts: rows.filter((r) => r.status === 'draft').length,
      submitted: rows.filter((r) => r.status === 'submitted').length,
      approved: rows.filter((r) => r.qcStatus === 'approved').length,
      rejected: rows.filter((r) => r.qcStatus === 'rejected').length,
    };
  },
});
