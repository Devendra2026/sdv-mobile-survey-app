import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { addressTenantContext, normalizeAddressFields, validateAddressSection } from './addressRules';
import {
  derivePlotSqftForSubmit,
  normalizeFloorFields,
  plinthSqftFromFloors,
  presentFloorRow,
  usageTypeToOccupied,
  validateAreaSection,
  validateFloorRow,
} from './areaMasters';
import { hasCapability, requireCapability } from './capabilities';
import {
  assertCanAccessSurvey,
  canInsertSurveyDraft,
  collectSurveysInFieldScope,
  fieldSurveyAccess,
  isOwnScopeSurveyor,
  querySurveysInFieldScope,
} from './fieldAccess';
import { assertCanReadWard, canReadWard, clientError, requireUser, writeAudit } from './helpers';
import { validateGps } from './lib/gpsValidation';
import { syncSurveyAggregates } from './lib/surveyAggregates';
import {
  completionPctForSurvey,
  computeSurveyCompletionPercent,
  refreshSurveyCompletionPct,
} from './lib/surveyProgress';
import { filterSurveysBySearch } from './lib/surveySearch';
import { assertUniqueSurveySlot, surveyIdentifyingSlotChanged } from './lib/surveyUniqueness';
import { computeSurveyWardAggregates } from './lib/surveyWardStats';
import { isValidIndianOwnerMobile, normalizeOwners, primaryOwnerMobile, validateOwnerSection } from './ownerRules';
import { comparePropertyIds, compareWardThenParcel, resolvePropertyId } from './propertyId';
import { gpsCapture, qcStatus, sanitationType, surveyOwnerEntry, surveyStatus, waterSource } from './schema';
import { validateServicesSection } from './serviceMasters';
import {
  assertSurveyWritable,
  auditActionForSave,
  requireSurveyDraftEdit,
  resolveExistingSurveyForSave,
  resolvePostSaveStatuses,
} from './surveyEditRules';
import { loadAllowedTaxZoneSet, normalizeTaxationFields, validateTaxationSection } from './taxationMasters';
import { assertMunicipalityInScope, resolveTenantScope, tenantDistrictIds, tenantMunicipalityIds } from './tenancy';

async function loadMunicipalityCodes(
  ctx: QueryCtx,
  municipalityIds: Id<'municipalities'>[],
): Promise<Map<Id<'municipalities'>, string>> {
  const unique = [...new Set(municipalityIds)];
  const munis = await Promise.all(unique.map((id) => ctx.db.get(id)));
  const codes = new Map<Id<'municipalities'>, string>();
  for (const m of munis) {
    if (m) codes.set(m._id, m.code);
  }
  return codes;
}

function enrichSurveyPropertyIds(rows: Doc<'surveys'>[], codes: Map<Id<'municipalities'>, string>): Doc<'surveys'>[] {
  return rows.map((row) => ({
    ...row,
    propertyId: resolvePropertyId(row, codes.get(row.municipalityId) ?? '') ?? row.propertyId,
  }));
}

async function enrichSurveyorNames(
  ctx: QueryCtx,
  rows: Doc<'surveys'>[],
): Promise<Array<Doc<'surveys'> & { surveyorName?: string }>> {
  const surveyorIds = [...new Set(rows.map((r) => r.surveyorId))];
  const surveyors = await Promise.all(surveyorIds.map((id) => ctx.db.get(id)));
  const nameById = new Map<Id<'users'>, string>();
  for (const s of surveyors) {
    if (s) nameById.set(s._id, s.name);
  }
  return rows.map((row) => ({
    ...row,
    surveyorName: nameById.get(row.surveyorId),
  }));
}

/* ────────────────────────── shared input validator ────────────────────────── */

/** Partial payload for in-progress saves — only `localId` + `municipalityId` are required. */
const draftSurveyInput = {
  /** Server row id — required when a supervisor/admin edits someone else's survey. */
  id: v.optional(v.id('surveys')),
  localId: v.string(),
  municipalityId: v.id('municipalities'),
  clientUpdatedAt: v.number(),
  wardNo: v.optional(v.string()),
  sectorNo: v.optional(v.string()),
  oldPropertyNo: v.optional(v.string()),
  propertyId: v.optional(v.string()),
  parcelNo: v.optional(v.string()),
  unitNo: v.optional(v.string()),
  constructedYear: v.optional(v.number()),
  isSlum: v.optional(v.boolean()),
  respondentName: v.optional(v.string()),
  relationship: v.optional(v.string()),
  owners: v.optional(v.array(surveyOwnerEntry)),
  familySize: v.optional(v.number()),
  mobileNo: v.optional(v.string()),
  altMobileNo: v.optional(v.string()),
  houseNo: v.optional(v.string()),
  locality: v.optional(v.string()),
  colonyName: v.optional(v.string()),
  pinCode: v.optional(v.string()),
  city: v.optional(v.string()),
  street: v.optional(v.string()),
  assessmentYear: v.optional(v.string()),
  ownershipType: v.optional(v.string()),
  propertyType: v.optional(v.string()),
  propertyUse: v.optional(v.string()),
  situation: v.optional(v.string()),
  roadType: v.optional(v.string()),
  taxRateZone: v.optional(v.string()),
  plotSqft: v.optional(v.number()),
  plinthSqft: v.optional(v.number()),
  municipalWaterConnection: v.optional(v.boolean()),
  waterSource: v.optional(waterSource),
  sanitationType: v.optional(sanitationType),
  municipalWasteCollection: v.optional(v.boolean()),
  electricityNo: v.optional(v.string()),
  gps: v.optional(gpsCapture),
};

const surveyInput = {
  id: v.optional(v.id('surveys')),
  localId: v.string(),
  municipalityId: v.id('municipalities'),
  wardNo: v.string(),

  sectorNo: v.optional(v.string()),
  oldPropertyNo: v.optional(v.string()),
  propertyId: v.optional(v.string()),
  parcelNo: v.string(),
  unitNo: v.string(),
  constructedYear: v.optional(v.number()),
  isSlum: v.boolean(),

  respondentName: v.optional(v.string()),
  relationship: v.optional(v.string()),
  owners: v.optional(v.array(surveyOwnerEntry)),
  familySize: v.optional(v.number()),
  mobileNo: v.string(),
  altMobileNo: v.optional(v.string()),

  houseNo: v.optional(v.string()),
  locality: v.string(),
  colonyName: v.optional(v.string()),
  pinCode: v.string(),
  city: v.optional(v.string()),
  /** @deprecated — mapped to colonyName on upsert */
  street: v.optional(v.string()),

  assessmentYear: v.string(),
  ownershipType: v.string(),
  propertyType: v.string(),
  propertyUse: v.string(),
  situation: v.string(),
  roadType: v.string(),
  taxRateZone: v.string(),
  plotSqft: v.number(),
  plinthSqft: v.number(),

  municipalWaterConnection: v.boolean(),
  waterSource,
  sanitationType,
  municipalWasteCollection: v.boolean(),
  electricityNo: v.optional(v.string()),

  gps: v.optional(gpsCapture),
  clientUpdatedAt: v.number(),
};

