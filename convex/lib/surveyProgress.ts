import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Rough completion % for list rows (mirrors client `lib/survey/progress.ts`). */
export function computeSurveyCompletionPercent(input: {
  propertyId?: string;
  wardNo?: string;
  parcelNo?: string;
  respondentName?: string;
  mobileNo?: string;
  locality?: string;
  ownershipType?: string;
  propertyUse?: string;
  plotSqft?: number;
  gps?: unknown;
  floors?: unknown[];
  photos?: unknown[];
}): number {
  const checks = [
    !!input.propertyId?.trim(),
    !!input.wardNo?.trim(),
    !!input.parcelNo?.trim(),
    !!input.respondentName?.trim(),
    !!input.mobileNo?.trim(),
    !!input.locality?.trim(),
    !!input.ownershipType?.trim(),
    !!input.propertyUse?.trim(),
    (input.plotSqft ?? 0) > 0,
    (input.floors?.length ?? 0) > 0,
    !!input.gps,
    (input.photos?.length ?? 0) >= 1,
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

export async function completionPctForSurvey(ctx: MutationCtx, survey: Doc<"surveys">): Promise<number> {
  const [floors, photos] = await Promise.all([
    ctx.db
      .query("floors")
      .withIndex("by_survey", (q) => q.eq("surveyId", survey._id))
      .collect(),
    ctx.db
      .query("photos")
      .withIndex("by_survey", (q) => q.eq("surveyId", survey._id))
      .collect(),
  ]);
  return computeSurveyCompletionPercent({
    ...survey,
    floors,
    photos,
  });
}

export async function refreshSurveyCompletionPct(ctx: MutationCtx, surveyId: Id<"surveys">): Promise<void> {
  const survey = await ctx.db.get("surveys", surveyId);
  if (!survey) return;
  const pct = await completionPctForSurvey(ctx, survey);
  await ctx.db.patch(surveyId, { completionPct: pct });
}
