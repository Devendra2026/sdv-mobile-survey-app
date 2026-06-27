/**
 * Backfill survey aggregate buckets from existing survey rows (one-time / repair).
 */
import { internalMutation } from './_generated/server';
import { syncSurveyAggregates } from './lib/surveyAggregates';

export const backfillSurveyAggregates = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingBuckets = await ctx.db.query('surveyAggregateBuckets').collect();
    for (const b of existingBuckets) {
      await ctx.db.delete(b._id);
    }
    const existingDaily = await ctx.db.query('surveyDailyRollups').collect();
    for (const d of existingDaily) {
      await ctx.db.delete(d._id);
    }

    const surveys = await ctx.db.query('surveys').collect();
    for (const survey of surveys) {
      await syncSurveyAggregates(ctx, null, survey);
    }

    return { surveysProcessed: surveys.length };
  },
});