/* ────────────────────────── reactive queries ────────────────────────── */

const surveySortBy = v.union(v.literal('propertyId'), v.literal('updated'));

function resolveListSort(args: {
  status?: Doc<'surveys'>['status'];
  sortBy?: 'propertyId' | 'updated';
}): 'propertyId' | 'updated' {
  if (args.sortBy) return args.sortBy;
  if (args.status === 'draft') return 'updated';
  return 'propertyId';
}

function sortSurveyRows(rows: Doc<'surveys'>[], sortBy: 'propertyId' | 'updated'): Doc<'surveys'>[] {
  if (sortBy === 'updated') {
    return [...rows].sort((a, b) => b.clientUpdatedAt - a.clientUpdatedAt);
  }
  return [...rows].sort((a, b) => comparePropertyIds(a.propertyId, b.propertyId));
}

/**
 * Tenant-filtered list. The mobile app subscribes to this with `useQuery`
 * — Convex pushes updates automatically when any matching row changes,
 * so there's no need for a manual refetch on the surveyor's device.
 */
export const list = query({
  args: {
    status: v.optional(surveyStatus),
    qcStatus: v.optional(qcStatus),
    qcStatuses: v.optional(v.array(qcStatus)),
    wardNo: v.optional(v.string()),
    districtId: v.optional(v.id('districts')),
    municipalityId: v.optional(v.id('municipalities')),
    surveyorId: v.optional(v.id('users')),
    limit: v.optional(v.number()),
    sortBy: v.optional(surveySortBy),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const limit = Math.min(args.limit ?? 200, 2000);

    const scope = await resolveTenantScope(ctx, me);
    const districtIds = tenantDistrictIds(scope);
    const muniIds = tenantMunicipalityIds(scope);
    const access = await fieldSurveyAccess(ctx, me);

    if (args.municipalityId) {
      await assertMunicipalityInScope(ctx, me, args.municipalityId);
    }
    if (args.districtId && access !== 'admin' && !districtIds.has(args.districtId)) {
      clientError('FORBIDDEN', 'This district is outside your assigned scope');
    }

    let rows = await querySurveysInFieldScope(ctx, me, {
      municipalityId: args.municipalityId,
      districtId: args.districtId,
      status: args.status,
      surveyorId: args.surveyorId,
      limit,
    });

    // Apply remaining filters in memory — they're small once the index has narrowed.
    if (args.districtId) {
      rows = rows.filter((r) => r.districtId === args.districtId);
    }
    if (args.municipalityId) {
      rows = rows.filter((r) => r.municipalityId === args.municipalityId);
    }
    if (args.surveyorId) {
      rows = rows.filter((r) => r.surveyorId === args.surveyorId);
    }
    if (args.status) {
      rows = rows.filter((r) => r.status === args.status);
    }
    if (args.qcStatus) {
      rows = rows.filter((r) => r.qcStatus === args.qcStatus);
    }
    if (args.qcStatuses && args.qcStatuses.length > 0) {
      const allowed = new Set(args.qcStatuses);
      rows = rows.filter((r) => {
        if (!allowed.has(r.qcStatus)) return false;
        if (r.qcStatus === 'pending' && r.status !== 'submitted') return false;
        return true;
      });
    }
    if (args.wardNo) {
      rows = rows.filter((r) => wardNumbersMatch(r.wardNo, args.wardNo!));
    }
    rows = sortSurveyRows(rows, resolveListSort(args));
    const codes = await loadMunicipalityCodes(
      ctx,
      rows.map((r) => r.municipalityId),
    );
    const enriched = enrichSurveyPropertyIds(rows, codes);
    return await enrichSurveyorNames(ctx, enriched);
  },
});

const listFilterArgs = {
  status: v.optional(surveyStatus),
  qcStatus: v.optional(qcStatus),
  qcStatuses: v.optional(v.array(qcStatus)),
  wardNo: v.optional(v.string()),
  districtId: v.optional(v.id('districts')),
  municipalityId: v.optional(v.id('municipalities')),
  surveyorId: v.optional(v.id('users')),
  fromMs: v.optional(v.number()),
  toMs: v.optional(v.number()),
  searchTerm: v.optional(v.string()),
  sortBy: v.optional(surveySortBy),
};

function wardNumbersMatch(rowWard: string, filterWard: string): boolean {
  if (rowWard === filterWard) return true;
  const a = Number(rowWard);
  const b = Number(filterWard);
  return !Number.isNaN(a) && !Number.isNaN(b) && a === b;
}

function applySurveyListFilters(
  rows: Doc<'surveys'>[],
  args: {
    status?: Doc<'surveys'>['status'];
    qcStatus?: Doc<'surveys'>['qcStatus'];
    qcStatuses?: Doc<'surveys'>['qcStatus'][];
    wardNo?: string;
    districtId?: Id<'districts'>;
    municipalityId?: Id<'municipalities'>;
    surveyorId?: Id<'users'>;
    fromMs?: number;
    toMs?: number;
    sortBy?: 'propertyId' | 'updated';
  },
  me: Doc<'users'>,
  muniIds: Set<Id<'municipalities'>>,
  access: Awaited<ReturnType<typeof fieldSurveyAccess>>,
): Doc<'surveys'>[] {
  let filtered = rows.filter((r) => muniIds.has(r.municipalityId) && canReadWard(me, r.municipalityId, r.wardNo));
  if (args.districtId) filtered = filtered.filter((r) => r.districtId === args.districtId);
  if (args.municipalityId) filtered = filtered.filter((r) => r.municipalityId === args.municipalityId);
  if (args.surveyorId) filtered = filtered.filter((r) => r.surveyorId === args.surveyorId);
  if (args.status) {
    filtered = filtered.filter((r) => r.status === args.status);
  }
  if (args.qcStatus) filtered = filtered.filter((r) => r.qcStatus === args.qcStatus);
  if (args.qcStatuses && args.qcStatuses.length > 0) {
    const allowed = new Set(args.qcStatuses);
    filtered = filtered.filter((r) => {
      if (!allowed.has(r.qcStatus)) return false;
      if (r.qcStatus === 'pending' && r.status !== 'submitted') return false;
      return true;
    });
  }
  if (args.wardNo) filtered = filtered.filter((r) => wardNumbersMatch(r.wardNo, args.wardNo!));
  if (args.fromMs !== undefined) filtered = filtered.filter((r) => r._creationTime >= args.fromMs!);
  if (args.toMs !== undefined) filtered = filtered.filter((r) => r._creationTime <= args.toMs!);
  const sortBy = resolveListSort(args);
  if (sortBy === 'updated') {
    return filtered.sort((a, b) => b.clientUpdatedAt - a.clientUpdatedAt);
  }
  return filtered.sort(compareWardThenParcel);
}

