/**
 * Photo upload flow with Convex storage.
 *
 *  1. mobile: `generateUploadUrl` → returns a short-lived signed POST URL
 *  2. mobile: POSTs the compressed image bytes to that URL → gets a storageId back
 *  3. mobile: `linkPhoto({ surveyId, slot, storageId, ... })` → registers it
 *
 * Storage cleanup: deleting a photo also removes the underlying blob.
 * Convex garbage-collects orphaned blobs lazily; we delete proactively
 * to avoid stale references.
 */
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { assertCanReadWard, clientError, requireUser, writeAudit } from './helpers';
import { photoSlot } from './schema';

/** Returns a one-time upload URL. Valid for ~1 hour by Convex defaults. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    if (me.role === 'pending') clientError('FORBIDDEN', 'Not allowed');
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Link an already-uploaded blob to a survey. Strictly enforces:
 *  - the storage id exists
 *  - the survey is owned by / readable by the caller
 *  - size is sane (≤ 1 MB after the mobile's compression)
 *  - one photo per slot — re-linking the same slot replaces the previous photo
 */
export const linkPhoto = mutation({
  args: {
    surveyId: v.id('surveys'),
    slot: photoSlot,
    storageId: v.id('_storage'),
    sizeKb: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    capturedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const survey = await ctx.db.get(args.surveyId);
    if (!survey) {
      await ctx.storage.delete(args.storageId);
      clientError('NOT_FOUND', 'Survey not found');
    }
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    if (survey.qcStatus === 'approved' && me.role === 'surveyor') {
      await ctx.storage.delete(args.storageId);
      clientError('LOCKED', 'Survey is locked');
    }
    if (args.sizeKb <= 0 || args.sizeKb > 1024) {
      await ctx.storage.delete(args.storageId);
      clientError('VALIDATION', 'Photo size out of range (≤ 1 MB)');
    }

    // Replace existing photo in the same slot (one slot = one photo).
    // If the blob is unchanged (save draft / submit re-sync), keep storage intact.
    const existing = await ctx.db
      .query('photos')
      .withIndex('by_survey_slot', (q) => q.eq('surveyId', args.surveyId).eq('slot', args.slot))
      .unique();
    if (existing) {
      if (existing.storageId === args.storageId) {
        return existing._id;
      }
      await ctx.storage.delete(existing.storageId);
      await ctx.db.delete(existing._id);
    }

    const id = await ctx.db.insert('photos', {
      surveyId: args.surveyId,
      slot: args.slot,
      storageId: args.storageId,
      sizeKb: args.sizeKb,
      width: args.width,
      height: args.height,
      capturedAt: args.capturedAt,
      uploadedBy: me._id,
    });

    await writeAudit(ctx, {
      actorId: me._id,
      action: 'photo.uploaded',
      entity: 'survey',
      entityId: args.surveyId,
      metadata: { slot: args.slot, sizeKb: args.sizeKb },
    });
    return id;
  },
});

/** Signed preview URLs for wizard/review (storage ids from the caller's uploads). */
export const resolveStorageUrls = query({
  args: { storageIds: v.array(v.id('_storage')) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (me.role === 'pending') return [];

    const unique = [...new Set(args.storageIds)];
    const out: Array<{ storageId: (typeof unique)[number]; url: string | null }> = [];
    for (const storageId of unique) {
      out.push({ storageId, url: await ctx.storage.getUrl(storageId) });
    }
    return out;
  },
});

/**
 * Remove a blob and any photo row pointing at it (draft or saved survey).
 * Used when the surveyor deletes or replaces a photo on review.
 */
export const releaseStorage = mutation({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (me.role === 'pending') clientError('FORBIDDEN', 'Not allowed');

    const rows = await ctx.db
      .query('photos')
      .filter((q) => q.eq(q.field('storageId'), args.storageId))
      .collect();

    for (const row of rows) {
      const survey = await ctx.db.get(row.surveyId);
      if (!survey) {
        await ctx.db.delete(row._id);
        continue;
      }
      assertCanReadWard(me, survey.municipalityId, survey.wardNo);
      if (survey.qcStatus === 'approved' && me.role === 'surveyor') {
        clientError('LOCKED', 'Survey is locked');
      }
      await ctx.db.delete(row._id);
    }

    try {
      await ctx.storage.delete(args.storageId);
    } catch {
      // blob may already be deleted
    }

    await writeAudit(ctx, {
      actorId: me._id,
      action: 'photo.released',
      entity: 'storage',
      entityId: args.storageId,
    });
  },
});

export const removeBySurveySlot = mutation({
  args: {
    surveyId: v.id('surveys'),
    slot: photoSlot,
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const survey = await ctx.db.get(args.surveyId);
    if (!survey) return;
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    if (survey.qcStatus === 'approved' && me.role === 'surveyor') {
      clientError('LOCKED', 'Survey is locked');
    }

    const existing = await ctx.db
      .query('photos')
      .withIndex('by_survey_slot', (q) => q.eq('surveyId', args.surveyId).eq('slot', args.slot))
      .unique();
    if (!existing) return;

    await ctx.storage.delete(existing.storageId);
    await ctx.db.delete(existing._id);
    await writeAudit(ctx, {
      actorId: me._id,
      action: 'photo.removed',
      entity: 'survey',
      entityId: args.surveyId,
      metadata: { slot: args.slot },
    });
  },
});

export const list = query({
  args: { surveyId: v.id('surveys') },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const survey = await ctx.db.get(args.surveyId);
    if (!survey) return [];
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);

    const rows = await ctx.db
      .query('photos')
      .withIndex('by_survey', (q) => q.eq('surveyId', args.surveyId))
      .collect();
    return await Promise.all(
      rows.map(async (p) => ({
        ...p,
        url: await ctx.storage.getUrl(p.storageId),
      })),
    );
  },
});

export const remove = mutation({
  args: { id: v.id('photos') },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const photo = await ctx.db.get(args.id);
    if (!photo) return;
    const survey = await ctx.db.get(photo.surveyId);
    if (!survey) return;
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    if (survey.qcStatus === 'approved' && me.role === 'surveyor') {
      clientError('LOCKED', 'Survey is locked');
    }
    await ctx.storage.delete(photo.storageId);
    await ctx.db.delete(args.id);
  },
});
