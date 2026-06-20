import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { clientError } from "../helpers";
import { normalizeParcelKey, padUnitNo, resolvePropertyId } from "../propertyId";

function wardNumbersMatch(rowWard: string, filterWard: string): boolean {
  if (rowWard === filterWard) return true;
  const a = Number(rowWard);
  const b = Number(filterWard);
  return !Number.isNaN(a) && !Number.isNaN(b) && a === b;
}

/** True when a draft save would change ward / parcel / unit / use / resolved Property ID. */
export function surveyIdentifyingSlotChanged(
  existing: Doc<"surveys">,
  normalized: {
    wardNo?: string;
    parcelNo?: string;
    unitNo?: string;
    propertyUse?: string;
    propertyId?: string;
  },
  ulbCode: string,
): boolean {
  const ward = (normalized.wardNo ?? existing.wardNo).trim();
  const parcel = normalized.parcelNo ?? existing.parcelNo;
  const unit = (normalized.unitNo ?? existing.unitNo).trim();
  const use = (normalized.propertyUse ?? existing.propertyUse ?? "").trim();

  if (!wardNumbersMatch(ward, existing.wardNo)) return true;
  if (normalizeParcelKey(parcel) !== normalizeParcelKey(existing.parcelNo)) return true;
  const unitKey = padUnitNo(unit) || unit;
  const existingUnitKey = padUnitNo(existing.unitNo) || existing.unitNo.trim();
  if (unitKey !== existingUnitKey) return true;
  if (use !== (existing.propertyUse ?? "").trim()) return true;

  const beforeId = resolvePropertyId(existing, ulbCode);
  const afterId = resolvePropertyId(
    { propertyId: normalized.propertyId, wardNo: ward, parcelNo: parcel, unitNo: unit, propertyUse: use },
    ulbCode,
  );
  return beforeId !== afterId;
}

/** Reject duplicate Property IDs and duplicate ward + parcel + use + unit slots. */
export async function assertUniqueSurveySlot(
  ctx: MutationCtx,
  input: {
    municipalityId: Id<"municipalities">;
    wardNo: string;
    parcelNo: string;
    propertyUse?: string;
    unitNo?: string;
    propertyId?: string;
    excludeId?: Id<"surveys">;
  },
): Promise<void> {
  const propertyId = input.propertyId?.trim().toUpperCase();
  if (propertyId) {
    const matches = await ctx.db
      .query("surveys")
      .withIndex("by_property_id", (q) => q.eq("propertyId", propertyId))
      .collect();
    const byPropertyId = matches.find((row) => row._id !== input.excludeId);
    if (byPropertyId) {
      clientError("CONFLICT", `A survey with this Property ID already exists (survey ${byPropertyId._id})`, {
        propertyId: [`duplicate property ID — conflicts with survey ${byPropertyId._id}`],
        conflictingSurveyId: [byPropertyId._id],
      });
    }
  }

  const parcelKey = normalizeParcelKey(input.parcelNo);
  const unitKey = padUnitNo(input.unitNo ?? "") || (input.unitNo ?? "").trim();
  const useKey = (input.propertyUse ?? "").trim();

  const wardVariants = new Set([input.wardNo.trim()]);
  const wardNum = Number(input.wardNo);
  if (!Number.isNaN(wardNum)) {
    wardVariants.add(String(wardNum));
    wardVariants.add(String(wardNum).padStart(2, "0"));
  }

  const wardRows: Doc<"surveys">[] = [];
  const batches = await Promise.all(
    [...wardVariants].map((ward) =>
      ctx.db
        .query("surveys")
        .withIndex("by_municipality_ward", (q) => q.eq("municipalityId", input.municipalityId).eq("wardNo", ward))
        .collect(),
    ),
  );
  for (const batch of batches) {
    for (const row of batch) {
      if (!wardRows.some((existing) => existing._id === row._id)) wardRows.push(row);
    }
  }

  for (const row of wardRows) {
    if (row._id === input.excludeId) continue;
    if (!wardNumbersMatch(row.wardNo, input.wardNo)) continue;
    if (normalizeParcelKey(row.parcelNo) !== parcelKey) continue;
    if ((row.propertyUse ?? "").trim() !== useKey) continue;
    const rowUnitKey = padUnitNo(row.unitNo ?? "") || (row.unitNo ?? "").trim();
    if (rowUnitKey !== unitKey) continue;
    clientError(
      "CONFLICT",
      `A survey already exists for this ward, parcel, unit, and property use (survey ${row._id})`,
      {
        parcelNo: ["duplicate parcel in this ward"],
        unitNo: ["duplicate unit for this parcel"],
        propertyUse: ["duplicate property use for this parcel"],
        conflictingSurveyId: [row._id],
      },
    );
  }
}

export type SurveySlotInput = Pick<
  Doc<"surveys">,
  "municipalityId" | "wardNo" | "parcelNo" | "propertyUse" | "unitNo" | "propertyId"
>;