/** Max rows loaded before in-memory filter + manual pagination (matches export scope). */
const LIST_PAGINATED_SCOPE_LIMIT = 5000;

function parseListOffset(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const n = Number(cursor);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

async function querySurveysByMunicipality(
  ctx: QueryCtx,
  municipalityId: Id<'municipalities'>,
  status?: Doc<'surveys'>['status'],
): Promise<Doc<'surveys'>[]> {
  if (status) {
    return ctx.db
      .query('surveys')
      .withIndex('by_municipality_status', (q) => q.eq('municipalityId', municipalityId).eq('status', status))
      .collect();
  }
  return ctx.db
    .query('surveys')
    .withIndex('by_municipality_status', (q) => q.eq('municipalityId', municipalityId))
    .collect();
}

async function querySurveysByDistrict(
  ctx: QueryCtx,
  districtId: Id<'districts'>,
  status?: Doc<'surveys'>['status'],
): Promise<Doc<'surveys'>[]> {
  if (status) {
    return ctx.db
      .query('surveys')
      .withIndex('by_district_status', (q) => q.eq('districtId', districtId).eq('status', status))
      .collect();
  }
  return ctx.db
    .query('surveys')
    .withIndex('by_district_status', (q) => q.eq('districtId', districtId))
    .collect();
}

export type SurveyListFilterArgs = {
  status?: Doc<'surveys'>['status'];
  qcStatus?: Doc<'surveys'>['qcStatus'];
  qcStatuses?: Doc<'surveys'>['qcStatus'][];
  wardNo?: string;
  districtId?: Id<'districts'>;
  municipalityId?: Id<'municipalities'>;
  surveyorId?: Id<'users'>;
  fromMs?: number;
  toMs?: number;
};

/** Load all rows matching list filters using indexes, then scope + filter in memory. */
export async function collectSurveysForListPaginated(
  ctx: QueryCtx,
  me: Doc<'users'>,
  args: SurveyListFilterArgs,
  scope: Awaited<ReturnType<typeof resolveTenantScope>>,
  muniIds: Set<Id<'municipalities'>>,
  access: Awaited<ReturnType<typeof fieldSurveyAccess>>,
): Promise<Doc<'surveys'>[]> {
  let rows: Doc<'surveys'>[] = [];

  if (args.qcStatus) {
    rows = await ctx.db
      .query('surveys')
      .withIndex('by_qc_status', (q) => q.eq('qcStatus', args.qcStatus!))
      .collect();
  } else if (access === 'own') {
    rows = await ctx.db
      .query('surveys')
      .withIndex('by_surveyor', (q) => q.eq('surveyorId', me._id))
      .order('desc')
      .take(LIST_PAGINATED_SCOPE_LIMIT);
  } else if (args.municipalityId) {
    rows = await querySurveysByMunicipality(ctx, args.municipalityId, args.status);
  } else if (args.districtId) {
    rows = await querySurveysByDistrict(ctx, args.districtId, args.status);
  } else if (args.surveyorId) {
    rows = await ctx.db
      .query('surveys')
      .withIndex('by_surveyor', (q) => q.eq('surveyorId', args.surveyorId!))
      .order('desc')
      .take(LIST_PAGINATED_SCOPE_LIMIT);
  } else if (access === 'assigned') {
    const scopedMunis = scope.municipalities.map((m) => m._id);
    if (scopedMunis.length > 1) {
      const batches = await Promise.all(
        scopedMunis.map((municipalityId) => querySurveysByMunicipality(ctx, municipalityId, args.status)),
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
      rows = await querySurveysByMunicipality(ctx, scopedMunis[0]!, args.status);
    } else if (scope.districts.length === 1) {
      rows = await querySurveysByDistrict(ctx, scope.districts[0]!._id, args.status);
    }
  } else {
    rows = await collectSurveysInFieldScope(ctx, me);
  }

  return applySurveyListFilters(rows, args, me, muniIds, access);
}

/** Cursor-paginated survey list sorted by ward then parcel ascending. */
export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    ...listFilterArgs,
  },
  returns: v.object({
    page: v.array(v.any()),
    continueCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
    totalCount: v.number(),
    scopeTruncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const scope = await resolveTenantScope(ctx, me);
    const districtIds = tenantDistrictIds(scope);
    const muniIds = tenantMunicipalityIds(scope);
    const access = await fieldSurveyAccess(ctx, me);

    if (args.municipalityId) {
      await assertMunicipalityInScope(ctx, me, args.municipalityId);
    }
    if (args.districtId && access !== 'admin' && !districtIds.has(args.districtId)) {
      clientError('FORBIDDEN', 'This district is outside your assigned scope');
    }

    let filtered = await collectSurveysForListPaginated(ctx, me, args, scope, muniIds, access);

    if (args.searchTerm?.trim()) {
      const withNames = await enrichSurveyorNames(ctx, filtered);
      const searchCodes = await loadMunicipalityCodes(
        ctx,
        withNames.map((r) => r.municipalityId),
      );
      filtered = filterSurveysBySearch(withNames, args.searchTerm, searchCodes);
    }

    const scopeTruncated = filtered.length > LIST_PAGINATED_SCOPE_LIMIT;
    if (scopeTruncated) {
      filtered = filtered.slice(0, LIST_PAGINATED_SCOPE_LIMIT);
    }

    const totalCount = filtered.length;
    const offset = parseListOffset(args.paginationOpts.cursor);
    const numItems = args.paginationOpts.numItems;
    const pageRows = filtered.slice(offset, offset + numItems);
    const nextOffset = offset + numItems;

    const codes = await loadMunicipalityCodes(
      ctx,
      pageRows.map((r) => r.municipalityId),
    );
    const enriched = enrichSurveyPropertyIds(pageRows, codes);
    const page = await enrichSurveyorNames(ctx, enriched);

    return {
      page,
      continueCursor: nextOffset < filtered.length ? String(nextOffset) : '',
      isDone: nextOffset >= filtered.length,
      totalCount,
      scopeTruncated,
    };
  },
});

const surveyWardStatsEntryShape = {
  wardNo: v.string(),
  municipalityId: v.id('municipalities'),
  city: v.string(),
  total: v.number(),
  drafts: v.number(),
  submitted: v.number(),
  qcApproved: v.number(),
  activeSurveyorCount: v.number(),
  activeSurveyorNames: v.array(v.string()),
};

const surveyCommandCenterStatsShape = {
  total: v.number(),
  drafts: v.number(),
  submitted: v.number(),
  submittedToday: v.number(),
  qcApproved: v.number(),
  qcPending: v.number(),
  qcRejected: v.number(),
  surveyCompletionPct: v.number(),
  wardStats: v.array(v.object(surveyWardStatsEntryShape)),
};

