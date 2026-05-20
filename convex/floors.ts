/**
 * Floors live in their own table because they're 1:N to a survey and the
 * client can add/remove/reorder them independently of the parent rows.
 *
 * Idempotency: `clientFloorId` is the key. The mobile generates it once
 * and resends on every save — duplicate sends update in place.
 */
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { normalizeFloorFields, presentFloorRow, usageTypeToOccupied, validateFloorRow } from './areaMasters';
import { assertCanReadWard, clientError, requireUser, writeAudit } from './helpers';

export const list = query({
  args: { surveyId: v.id('surveys') },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const survey = await ctx.db.get(args.surveyId);
    if (!survey) return [];
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    const rows = await ctx.db
      .query('floors')
      .withIndex('by_survey', (q) => q.eq('surveyId', args.surveyId))
      .collect();
    return rows.sort((a, b) => a.position - b.position).map(presentFloorRow);
  },
});

export const upsert = mutation({
  args: {
    surveyId: v.id('surveys'),
    clientFloorId: v.string(),
    position: v.number(),
    floorName: v.string(),
    usageFactor: v.optional(v.string()),
    usageType: v.string(),
    constructionType: v.string(),
    isOccupied: v.boolean(),
    areaSqft: v.number(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const survey = await ctx.db.get(args.surveyId);
    if (!survey) clientError('NOT_FOUND', 'Survey not found');
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    if (survey.qcStatus === 'approved' && me.role === 'surveyor') {
      clientError('LOCKED', 'Survey is locked');
    }

    const normalized = normalizeFloorFields({
      usageFactor: args.usageFactor,
      usageType: args.usageType,
    });

    const floorErrors = validateFloorRow({
      floorName: args.floorName,
      usageFactor: normalized.usageFactor || undefined,
      usageType: normalized.usageType,
      constructionType: args.constructionType,
      areaSqft: args.areaSqft,
    });
    if (Object.keys(floorErrors).length > 0) {
      clientError('VALIDATION', 'Invalid floor row', floorErrors);
    }
    const isOccupied = usageTypeToOccupied(normalized.usageType);

    const existing = await ctx.db
      .query('floors')
      .withIndex('by_survey_clientFloorId', (q) =>
        q.eq('surveyId', args.surveyId).eq('clientFloorId', args.clientFloorId),
      )
      .unique();

    const row = {
      position: args.position,
      floorName: args.floorName,
      usageFactor: normalized.usageFactor || undefined,
      usageType: normalized.usageType,
      constructionType: args.constructionType,
      isOccupied,
      areaSqft: args.areaSqft,
    };

    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    const id = await ctx.db.insert('floors', {
      surveyId: args.surveyId,
      clientFloorId: args.clientFloorId,
      ...row,
    });
    await writeAudit(ctx, {
      actorId: me._id,
      action: 'floor.added',
      entity: 'survey',
      entityId: args.surveyId,
      metadata: { clientFloorId: args.clientFloorId },
    });
    return id;
  },
});

/** Drop server floor rows whose client ids are no longer in the local draft. */
export const removeOrphans = mutation({
  args: {
    surveyId: v.id('surveys'),
    keepClientFloorIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const survey = await ctx.db.get(args.surveyId);
    if (!survey) clientError('NOT_FOUND', 'Survey not found');
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    if (survey.qcStatus === 'approved' && me.role === 'surveyor') {
      clientError('LOCKED', 'Survey is locked');
    }
    const keep = new Set(args.keepClientFloorIds);
    const rows = await ctx.db
      .query('floors')
      .withIndex('by_survey', (q) => q.eq('surveyId', args.surveyId))
      .collect();
    for (const row of rows) {
      if (!keep.has(row.clientFloorId)) {
        await ctx.db.delete(row._id);
      }
    }
  },
});

export const remove = mutation({
  args: { id: v.id('floors') },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const floor = await ctx.db.get(args.id);
    if (!floor) return;
    const survey = await ctx.db.get(floor.surveyId);
    if (!survey) return;
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    if (survey.qcStatus === 'approved' && me.role === 'surveyor') {
      clientError('LOCKED', 'Survey is locked');
    }
    await ctx.db.delete(args.id);
  },
});

/**
 * Bulk reorder — used by drag-and-drop on the floors editor. Skips the
 * audit entry since per-floor mutations would create noise.
 */
export const reorder = mutation({
  args: {
    surveyId: v.id('surveys'),
    order: v.array(v.object({ id: v.id('floors'), position: v.number() })),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const survey = await ctx.db.get(args.surveyId);
    if (!survey) clientError('NOT_FOUND', 'Survey not found');
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    for (const o of args.order) {
      const f = await ctx.db.get(o.id);
      if (!f || f.surveyId !== args.surveyId) continue;
      await ctx.db.patch(o.id, { position: o.position });
    }
  },
});
