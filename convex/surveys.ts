/**
 * Survey domain — create, read, list, submit. Floors and photos have their
 * own modules (`floors.ts`, `photos.ts`).
 *
 * Idempotency: every call to `upsert` takes a client-generated `localId`.
 * Re-sending the same `localId` updates the existing row instead of
 * creating a new one — this is how the mobile's draft-then-sync flow stays
 * safe across retries.
 */
import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { assertCanReadWard, clientError, requireRole, requireUser, writeAudit } from './helpers';
import { gpsCapture, qcStatus, surveyStatus } from './schema';
import { assertMunicipalityInScope, resolveTenantScope, tenantDistrictIds, tenantMunicipalityIds } from './tenancy';

/* ────────────────────────── shared input validator ────────────────────────── */

const surveyInput = {
  localId: v.string(),
  municipalityId: v.id('municipalities'),
  wardNo: v.string(),

  propertyNo: v.string(),
  isSlum: v.boolean(),

  ownerName: v.string(),
  respondentName: v.string(),
  relationship: v.string(),
  mobileNo: v.string(),
  familySize: v.number(),

  houseNo: v.string(),
  street: v.string(),
  locality: v.optional(v.string()),
  city: v.string(),
  pinCode: v.string(),

  assessmentYear: v.string(),
  ownershipType: v.string(),
  propertyType: v.string(),
  propertyUse: v.string(),
  situation: v.string(),
  roadType: v.string(),
  taxRateZone: v.string(),
  plotSqft: v.number(),
  plinthSqft: v.number(),

  waterSource: v.string(),
  sanitationType: v.string(),
  solidWasteType: v.string(),
  electricityNo: v.optional(v.string()),

  gps: v.optional(gpsCapture),
  clientUpdatedAt: v.number(),
};

/* ────────────────────────── reactive queries ────────────────────────── */

/**
 * Tenant-filtered list. The mobile app subscribes to this with `useQuery`
 * — Convex pushes updates automatically when any matching row changes,
 * so there's no need for a manual refetch on the surveyor's device.
 */
export const list = query({
  args: {
    status: v.optional(surveyStatus),
    qcStatus: v.optional(qcStatus),
    wardNo: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const limit = Math.min(args.limit ?? 50, 200);

    // Choose the cheapest index. Surveyors hit the by_surveyor index;
    // supervisors/admins use municipality-level indexes.
    const scope = await resolveTenantScope(ctx, me);
    const districtIds = tenantDistrictIds(scope);
    const muniIds = tenantMunicipalityIds(scope);

    let rows: Doc<'surveys'>[];
    if (me.role === 'surveyor') {
      rows = await ctx.db
        .query('surveys')
        .withIndex('by_surveyor', (q) => q.eq('surveyorId', me._id))
        .order('desc')
        .take(limit * 2);
      rows = rows.filter((r) => !r.districtId || districtIds.has(r.districtId)).slice(0, limit);
    } else if (me.role === 'supervisor') {
      if (scope.districts.length === 1) {
        rows = await ctx.db
          .query('surveys')
          .withIndex('by_district_status', (q) =>
            args.status
              ? q.eq('districtId', scope.districts[0]!._id).eq('status', args.status)
              : q.eq('districtId', scope.districts[0]!._id),
          )
          .order('desc')
          .take(limit);
      } else if (me.municipalityId) {
        rows = await ctx.db
          .query('surveys')
          .withIndex('by_municipality_status', (q) =>
            args.status
              ? q.eq('municipalityId', me.municipalityId!).eq('status', args.status)
              : q.eq('municipalityId', me.municipalityId!),
          )
          .order('desc')
          .take(limit);
      } else {
        return [];
      }
    } else if (me.role === 'admin') {
      rows = await ctx.db.query('surveys').order('desc').take(limit);
    } else {
      rows = [];
    }

    rows = rows.filter((r) => muniIds.has(r.municipalityId));

    // Apply remaining filters in memory — they're small once the index has narrowed.
    if (args.status && me.role !== 'supervisor') {
      rows = rows.filter((r) => r.status === args.status);
    }
    if (args.qcStatus) {
      rows = rows.filter((r) => r.qcStatus === args.qcStatus);
    }
    if (args.wardNo) {
      rows = rows.filter((r) => r.wardNo === args.wardNo);
    }
    return rows;
  },
});