/** Scoped KPI counts for the Survey Command Center — full dataset, not client-capped. */
export const commandCenterStats = query({
  args: {
    districtId: v.optional(v.id('districts')),
    municipalityId: v.optional(v.id('municipalities')),
    wardNo: v.optional(v.string()),
    status: v.optional(surveyStatus),
    qcStatus: v.optional(qcStatus),
    fromMs: v.optional(v.number()),
    toMs: v.optional(v.number()),
    nowMs: v.number(),
  },
  returns: v.object(surveyCommandCenterStatsShape),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const scope = await resolveTenantScope(ctx, me);
    const districtIds = tenantDistrictIds(scope);
    const muniIds = tenantMunicipalityIds(scope);
    const access = await fieldSurveyAccess(ctx, me);

    if (args.municipalityId) {
      await assertMunicipalityInScope(ctx, me, args.municipalityId);
    }
    if (args.districtId && access !== 'admin' && !districtIds.has(args.districtId)) {
      clientError('FORBIDDEN', 'This district is outside your assigned scope');
    }

    const rows = await collectSurveysForListPaginated(
      ctx,
      me,
      {
        districtId: args.districtId,
        municipalityId: args.municipalityId,
        wardNo: args.wardNo,
        status: args.status,
        qcStatus: args.qcStatus,
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

    const completionSum = filtered.reduce((sum, r) => sum + (r.completionPct ?? 0), 0);
    const surveyCompletionPct = filtered.length > 0 ? Math.round(completionSum / filtered.length) : 0;

    const wardAggregates = computeSurveyWardAggregates(filtered);
    const allSurveyorIds = [...new Set(wardAggregates.flatMap((w) => w.activeSurveyorIds))];
    const surveyors = await Promise.all(allSurveyorIds.map((id) => ctx.db.get(id)));
    const nameById = new Map<Id<'users'>, string>();
    for (const s of surveyors) {
      if (s) nameById.set(s._id, s.name);
    }

    const wardStats = wardAggregates.map((w) => {
      const names = w.activeSurveyorIds.map((id) => nameById.get(id)).filter((n): n is string => Boolean(n));
      return {
        wardNo: w.wardNo,
        municipalityId: w.municipalityId,
        city: w.city,
        total: w.total,
        drafts: w.drafts,
        submitted: w.submitted,
        qcApproved: w.qcApproved,
        activeSurveyorCount: w.activeSurveyorIds.length,
        activeSurveyorNames: names.slice(0, 5),
      };
    });

    return {
      total: filtered.length,
      drafts: filtered.filter((r) => r.status === 'draft').length,
      submitted: filtered.filter((r) => r.status === 'submitted').length,
      submittedToday: filtered.filter(
        (r) =>
          r.status === 'submitted' &&
          (r.submittedAt !== undefined ? r.submittedAt >= todayMs : r._creationTime >= todayMs),
      ).length,
      qcApproved: filtered.filter((r) => r.qcStatus === 'approved').length,
      qcPending: filtered.filter((r) => r.qcStatus === 'pending' && r.status === 'submitted').length,
      qcRejected: filtered.filter((r) => r.qcStatus === 'rejected').length,
      surveyCompletionPct,
      wardStats,
    };
  },
});

/** Single survey with floors + photos + QC remarks hydrated for the detail screen. */
export const get = query({
  args: { id: v.id('surveys') },
  handler: async (ctx, args) => {
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.id)]);
    if (!survey) return null;
    await assertCanAccessSurvey(ctx, me, survey);

    const [floors, photos, qcRemarks, surveyor, muni] = await Promise.all([
      ctx.db
        .query('floors')
        .withIndex('by_survey', (q) => q.eq('surveyId', args.id))
        .collect()
        .then((rows) => rows.sort((a, b) => a.position - b.position).map(presentFloorRow)),
      ctx.db
        .query('photos')
        .withIndex('by_survey', (q) => q.eq('surveyId', args.id))
        .collect(),
      ctx.db
        .query('qcRemarks')
        .withIndex('by_survey', (q) => q.eq('surveyId', args.id))
        .order('desc')
        .collect(),
      ctx.db.get(survey.surveyorId),
      ctx.db.get(survey.municipalityId),
    ]);

    // Hydrate photo URLs from Convex storage so the client can display them directly.
    const hydratedPhotos = await Promise.all(
      photos.map(async (p) => ({
        ...p,
        url: await ctx.storage.getUrl(p.storageId),
      })),
    );
    const propertyId = resolvePropertyId(survey, muni?.code ?? '') ?? survey.propertyId;

    return {
      ...survey,
      propertyId,
      districtId: muni?.districtId ?? survey.districtId,
      floors,
      photos: hydratedPhotos,
      qcRemarks,
      surveyor: surveyor ? { _id: surveyor._id, name: surveyor.name } : null,
    };
  },
});

export const getByLocalId = query({
  args: { localId: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    return await ctx.db
      .query('surveys')
      .withIndex('by_surveyor_localId', (q) => q.eq('surveyorId', me._id).eq('localId', args.localId))
      .unique();
  },
});

/* ────────────────────────── mutations ────────────────────────── */

const DRAFT_SURVEY_DEFAULTS = {
  wardNo: '',
  parcelNo: '',
  unitNo: '',
  mobileNo: '',
  locality: '',
  colonyName: '',
  city: '',
  pinCode: '',
  assessmentYear: '',
  ownershipType: '',
  propertyType: '',
  propertyUse: '',
  situation: '',
  roadType: '',
  taxRateZone: '',
  plotSqft: 0,
  plinthSqft: 0,
  isSlum: false,
  municipalWaterConnection: false,
  waterSource: 'government_tap' as const,
  sanitationType: 'sewer_system' as const,
  municipalWasteCollection: false,
};

/**
 * Save in-progress survey data without requiring every step to be complete.
 * Full business rules (PIN vs ULB, owner mobile, taxation, etc.) run on
 * `submit` instead.
 */
