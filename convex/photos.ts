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
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { hasCapability, type PermissionCache } from "./capabilities";
import { assertCanAccessSurvey } from "./fieldAccess";
import { clientError, requireUser, writeAudit } from "./helpers";
import { photoSlot } from "./schema";
import { assertSurveyWritable } from "./surveyEditRules";

async function deleteStorageIfPresent(ctx: MutationCtx, storageId: Id<"_storage">): Promise<void> {
  try {
    await ctx.storage.delete(storageId);
  } catch {
    // blob may already be deleted
  }
}

/** Returns a one-time upload URL. Valid for ~1 hour by Convex defaults. */
export const generateUploadUrl = mutation({
  args: { surveyId: v.id("surveys") },
  handler: async (ctx, args) => {
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.surveyId)]);
    if (!survey) clientError("NOT_FOUND", "Survey not found");
    await assertCanAccessSurvey(ctx, me, survey);
    const canUpload =
      (await hasCapability(ctx, me, "surveys.uploadPhotos")) || (await hasCapability(ctx, me, "qc.review"));
    if (!canUpload) clientError("FORBIDDEN", "You don't have permission to upload photos");
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
    surveyId: v.id("surveys"),
    slot: photoSlot,
    storageId: v.id("_storage"),
    sizeKb: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    capturedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.surveyId)]);
    if (!survey) {
      await deleteStorageIfPresent(ctx, args.storageId);
      clientError("NOT_FOUND", "Survey not found");
    }
    await assertCanAccessSurvey(ctx, me, survey);
    try {
      await assertSurveyWritable(ctx, me, survey);
    } catch {
      await deleteStorageIfPresent(ctx, args.storageId);
      clientError("LOCKED", "Survey is locked — you cannot upload photos in its current state");
    }
    const canUpload =
      (await hasCapability(ctx, me, "surveys.uploadPhotos")) || (await hasCapability(ctx, me, "qc.review"));
    if (!canUpload) {
      await deleteStorageIfPresent(ctx, args.storageId);
      clientError("FORBIDDEN", "You don't have permission to upload photos");
    }
    if (args.sizeKb <= 0 || args.sizeKb > 1024) {
      await deleteStorageIfPresent(ctx, args.storageId);
      clientError("VALIDATION", "Photo size out of range (≤ 1 MB)");
    }

    // Replace existing photo in the same slot (one slot = one photo).
    // If the blob is unchanged (save draft / submit re-sync), keep storage intact.
    const existing = await ctx.db
      .query("photos")
      .withIndex("by_survey_slot", (q) => q.eq("surveyId", args.surveyId).eq("slot", args.slot))
      .unique();
    if (existing) {
      if (existing.storageId === args.storageId) {
        return existing._id;
      }
      await deleteStorageIfPresent(ctx, existing.storageId);
      await ctx.db.delete(existing._id);
    }

    const id = await ctx.db.insert("photos", {
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
      action: "photo.uploaded",
      entity: "survey",
      entityId: args.surveyId,
      metadata: { slot: args.slot, sizeKb: args.sizeKb },
    });
    return id;
  },
});

/** Signed preview URLs — only for blobs linked to accessible surveys (or unlinked draft blobs with survey context). */
export const resolveStorageUrls = query({
  args: {
    storageIds: v.array(v.id("_storage")),
    surveyId: v.optional(v.id("surveys")),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (me.role === "pending") return [];

    let draftSurvey: Doc<"surveys"> | null = null;
    if (args.surveyId) {
      const survey = await ctx.db.get(args.surveyId);
      if (!survey) return args.storageIds.map((storageId) => ({ storageId, url: null }));
      await assertCanAccessSurvey(ctx, me, survey);
      draftSurvey = survey;
    }

    const unique = [...new Set(args.storageIds)];
    return Promise.all(
      unique.map(async (storageId) => {
        const photo = await ctx.db
          .query("photos")
          .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
          .first();

        if (photo) {
          const survey = await ctx.db.get(photo.surveyId);
          if (!survey) return { storageId, url: null };
          try {
            await assertCanAccessSurvey(ctx, me, survey);
          } catch {
            return { storageId, url: null };
          }
          return { storageId, url: await ctx.storage.getUrl(storageId) };
        }

        if (!draftSurvey) return { storageId, url: null };
        const canUpload =
          (await hasCapability(ctx, me, "surveys.uploadPhotos")) || (await hasCapability(ctx, me, "qc.review"));
        if (!canUpload) return { storageId, url: null };
        return { storageId, url: await ctx.storage.getUrl(storageId) };
      }),
    );
  },
});

/**
 * Remove a blob and any photo row pointing at it (draft or saved survey).
 * Used when the surveyor deletes or replaces a photo on review.
 */