/** Single survey with floors + photos + QC remarks hydrated for the detail screen. */
export const get = query({
  args: { id: v.id('surveys') },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const survey = await ctx.db.get(args.id);
    if (!survey) return null;
    await assertMunicipalityInScope(ctx, me, survey.municipalityId);
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);

    const [floors, photos, qcRemarks, surveyor] = await Promise.all([
      ctx.db
        .query('floors')
        .withIndex('by_survey', (q) => q.eq('surveyId', args.id))
        .collect()
        .then((rows) => rows.sort((a, b) => a.position - b.position)),
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
    ]);

    // Hydrate photo URLs from Convex storage so the client can display them directly.
    const hydratedPhotos = await Promise.all(
      photos.map(async (p) => ({
        ...p,
        url: await ctx.storage.getUrl(p.storageId),
      })),
    );

    const muni = await ctx.db.get(survey.municipalityId);

    return {
      ...survey,
      districtId: muni?.districtId,
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

/**
 * Idempotent upsert. The mobile calls this once per draft save; if the
 * call retries (network blip), the duplicate is folded into the same row
 * via the `by_surveyor_localId` index.
 *
 * Business rules enforced server-side:
 *  - plinth ≤ plot
 *  - mobile is 10 digits starting 6–9
 *  - pin is 6 digits not starting 0
 *  - the user actually has access to (municipality, ward)
 *  - the ward must exist
 *
 * On every write `serverVersion` increments so the client can detect
 * stale-cache conditions.
 */
export const upsert = mutation({
  args: surveyInput,
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    requireRole(me, 'surveyor', 'supervisor', 'admin');
    const muni = await assertMunicipalityInScope(ctx, me, args.municipalityId);
    assertCanReadWard(me, args.municipalityId, args.wardNo);

    validateBusinessRules(args as unknown as typeof surveyInput);

    // Confirm ward exists within the municipality
    const ward = await ctx.db
      .query('wards')
      .withIndex('by_municipality_ward', (q) => q.eq('municipalityId', args.municipalityId).eq('wardNo', args.wardNo))
      .unique();
    if (!ward) clientError('BAD_REQUEST', 'Unknown ward', { wardNo: ['unknown ward'] });

    const existing = await ctx.db
      .query('surveys')
      .withIndex('by_surveyor_localId', (q) => q.eq('surveyorId', me._id).eq('localId', args.localId))
      .unique();

    const now = Date.now();
    const writable = { ...stripLocalId(args), districtId: muni.districtId };

    if (existing) {
      // If the supervisor already approved this row, lock further edits unless
      // it's the supervisor/admin doing the edit (which re-opens QC).
      if (existing.qcStatus === 'approved' && me.role === 'surveyor') {
        clientError('LOCKED', 'This survey is locked — request your supervisor to re-open it');
      }

      const newStatus: Doc<'surveys'>['status'] = existing.status === 'draft' ? 'draft' : existing.status;
      const newQcStatus: Doc<'surveys'>['qcStatus'] = existing.qcStatus === 'approved' ? 'pending' : existing.qcStatus;

      await ctx.db.patch(existing._id, {
        ...writable,
        status: newStatus,
        qcStatus: newQcStatus,
        serverVersion: existing.serverVersion + 1,
      });
      await writeAudit(ctx, {
        actorId: me._id,
        action: 'survey.updated',
        entity: 'survey',
        entityId: existing._id,
      });
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
    await writeAudit(ctx, {
      actorId: me._id,
      action: 'survey.created',
      entity: 'survey',
      entityId: newId,
      metadata: { localId: args.localId },
    });
    return newId;
  },
});

/** Attach or refresh GPS on a draft survey before submit. */
export const setGps = mutation({
  args: { id: v.id('surveys'), gps: gpsCapture },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const survey = await ctx.db.get(args.id);
    if (!survey) clientError('NOT_FOUND', 'Survey not found');
    if (survey.surveyorId !== me._id && me.role === 'surveyor') {
      clientError('FORBIDDEN', 'Not your survey');
    }
    await assertMunicipalityInScope(ctx, me, survey.municipalityId);
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    if (survey.qcStatus === 'approved' && me.role === 'surveyor') {
      clientError('LOCKED', 'Survey is locked');
    }
    if (args.gps.accuracyMeters > 500) {
      clientError('VALIDATION', 'GPS accuracy too poor; retake outside', {
        gps: ['GPS accuracy too poor; retake outside'],
      });
    }
    await ctx.db.patch(args.id, {
      gps: args.gps,
      serverVersion: survey.serverVersion + 1,
    });
  },
});

/**
 * Transitions a draft to `submitted`. Requires at least one floor and
 * both required photos (front + inside).
 */
export const submit = mutation({
  args: { id: v.id('surveys') },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const survey = await ctx.db.get(args.id);
    if (!survey) clientError('NOT_FOUND', 'Survey not found');
    if (survey.surveyorId !== me._id && me.role === 'surveyor') {
      clientError('FORBIDDEN', 'Not your survey');
    }
    if (survey.status !== 'draft' && survey.status !== 'rejected') {
      clientError('BAD_STATE', 'Only drafts can be submitted');
    }
    await assertMunicipalityInScope(ctx, me, survey.municipalityId);
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);

    const floors = await ctx.db
      .query('floors')
      .withIndex('by_survey', (q) => q.eq('surveyId', args.id))
      .collect();
    if (floors.length === 0) {
      clientError('VALIDATION', 'Add at least one floor', { floors: ['required'] });
    }

    const photos = await ctx.db
      .query('photos')
      .withIndex('by_survey', (q) => q.eq('surveyId', args.id))
      .collect();
    const slots = new Set(photos.map((p) => p.slot));
    const missing: string[] = [];
    if (!slots.has('front')) missing.push('front photo required');
    if (!slots.has('inside')) missing.push('inside photo required');
    if (missing.length > 0) {
      clientError('VALIDATION', 'Required photos missing', { photos: missing });
    }
    if (!survey.gps) {
      clientError('VALIDATION', 'GPS capture required', { gps: ['capture GPS first'] });
    }

    await ctx.db.patch(args.id, {
      status: 'submitted',
      qcStatus: survey.qcStatus === 'rejected' ? 'pending' : survey.qcStatus,
      submittedAt: Date.now(),
      serverVersion: survey.serverVersion + 1,
    });
    await writeAudit(ctx, {
      actorId: me._id,
      action: 'survey.submitted',
      entity: 'survey',
      entityId: args.id,
    });
  },
});