export const saveDraft = mutation({
  args: draftSurveyInput,
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const [, ownScope, canInsert, muni, existing] = await Promise.all([
      requireSurveyDraftEdit(ctx, me),
      isOwnScopeSurveyor(ctx, me),
      canInsertSurveyDraft(ctx, me),
      assertMunicipalityInScope(ctx, me, args.municipalityId),
      resolveExistingSurveyForSave(ctx, me, {
        id: args.id,
        localId: args.localId,
        municipalityId: args.municipalityId,
      }),
    ]);
    if (existing) await assertSurveyWritable(ctx, me, existing);
    if (!existing && !canInsert) {
      clientError('BAD_REQUEST', 'No survey found to update — open the record from QC review and try saving again');
    }

    const wardNo = args.wardNo?.trim() ?? existing?.wardNo ?? '';
    if (wardNo) {
      assertCanReadWard(me, args.municipalityId, wardNo);
      const ward = await ctx.db
        .query('wards')
        .withIndex('by_municipality_ward', (q) => q.eq('municipalityId', args.municipalityId).eq('wardNo', wardNo))
        .unique();
      if (!ward) clientError('BAD_REQUEST', 'Unknown ward', { wardNo: ['unknown ward'] });
    }

    const district = await ctx.db.get(muni.districtId);
    const addressCtx = {
      ...addressTenantContext(muni, district),
      configuredPostalCode: muni.postalCode,
    };

    const merged = mergeDraftArgs(existing, args, muni);
    const allowedTaxZones = await loadAllowedTaxZoneSet(ctx);
    const normalized = normalizeAddressFields(
      normalizeOwnerFields(normalizeTaxationFields(withResolvedPropertyId(normalizePropertyFields(merged), muni.code))),
      muni,
    );
    validateBusinessRules(normalized, addressCtx, 'draft', { allowedTaxZones });

    if (existing && existing.status === 'submitted') {
      const isQcEditor = await hasCapability(ctx, me, 'qc.review');
      if (isQcEditor && surveyIdentifyingSlotChanged(existing, normalized, muni.code)) {
        await assertUniqueSurveySlot(ctx, {
          municipalityId: args.municipalityId,
          wardNo: (normalized.wardNo as string) ?? existing.wardNo,
          parcelNo: normalized.parcelNo as string,
          propertyUse: normalized.propertyUse as string | undefined,
          unitNo: normalized.unitNo as string | undefined,
          propertyId: normalized.propertyId as string | undefined,
          excludeId: existing._id,
        });
      }
    }

    const writable = { ...stripLocalId(normalized as SurveyUpsertArgs), districtId: muni.districtId };

    if (existing) {
      const { status, qcStatus } = resolvePostSaveStatuses(existing);
      const completionPct = await completionPctForSurvey(ctx, { ...existing, ...writable } as Doc<'surveys'>);

      await ctx.db.patch(existing._id, {
        ...writable,
        status,
        qcStatus,
        serverVersion: existing.serverVersion + 1,
        clientUpdatedAt: args.clientUpdatedAt,
        completionPct,
      });
      const updated = await ctx.db.get(existing._id);
      if (updated) await syncSurveyAggregates(ctx, existing, updated);
      await writeAudit(ctx, {
        actorId: me._id,
        action: auditActionForSave(existing, ownScope, false),
        entity: 'survey',
        entityId: existing._id,
      });
      return existing._id;
    }

    const completionPct = computeSurveyCompletionPercent({ ...writable, floors: [], photos: [] });
    const newId = await ctx.db.insert('surveys', {
      ...writable,
      surveyorId: me._id,
      localId: args.localId,
      status: 'draft',
      qcStatus: 'pending',
      serverVersion: 1,
      clientUpdatedAt: args.clientUpdatedAt,
      completionPct,
    });
    const created = await ctx.db.get(newId);
    if (created) await syncSurveyAggregates(ctx, null, created);
    await writeAudit(ctx, {
      actorId: me._id,
      action: auditActionForSave(null, ownScope, true),
      entity: 'survey',
      entityId: newId,
      metadata: { localId: args.localId, draft: true },
    });
    return newId;
  },
});

/**
 * Idempotent upsert with full validation. Prefer `saveDraft` while filling
 * the wizard; use this path only when every required field is present.
 *
 * On every write `serverVersion` increments so the client can detect
 * stale-cache conditions.
 */
export const upsert = mutation({
  args: surveyInput,
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const [, ownScope, canInsert, muni] = await Promise.all([
      requireSurveyDraftEdit(ctx, me),
      isOwnScopeSurveyor(ctx, me),
      canInsertSurveyDraft(ctx, me),
      assertMunicipalityInScope(ctx, me, args.municipalityId),
    ]);
    assertCanReadWard(me, args.municipalityId, args.wardNo);

    const district = await ctx.db.get(muni.districtId);
    const addressCtx = {
      ...addressTenantContext(muni, district),
      configuredPostalCode: muni.postalCode,
    };
    const allowedTaxZones = await loadAllowedTaxZoneSet(ctx);
    const normalized = normalizeAddressFields(
      normalizeOwnerFields(normalizeTaxationFields(withResolvedPropertyId(normalizePropertyFields(args), muni.code))),
      muni,
    );
    validateBusinessRules(normalized, addressCtx, 'submit', { allowedTaxZones });

    // Confirm ward exists within the municipality
    const ward = await ctx.db
      .query('wards')
      .withIndex('by_municipality_ward', (q) => q.eq('municipalityId', args.municipalityId).eq('wardNo', args.wardNo))
      .unique();
    if (!ward) clientError('BAD_REQUEST', 'Unknown ward', { wardNo: ['unknown ward'] });

    const existing = await resolveExistingSurveyForSave(ctx, me, {
      id: args.id,
      localId: args.localId,
      municipalityId: args.municipalityId,
    });
    if (existing) await assertSurveyWritable(ctx, me, existing);
    if (!existing && !canInsert) {
      clientError('BAD_REQUEST', 'No survey found to update — open the record from QC review and try saving again');
    }

    await assertUniqueSurveySlot(ctx, {
      municipalityId: args.municipalityId,
      wardNo: normalized.wardNo as string,
      parcelNo: normalized.parcelNo as string,
      propertyUse: normalized.propertyUse as string | undefined,
      unitNo: normalized.unitNo as string,
      propertyId: normalized.propertyId as string | undefined,
      excludeId: existing?._id,
    });

    const writable = { ...stripLocalId(normalized), districtId: muni.districtId };

    if (existing) {
      const { status, qcStatus } = resolvePostSaveStatuses(existing);

      await ctx.db.patch(existing._id, {
        ...writable,
        status,
        qcStatus,
        serverVersion: existing.serverVersion + 1,
        clientUpdatedAt: args.clientUpdatedAt,
      });
      const updatedUpsert = await ctx.db.get(existing._id);
      if (updatedUpsert) await syncSurveyAggregates(ctx, existing, updatedUpsert);
      await Promise.all([
        refreshSurveyCompletionPct(ctx, existing._id),
        writeAudit(ctx, {
          actorId: me._id,
          action: auditActionForSave(existing, ownScope, false),
          entity: 'survey',
          entityId: existing._id,
        }),
      ]);
      return existing._id;
    }

    const newId = await ctx.db.insert('surveys', {
      ...writable,
      surveyorId: me._id,
      localId: args.localId,
      status: 'draft',
      qcStatus: 'pending',
      serverVersion: 1,
    });
    const createdUpsert = await ctx.db.get(newId);
    if (createdUpsert) await syncSurveyAggregates(ctx, null, createdUpsert);
    await Promise.all([
      refreshSurveyCompletionPct(ctx, newId),
      writeAudit(ctx, {
        actorId: me._id,
        action: 'survey.created',
        entity: 'survey',
        entityId: newId,
        metadata: { localId: args.localId },
      }),
    ]);
    return newId;
  },
});

