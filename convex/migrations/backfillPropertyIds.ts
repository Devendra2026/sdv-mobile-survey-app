import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { resolvePropertyId } from "../propertyId";

const BATCH_SIZE = 100;

/**
 * Recompute stored Property IDs to the unit-inclusive format.
 * Run once: `npx convex run migrations/backfillPropertyIds:run`
 */
export const run = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    patched: v.optional(v.number()),
  },
  returns: v.object({
    done: v.boolean(),
    patched: v.number(),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    let patched = args.patched ?? 0;
    const page = await ctx.db.query("surveys").paginate({
      numItems: BATCH_SIZE,
      cursor: args.cursor ?? null,
    });

    const municipalityIds = [...new Set(page.page.map((row) => row.municipalityId))];
    const munis = await Promise.all(municipalityIds.map((id) => ctx.db.get(id)));
    const codes = new Map(municipalityIds.map((id, i) => [id, munis[i]?.code ?? ""] as const));

    for (const row of page.page) {
      const ulbCode = codes.get(row.municipalityId) ?? "";
      const nextId = resolvePropertyId(row, ulbCode);
      if (!nextId || nextId === row.propertyId) continue;
      await ctx.db.patch(row._id, { propertyId: nextId });
      patched++;
    }

    if (page.isDone) {
      return { done: true, patched, cursor: null };
    }

    await ctx.scheduler.runAfter(0, internal.migrations.backfillPropertyIds.run, {
      cursor: page.continueCursor,
      patched,
    });

    return { done: false, patched, cursor: page.continueCursor };
  },
});
