import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isNewPropertyIdFormat } from "../propertyId";

/** Derive pre-unit Property ID from the new format for legacy index lookups. */
export function legacyPropertyIdFromNew(propertyId: string): string | undefined {
  const parts = propertyId.trim().toUpperCase().split("-");
  if (parts.length !== 5) return undefined;
  return `${parts[0]}-${parts[1]}-${parts[2]}-${parts[4]}`;
}

/** Match surveys stored under new or legacy Property ID strings. */
export async function lookupSurveyByPropertyId(
  ctx: QueryCtx | MutationCtx,
  propertyId: string,
): Promise<Doc<"surveys"> | null> {
  const pid = propertyId.trim().toUpperCase();
  if (!pid) return null;

  const direct = await ctx.db
    .query("surveys")
    .withIndex("by_property_id", (q) => q.eq("propertyId", pid))
    .first();
  if (direct) return direct;

  if (isNewPropertyIdFormat(pid)) {
    const legacy = legacyPropertyIdFromNew(pid);
    if (legacy) {
      return (
        (await ctx.db
          .query("surveys")
          .withIndex("by_property_id", (q) => q.eq("propertyId", legacy))
          .first()) ?? null
      );
    }
  }

  return null;
}