/** Attach or refresh GPS on a draft survey before submit. */
export const setGps = mutation({
  args: { id: v.id('surveys'), gps: gpsCapture },
  handler: async (ctx, args) => {
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.id)]);
    if (!survey) clientError('NOT_FOUND', 'Survey not found');
    if (survey.surveyorId !== me._id && me.role === 'surveyor') {
      clientError('FORBIDDEN', 'Not your survey');
    }
    await assertMunicipalityInScope(ctx, me, survey.municipalityId);
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    await assertSurveyWritable(ctx, me, survey);
    const gpsMessage = validateGps(args.gps, { strict: false });
    if (gpsMessage) {
      clientError('VALIDATION', gpsMessage, { gps: [gpsMessage] });
    }
    await ctx.db.patch(args.id, {
      gps: args.gps,
      serverVersion: survey.serverVersion + 1,
    });
  },
});

const submitFloorRow = v.object({
  clientFloorId: v.string(),
  position: v.number(),
  floorName: v.string(),
  usageFactor: v.optional(v.string()),
  usageType: v.string(),
  constructionType: v.string(),
  isOccupied: v.boolean(),
  areaSqft: v.number(),
});

type SubmitFloorRow = {
  clientFloorId: string;
  position: number;
  floorName: string;
  usageFactor?: string;
  usageType: string;
  constructionType: string;
  isOccupied: boolean;
  areaSqft: number;
};

async function syncSubmitArea(
  ctx: MutationCtx,
  survey: Doc<'surveys'>,
  input: {
    plotSqft?: number;
    plinthSqft?: number;
    floors?: SubmitFloorRow[];
    keepClientFloorIds?: string[];
  },
): Promise<Doc<'surveys'>> {
  let serverVersion = survey.serverVersion;

  if (input.floors) {
    await Promise.all(
      input.floors.map(async (fl) => {
        const normalized = normalizeFloorFields({
          usageFactor: fl.usageFactor,
          usageType: fl.usageType,
        });
        const floorErrors = validateFloorRow({
          floorName: fl.floorName,
          usageFactor: normalized.usageFactor || undefined,
          usageType: normalized.usageType,
          constructionType: fl.constructionType,
          areaSqft: fl.areaSqft,
        });
        if (Object.keys(floorErrors).length > 0) {
          clientError('VALIDATION', 'Invalid floor row', floorErrors);
        }

        const row = {
          position: fl.position,
          floorName: fl.floorName,
          usageFactor: normalized.usageFactor || undefined,
          usageType: normalized.usageType,
          constructionType: fl.constructionType,
          isOccupied: usageTypeToOccupied(normalized.usageType),
          areaSqft: fl.areaSqft,
        };

        const existing = await ctx.db
          .query('floors')
          .withIndex('by_survey_clientFloorId', (q) =>
            q.eq('surveyId', survey._id).eq('clientFloorId', fl.clientFloorId),
          )
          .unique();

        if (existing) {
          await ctx.db.patch(existing._id, row);
        } else {
          await ctx.db.insert('floors', {
            surveyId: survey._id,
            clientFloorId: fl.clientFloorId,
            ...row,
          });
        }
      }),
    );

    if (input.keepClientFloorIds) {
      const keep = new Set(input.keepClientFloorIds);
      const rows = await ctx.db
        .query('floors')
        .withIndex('by_survey', (q) => q.eq('surveyId', survey._id))
        .collect();
      const deleteOps = [];
      for (const row of rows) {
        if (!keep.has(row.clientFloorId)) deleteOps.push(ctx.db.delete(row._id));
      }
      await Promise.all(deleteOps);
    }

    serverVersion += 1;
  }

  const floorRows = await ctx.db
    .query('floors')
    .withIndex('by_survey', (q) => q.eq('surveyId', survey._id))
    .collect();

  const resolvedPlot =
    input.plotSqft !== undefined && input.plotSqft > 0
      ? input.plotSqft
      : derivePlotSqftForSubmit(survey.plotSqft, floorRows);
  const resolvedPlinth = input.plinthSqft ?? plinthSqftFromFloors(floorRows);

  const areaPatch: Partial<Pick<Doc<'surveys'>, 'plotSqft' | 'plinthSqft'>> = {};
  if (resolvedPlot > 0 && resolvedPlot !== survey.plotSqft) areaPatch.plotSqft = resolvedPlot;
  if (resolvedPlinth !== survey.plinthSqft) areaPatch.plinthSqft = resolvedPlinth;

  if (Object.keys(areaPatch).length > 0 || input.floors) {
    await ctx.db.patch(survey._id, {
      ...areaPatch,
      serverVersion: serverVersion + 1,
    });
    const updated = await ctx.db.get(survey._id);
    if (!updated) clientError('NOT_FOUND', 'Survey not found');
    return updated;
  }

  return survey;
}

async function ensureSurveyAreaReady(ctx: MutationCtx, survey: Doc<'surveys'>): Promise<Doc<'surveys'>> {
  const floors = await ctx.db
    .query('floors')
    .withIndex('by_survey', (q) => q.eq('surveyId', survey._id))
    .collect();
  const derivedPlot = derivePlotSqftForSubmit(survey.plotSqft, floors);
  if (!(derivedPlot > 0) || derivedPlot === survey.plotSqft) {
    return survey;
  }
  const plinthSqft = plinthSqftFromFloors(floors);
  await ctx.db.patch(survey._id, {
    plotSqft: derivedPlot,
    plinthSqft,
    serverVersion: survey.serverVersion + 1,
  });
  const updated = await ctx.db.get(survey._id);
  if (!updated) clientError('NOT_FOUND', 'Survey not found');
  return updated;
}

/**
 * Transitions a draft to `submitted`. Requires at least one floor row
 * (built-up or open land) with area > 0, plus required photos (front + side).
 * Optional `floors` / `plotSqft` sync area rows before validation (mobile submit).
 */
