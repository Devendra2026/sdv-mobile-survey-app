import type { Doc, Id } from "../_generated/dataModel";
import { padParcelNo, padWardNo, resolvePropertyId } from "../propertyId";

type SearchableSurvey = Pick<
  Doc<"surveys">,
  | "propertyId"
  | "municipalityId"
  | "wardNo"
  | "parcelNo"
  | "unitNo"
  | "propertyUse"
  | "respondentName"
  | "mobileNo"
  | "owners"
>;

function formatRegistryWardNo(wardNo?: string): string {
  const raw = wardNo?.trim();
  if (!raw) return "";
  return padWardNo(raw) || raw;
}

function formatRegistryParcelNo(parcelNo?: string): string {
  const raw = parcelNo?.trim();
  if (!raw) return "";
  return padParcelNo(raw) || raw;
}

type SearchableWithSurveyor = SearchableSurvey & { surveyorName?: string };

/** Text match for registry / survey list search (property ID, owner, parcel, ward, mobile, surveyor). */
export function matchesSurveySearch(row: SearchableWithSurveyor, term: string, muniCode: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;

  const displayId = resolvePropertyId(row, muniCode);
  const wardVariants = [
    row.wardNo,
    formatRegistryWardNo(row.wardNo),
    row.wardNo ? `ward ${row.wardNo}` : undefined,
    row.wardNo ? `w${row.wardNo}` : undefined,
  ];

  const values: string[] = [];
  for (const v of [
    displayId,
    row.propertyId,
    row.respondentName,
    row.mobileNo,
    row.parcelNo,
    formatRegistryParcelNo(row.parcelNo),
    ...wardVariants,
    ...(row.owners?.map((o) => o.name) ?? []),
    row.surveyorName,
  ]) {
    if (v) values.push(String(v).toLowerCase());
  }

  return values.some((v) => v.includes(q));
}

export function filterSurveysBySearch<T extends SearchableWithSurveyor>(
  rows: T[],
  term: string | undefined,
  codes: Map<Id<"municipalities">, string>,
): T[] {
  const q = term?.trim();
  if (!q) return rows;
  return rows.filter((row) => matchesSurveySearch(row, q, codes.get(row.municipalityId) ?? ""));
}