export const remove = mutation({
  args: { id: v.id('surveys') },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const survey = await ctx.db.get(args.id);
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

function stripLocalId<T extends { localId: string; surveyorId?: Id<'users'> }>(args: T): Omit<T, 'localId'> {
  const { localId: _l, ...rest } = args;
  return rest;
}

function validateBusinessRules(in_: typeof surveyInput): void {
  const details: Record<string, string[]> = {};

  if (!/^[6-9]\d{9}$/.test(in_.mobileNo as unknown as string)) {
    details.mobileNo = ['Enter a valid 10-digit mobile (starts 6-9)'];
  }
  if (!/^[1-9]\d{5}$/.test(in_.pinCode as unknown as string)) {
    details.pinCode = ['PIN must be 6 digits, not starting with 0'];
  }
  const plot = in_.plotSqft as unknown as number;
  const plinth = in_.plinthSqft as unknown as number;
  if (typeof plot === 'number' && typeof plinth === 'number' && plinth > plot) {
    details.plinthSqft = ['Plinth area cannot exceed plot area'];
  }
  if ((in_.familySize as unknown as number) < 1) {
    details.familySize = ['Family size must be ≥ 1'];
  }
  if (in_.gps && (in_.gps as unknown as { accuracyMeters: number }).accuracyMeters > 500) {
    details.gps = ['GPS accuracy too poor; retake outside'];
  }
  if (Object.keys(details).length > 0) {
    throw new ConvexError({
      code: 'VALIDATION',
      message: 'Business rule violation',
      details,
    });
  }
}