export const submit = mutation({
  args: {
    id: v.id('surveys'),
    plotSqft: v.optional(v.number()),
    plinthSqft: v.optional(v.number()),
    floors: v.optional(v.array(submitFloorRow)),
    keepClientFloorIds: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [me, surveyOrNull] = await Promise.all([requireUser(ctx), ctx.db.get(args.id)]);
    let survey = surveyOrNull;
    if (!survey) clientError('NOT_FOUND', 'Survey not found');
    const [, ownScope] = await Promise.all([requireCapability(ctx, me, 'surveys.submit'), isOwnScopeSurveyor(ctx, me)]);
    if (survey.surveyorId !== me._id && ownScope) {
      clientError('FORBIDDEN', 'Not your survey');
    }
    if (survey.status !== 'draft' && survey.status !== 'rejected') {
      const message =
        survey.status === 'submitted'
          ? 'This survey is already submitted and awaiting QC review'
          : survey.status === 'approved'
            ? 'Approved surveys cannot be submitted again'
            : 'Only draft surveys can be submitted';
      clientError('BAD_STATE', message);
    }
    await assertMunicipalityInScope(ctx, me, survey.municipalityId);
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);

    const hasAreaSync = args.plotSqft !== undefined || args.plinthSqft !== undefined || args.floors !== undefined;
    if (hasAreaSync) {
      survey = await syncSubmitArea(ctx, survey, {
        plotSqft: args.plotSqft,
        plinthSqft: args.plinthSqft,
        floors: args.floors,
        keepClientFloorIds: args.keepClientFloorIds,
      });
    } else {
      survey = await ensureSurveyAreaReady(ctx, survey);
    }

    const floors = await ctx.db
      .query('floors')
      .withIndex('by_survey', (q) => q.eq('surveyId', args.id))
      .collect();
    const areaErrors = validateAreaSection({
      plotSqft: survey.plotSqft,
      plinthSqft: survey.plinthSqft,
      floors: floors.map((f) => ({ floorName: f.floorName, areaSqft: f.areaSqft })),
    });
    if (Object.keys(areaErrors).length > 0) {
      clientError('VALIDATION', 'Area details incomplete', areaErrors);
    }

    const photos = await ctx.db
      .query('photos')
      .withIndex('by_survey', (q) => q.eq('surveyId', args.id))
      .collect();
    const slots = new Set(photos.map((p) => p.slot));
    const missing: string[] = [];
    if (!slots.has('front')) missing.push('front photo required');
    if (!slots.has('side')) missing.push('side photo required');
    if (missing.length > 0) {
      clientError('VALIDATION', 'Required photos missing', { photos: missing });
    }
    if (!survey.gps) {
      clientError('VALIDATION', 'GPS capture required', { gps: ['capture GPS first'] });
    }

    const muni = await ctx.db.get(survey.municipalityId);
    if (!muni) clientError('NOT_FOUND', 'Municipality not found');
    const district = await ctx.db.get(muni.districtId);
    const addressCtx = {
      ...addressTenantContext(muni, district),
      configuredPostalCode: muni.postalCode,
    };
    validateBusinessRules(survey as unknown as Record<string, unknown>, addressCtx, 'submit');

    await ctx.db.patch(args.id, {
      status: 'submitted',
      qcStatus: survey.qcStatus === 'rejected' ? 'pending' : survey.qcStatus,
      submittedAt: Date.now(),
      serverVersion: survey.serverVersion + 1,
    });
    const submitted = await ctx.db.get(args.id);
    if (submitted) await syncSurveyAggregates(ctx, survey, submitted);
    await writeAudit(ctx, {
      actorId: me._id,
      action: 'survey.submitted',
      entity: 'survey',
      entityId: args.id,
    });

    return null;
  },
});

export const remove = mutation({
  args: { id: v.id('surveys') },
  handler: async (ctx, args) => {
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.id)]);
    if (!survey) return;
    if (survey.surveyorId !== me._id && me.role !== 'admin') {
      clientError('FORBIDDEN', 'Not your survey');
    }
    await assertMunicipalityInScope(ctx, me, survey.municipalityId);
    if (survey.qcStatus === 'approved') {
      clientError('LOCKED', 'Cannot delete an approved survey');
    }

    // Cascade delete child rows.
    for await (const f of ctx.db.query('floors').withIndex('by_survey', (q) => q.eq('surveyId', args.id))) {
      await ctx.db.delete(f._id);
    }
    for await (const p of ctx.db.query('photos').withIndex('by_survey', (q) => q.eq('surveyId', args.id))) {
      await ctx.storage.delete(p.storageId);
      await ctx.db.delete(p._id);
    }
    for await (const r of ctx.db.query('qcRemarks').withIndex('by_survey', (q) => q.eq('surveyId', args.id))) {
      await ctx.db.delete(r._id);
    }
    await syncSurveyAggregates(ctx, survey, null);
    await ctx.db.delete(args.id);

    await writeAudit(ctx, {
      actorId: me._id,
      action: 'survey.deleted',
      entity: 'survey',
      entityId: args.id,
    });
  },
});

/* ────────────────────────── internal ────────────────────────── */

type SurveyUpsertArgs = {
  localId: string;
  municipalityId: Id<'municipalities'>;
  clientUpdatedAt: number;
  wardNo: string;
  parcelNo: string;
  unitNo: string;
  mobileNo: string;
  locality: string;
  colonyName: string;
  city: string;
  pinCode: string;
  assessmentYear: string;
  ownershipType: string;
  propertyType: string;
  propertyUse: string;
  situation: string;
  roadType: string;
  taxRateZone: string;
  plotSqft: number;
  plinthSqft: number;
  isSlum: boolean;
  municipalWaterConnection: boolean;
  waterSource: Doc<'surveys'>['waterSource'];
  sanitationType: Doc<'surveys'>['sanitationType'];
  municipalWasteCollection: boolean;
  sectorNo?: string;
  oldPropertyNo?: string;
  propertyId?: string;
  constructedYear?: number;
  respondentName?: string;
  relationship?: string;
  owners?: Doc<'surveys'>['owners'];
  familySize?: number;
  altMobileNo?: string;
  houseNo?: string;
  electricityNo?: string;
  gps?: Doc<'surveys'>['gps'];
  street?: string;
};

export function normalizePropertyFields<
  T extends {
    parcelNo?: string;
    unitNo?: string;
    sectorNo?: string;
    oldPropertyNo?: string;
    propertyId?: string;
    constructedYear?: number;
  },
>(args: T): T {
  return {
    ...args,
    sectorNo: args.sectorNo?.trim() || undefined,
    oldPropertyNo: args.oldPropertyNo?.trim() || undefined,
    propertyId: args.propertyId?.trim() || undefined,
    parcelNo: (args.parcelNo ?? '').trim(),
    unitNo: (args.unitNo ?? '').trim(),
    constructedYear: args.constructedYear,
  };
}

export function withResolvedPropertyId<
  T extends {
    propertyId?: string;
    wardNo?: string;
    parcelNo?: string;
    unitNo?: string;
    propertyUse?: string;
  },
>(args: T, ulbCode: string): T {
  return {
    ...args,
    propertyId: resolvePropertyId(args, ulbCode),
  };
}

export function normalizeOwnerFields<
  T extends {
    mobileNo?: string;
    altMobileNo?: string;
    respondentName?: string;
    relationship?: string;
    owners?: Doc<'surveys'>['owners'];
    familySize?: number;
  },
