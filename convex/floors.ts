/**
 * Floors live in their own table because they're 1:N to a survey and the
 * client can add/remove/reorder them independently of the parent rows.
 *
 * Idempotency: `clientFloorId` is the key. The mobile generates it once
 * and resends on every save — duplicate sends update in place.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  normalizeFloorFields,
  plinthSqftFromFloors,
  presentFloorRow,
  usageTypeToOccupied,
  validateFloorRow,
} from "./areaMasters";
import { assertCanAccessSurvey } from "./fieldAccess";
import { assertCanReadWard, clientError, requireUser, writeAudit } from "./helpers";

/** Matches max QC table page size (`QC_TABLE_PAGE_SIZE_OPTIONS`). */
const MAX_SURVEYS_PER_FLOOR_LIST = 5000;

const floorRowValidator = v.object({
  _id: v.id("floors"),
  _creationTime: v.number(),
  surveyId: v.id("surveys"),
  clientFloorId: v.string(),
  position: v.number(),
  floorName: v.string(),
  usageFactor: v.optional(v.string()),
  usageType: v.string(),
  constructionType: v.string(),
  isOccupied: v.boolean(),
  areaSqft: v.number(),
});

export const list = query({
  args: { surveyId: v.id("surveys") },
  returns: v.array(floorRowValidator),
  handler: async (ctx, args) => {
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.surveyId)]);
    if (!survey) return [];
    await assertCanAccessSurvey(ctx, me, survey);
    const rows = await ctx.db
      .query("floors")
      .withIndex("by_survey", (q) => q.eq("surveyId", args.surveyId))
      .collect();
    return rows.sort((a, b) => a.position - b.position).map(presentFloorRow);
  },
});

export const listForSurveys = query({
  args: {
    surveyIds: v.array(v.id("surveys")),
  },
  returns: v.array(
    v.object({
      surveyId: v.id("surveys"),
      floors: v.array(floorRowValidator),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.surveyIds.length > MAX_SURVEYS_PER_FLOOR_LIST) {
      clientError("VALIDATION", `A maximum of ${MAX_SURVEYS_PER_FLOOR_LIST} surveys can be requested at once`);
    }
    const me = await requireUser(ctx);
    const uniqueSurveyIds = [...new Set(args.surveyIds)];
    const grouped = await Promise.all(
      uniqueSurveyIds.map(async (surveyId) => {
        const survey = await ctx.db.get(surveyId);
        if (!survey) {
          return { surveyId, floors: [] };
        }
        try {
          await assertCanAccessSurvey(ctx, me, survey);
        } catch {
          return { surveyId, floors: [] };
        }
        const rows = await ctx.db
          .query("floors")
          .withIndex("by_survey", (q) => q.eq("surveyId", surveyId))
          .collect();
        return {
          surveyId,
          floors: rows.sort((a, b) => a.position - b.position).map(presentFloorRow),
        };
      }),
    );

    return grouped;
  },
});

export const upsert = mutation({
  args: {
    surveyId: v.id("surveys"),
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
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.surveyId)]);
    if (!survey) clientError("NOT_FOUND", "Survey not found");
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    if (survey.qcStatus === "approved" && me.role === "surveyor") {
      clientError("LOCKED", "Survey is locked");
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
      clientError("VALIDATION", "Invalid floor row", floorErrors);
    }
    const isOccupied = usageTypeToOccupied(normalized.usageType);

    const existing = await ctx.db
      .query("floors")
      .withIndex("by_survey_clientFloorId", (q) =>
        q.eq("surveyId", args.surveyId).eq("clientFloorId", args.clientFloorId),
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

    let floorId = existing?._id;
    if (existing) {
      await ctx.db.patch(existing._id, row);
    } else {
      floorId = await ctx.db.insert("floors", {
        surveyId: args.surveyId,
        clientFloorId: args.clientFloorId,
        ...row,
      });
      await writeAudit(ctx, {
        actorId: me._id,
        action: "floor.added",
        entity: "survey",
        entityId: args.surveyId,
        metadata: { clientFloorId: args.clientFloorId },
      });
    }

    const floorRows = await ctx.db
      .query("floors")
      .withIndex("by_survey", (q) => q.eq("surveyId", args.surveyId))
      .collect();
    await ctx.db.patch(args.surveyId, {
      plinthSqft: plinthSqftFromFloors(floorRows),
      serverVersion: survey.serverVersion + 1,
    });

    return floorId!;
  },
});

/** Drop server floor rows whose client ids are no longer in the local draft. */
export const removeOrphans = mutation({
  args: {
    surveyId: v.id("surveys"),
    keepClientFloorIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.surveyId)]);
    if (!survey) clientError("NOT_FOUND", "Survey not found");
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    if (survey.qcStatus === "approved" && me.role === "surveyor") {
      clientError("LOCKED", "Survey is locked");
    }
    const keep = new Set(args.keepClientFloorIds);
    const rows = await ctx.db
      .query("floors")
      .withIndex("by_survey", (q) => q.eq("surveyId", args.surveyId))
      .collect();
    const deleteOps = [];
    for (const row of rows) {
      if (!keep.has(row.clientFloorId)) deleteOps.push(ctx.db.delete(row._id));
    }
    await Promise.all(deleteOps);
  },
});

export const remove = mutation({
  args: { id: v.id("floors") },
  handler: async (ctx, args) => {
    const [me, floor] = await Promise.all([requireUser(ctx), ctx.db.get(args.id)]);
    if (!floor) return;
    const survey = await ctx.db.get(floor.surveyId);
    if (!survey) return;
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    if (survey.qcStatus === "approved" && me.role === "surveyor") {
      clientError("LOCKED", "Survey is locked");
    }
    await ctx.db.delete(args.id);
    const floorRows = await ctx.db
      .query("floors")
      .withIndex("by_survey", (q) => q.eq("surveyId", floor.surveyId))
      .collect();
    await ctx.db.patch(floor.surveyId, {
      plinthSqft: plinthSqftFromFloors(floorRows),
      serverVersion: survey.serverVersion + 1,
    });
  },
});

/**
 * Bulk reorder — used by drag-and-drop on the floors editor. Skips the
 * audit entry since per-floor mutations would create noise.
 */
export const reorder = mutation({
  args: {
    surveyId: v.id("surveys"),
    order: v.array(v.object({ id: v.id("floors"), position: v.number() })),
  },
  handler: async (ctx, args) => {
    const [me, survey] = await Promise.all([requireUser(ctx), ctx.db.get(args.surveyId)]);
    if (!survey) clientError("NOT_FOUND", "Survey not found");
    assertCanReadWard(me, survey.municipalityId, survey.wardNo);
    await Promise.all(
      args.order.map(async (o) => {
        const f = await ctx.db.get(o.id);
        if (!f || f.surveyId !== args.surveyId) return;
        await ctx.db.patch(o.id, { position: o.position });
      }),
    );
  },
});