export const releaseStorage = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (me.role === "pending") clientError("FORBIDDEN", "Not allowed");

    const rows = await ctx.db
      .query("photos")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .collect();

    await Promise.all(
      rows.map(async (row) => {
        const survey = await ctx.db.get(row.surveyId);
        if (!survey) {
          await ctx.db.delete(row._id);
          return;
        }
        await assertCanAccessSurvey(ctx, me, survey);
        if (survey.qcStatus === "approved" && me.role === "surveyor") {
          clientError("LOCKED", "Survey is locked");
        }
        await ctx.db.delete(row._id);
      }),
    );

    await deleteStorageIfPresent(ctx, args.storageId);

    await writeAudit(ctx, {
      actorId: me._id,
      action: "photo.released",
      entity: "storage",
      entityId: args.storageId,
    });
  },
});

export const removeBySurveySlot = mutation({
  args: {
    surveyId: v.id("surveys"),
    slot: photoSlot,
  },
  handler: async (ctx, args) => {
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.surveyId)]);
    if (!survey) return;
    await assertCanAccessSurvey(ctx, me, survey);
    if (survey.qcStatus === "approved" && me.role === "surveyor") {
      clientError("LOCKED", "Survey is locked");
    }

    const existing = await ctx.db
      .query("photos")
      .withIndex("by_survey_slot", (q) => q.eq("surveyId", args.surveyId).eq("slot", args.slot))
      .unique();
    if (!existing) return;

    await deleteStorageIfPresent(ctx, existing.storageId);
    await Promise.all([
      ctx.db.delete(existing._id),
      writeAudit(ctx, {
        actorId: me._id,
        action: "photo.removed",
        entity: "survey",
        entityId: args.surveyId,
        metadata: { slot: args.slot },
      }),
    ]);
  },
});

/** Front + side photo URLs for demand notice export (batch, max 200 ids per call). */
export const noticePhotoUrls = query({
  args: { surveyIds: v.array(v.id("surveys")) },
  returns: v.record(
    v.string(),
    v.object({
      front: v.union(v.string(), v.null()),
      side: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (me.role === "pending") return {};

    const ids = args.surveyIds.slice(0, 200);
    const entries = await Promise.all(
      ids.map(async (surveyId) => {
        const survey = await ctx.db.get(surveyId);
        if (!survey) {
          return [surveyId, { front: null, side: null }] as const;
        }
        try {
          await assertCanAccessSurvey(ctx, me, survey);
        } catch {
          return [surveyId, { front: null, side: null }] as const;
        }

        const [front, side] = await Promise.all(
          (["front", "side"] as const).map((slot) =>
            ctx.db
              .query("photos")
              .withIndex("by_survey_slot", (q) => q.eq("surveyId", surveyId).eq("slot", slot))
              .unique(),
          ),
        );

        return [
          surveyId,
          {
            front: front ? await ctx.storage.getUrl(front.storageId) : null,
            side: side ? await ctx.storage.getUrl(side.storageId) : null,
          },
        ] as const;
      }),
    );

    return Object.fromEntries(entries);
  },
});

/** Front-photo preview URLs for survey list tables (batch, max 50 ids). */
export const frontThumbnails = query({
  args: { surveyIds: v.array(v.id("surveys")) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (me.role === "pending") return {};

    const permCache: PermissionCache = new Map();
    const ids = args.surveyIds.slice(0, 50);
    const surveys = await Promise.all(ids.map((surveyId) => ctx.db.get(surveyId)));

    const photoRows = await Promise.all(
      ids.map(async (surveyId, index) => {
        const survey = surveys[index];
        if (!survey) {
          return [surveyId, null] as const;
        }
        try {
          await assertCanAccessSurvey(ctx, me, survey, permCache);
        } catch {
          return [surveyId, null] as const;
        }

        const front = await ctx.db
          .query("photos")
          .withIndex("by_survey_slot", (q) => q.eq("surveyId", surveyId).eq("slot", "front"))
          .unique();
        return [surveyId, front ? await ctx.storage.getUrl(front.storageId) : null] as const;
      }),
    );

    return Object.fromEntries(photoRows);
  },
});

export const list = query({
  args: { surveyId: v.id("surveys") },
  handler: async (ctx, args) => {
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.surveyId)]);
    if (!survey) return [];
    await assertCanAccessSurvey(ctx, me, survey);

    const rows = await ctx.db
      .query("photos")
      .withIndex("by_survey", (q) => q.eq("surveyId", args.surveyId))
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
  args: { id: v.id("photos") },
  handler: async (ctx, args) => {
    const [me, photo] = await Promise.all([requireUser(ctx), ctx.db.get(args.id)]);
    if (!photo) return;
    const survey = await ctx.db.get(photo.surveyId);
    if (!survey) return;
    await assertCanAccessSurvey(ctx, me, survey);
    if (survey.qcStatus === "approved" && me.role === "surveyor") {
      clientError("LOCKED", "Survey is locked");
    }
    await deleteStorageIfPresent(ctx, photo.storageId);
    await ctx.db.delete(args.id);
  },
});