>(args: T): T {
  const trimOpt = (s?: string) => {
    const t = s?.trim();
    return t ? t : undefined;
  };
  const owners = normalizeOwners(args.owners as Parameters<typeof normalizeOwners>[0]);
  const relationship = trimOpt(args.relationship as string | undefined);
  const mobileNo = primaryOwnerMobile(owners, relationship) ?? trimOpt(args.mobileNo as string | undefined) ?? '';
  const altMobileNo = owners?.[0]?.altMobileNo ?? trimOpt(args.altMobileNo as string | undefined);
  return {
    ...args,
    respondentName: trimOpt(args.respondentName as string | undefined),
    relationship,
    owners,
    mobileNo,
    altMobileNo,
    familySize: args.familySize as number | undefined,
  };
}

/** Remove mutation-only keys before writing to the `surveys` table. */
export function stripLocalId<T extends { localId: string; id?: Id<'surveys'>; surveyorId?: Id<'users'> }>(
  args: T,
): Omit<T, 'localId' | 'id'> {
  const { localId: _l, id: _id, ...rest } = args;
  return rest;
}

type DraftMutationArgs = {
  id?: Id<'surveys'>;
  localId: string;
  municipalityId: Id<'municipalities'>;
  clientUpdatedAt: number;
  wardNo?: string;
  [key: string]: unknown;
};

export function mergeDraftArgs(
  existing: Doc<'surveys'> | null,
  patch: DraftMutationArgs,
  muni: Doc<'municipalities'>,
): SurveyUpsertArgs {
  const base: SurveyUpsertArgs = existing
    ? {
        localId: patch.localId,
        municipalityId: patch.municipalityId,
        clientUpdatedAt: patch.clientUpdatedAt,
        wardNo: existing.wardNo,
        sectorNo: existing.sectorNo,
        oldPropertyNo: existing.oldPropertyNo,
        propertyId: existing.propertyId,
        parcelNo: existing.parcelNo,
        unitNo: existing.unitNo,
        constructedYear: existing.constructedYear,
        isSlum: existing.isSlum,
        respondentName: existing.respondentName,
        relationship: existing.relationship,
        owners: existing.owners,
        familySize: existing.familySize,
        mobileNo: existing.mobileNo,
        altMobileNo: existing.altMobileNo,
        houseNo: existing.houseNo,
        locality: existing.locality,
        colonyName: existing.colonyName,
        pinCode: existing.pinCode,
        city: existing.city,
        assessmentYear: existing.assessmentYear,
        ownershipType: existing.ownershipType,
        propertyType: existing.propertyType,
        propertyUse: existing.propertyUse,
        situation: existing.situation,
        roadType: existing.roadType,
        taxRateZone: existing.taxRateZone,
        plotSqft: existing.plotSqft,
        plinthSqft: existing.plinthSqft,
        municipalWaterConnection: existing.municipalWaterConnection,
        waterSource: existing.waterSource,
        sanitationType: existing.sanitationType,
        municipalWasteCollection: existing.municipalWasteCollection,
        electricityNo: existing.electricityNo,
        gps: existing.gps,
      }
    : {
        localId: patch.localId,
        municipalityId: patch.municipalityId,
        clientUpdatedAt: patch.clientUpdatedAt,
        ...DRAFT_SURVEY_DEFAULTS,
        city: muni.name,
      };

  const { localId: _l, municipalityId: _m, clientUpdatedAt: _c, id: _id, ...fields } = patch;
  return { ...base, ...pickDefined(fields) };
}

function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

function validateBusinessRules(
  in_: Record<string, unknown>,
  addressCtx: Parameters<typeof validateAddressSection>[1],
  mode: 'draft' | 'submit' = 'submit',
  options?: { allowedTaxZones?: Set<string> },
): void {
  const details: Record<string, string[]> = {};
  const strict = mode === 'submit';

  Object.assign(
    details,
    validateOwnerSection(
      {
        relationship: in_.relationship as string | undefined,
        owners: in_.owners as Parameters<typeof validateOwnerSection>[0]['owners'],
      },
      { requirePrimaryMobile: strict },
    ),
  );
  const denormalizedMobile = String(in_.mobileNo ?? '').trim();
  if (denormalizedMobile && !isValidIndianOwnerMobile(denormalizedMobile)) {
    details.mobileNo = ['Enter a valid 10-digit mobile (starts 6-9)'];
  }
  Object.assign(
    details,
    validateAddressSection(
      {
        houseNo: in_.houseNo as string | undefined,
        locality: in_.locality as string,
        colonyName: in_.colonyName as string,
        city: in_.city as string,
        pinCode: in_.pinCode as string,
      },
      addressCtx,
      mode,
    ),
  );
  const plot = in_.plotSqft as unknown as number;
  const plinth = in_.plinthSqft as unknown as number;
  if (typeof plot === 'number' && typeof plinth === 'number' && plinth > plot && plot > 0) {
    details.plinthSqft = ['Plinth area cannot exceed plot area'];
  }
  const familySize = in_.familySize as unknown as number | undefined;
  if (familySize != null && (familySize < 1 || !Number.isInteger(familySize))) {
    details.familySize = ['Family size must be a whole number ≥ 1'];
  }

  const parcelNo = String(in_.parcelNo ?? '').trim();
  if (strict && !parcelNo) {
    details.parcelNo = ['Parcel number is required'];
  }
  const unitNo = String(in_.unitNo ?? '').trim();
  if (strict && !unitNo) {
    details.unitNo = ['Unit number is required'];
  }
  if (strict && !String(in_.assessmentYear ?? '').trim()) {
    details.assessmentYear = ['Assessment year is required'];
  }
  Object.assign(
    details,
    validateTaxationSection(
      {
        ownershipType: in_.ownershipType as string | undefined,
        propertyUse: in_.propertyUse as string | undefined,
        propertyType: in_.propertyType as string | undefined,
        situation: in_.situation as string | undefined,
        roadType: in_.roadType as string | undefined,
        taxRateZone: in_.taxRateZone as string | undefined,
      },
      mode,
      options,
    ),
  );
  Object.assign(
    details,
    validateServicesSection(
      {
        municipalWaterConnection: in_.municipalWaterConnection as boolean | undefined,
        waterSource: in_.waterSource as string | undefined,
        sanitationType: in_.sanitationType as string | undefined,
        municipalWasteCollection: in_.municipalWasteCollection as boolean | undefined,
      },
      mode,
    ),
  );
  const constructedYear = in_.constructedYear as unknown as number | undefined;
  if (constructedYear != null) {
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(constructedYear) || constructedYear < 1800 || constructedYear > currentYear) {
      details.constructedYear = [`Enter a year between 1800 and ${currentYear}`];
    }
  }
  if (in_.gps) {
    const gpsMessage = validateGps(in_.gps as NonNullable<Doc<'surveys'>['gps']>, {
      strict,
    });
    if (gpsMessage) {
      details.gps = [gpsMessage];
    }
  }
  if (Object.keys(details).length > 0) {
    throw new ConvexError({
      code: 'VALIDATION',
      message: 'Business rule violation',
      details,
    });
  }
}
