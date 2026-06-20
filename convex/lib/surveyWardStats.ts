import type { Doc, Id } from "../_generated/dataModel";

export type SurveyWardAggregate = {
  wardNo: string;
  municipalityId: Id<"municipalities">;
  city: string;
  total: number;
  drafts: number;
  submitted: number;
  qcApproved: number;
  activeSurveyorIds: Id<"users">[];
};

/** Normalize ward numbers so "01" and "1" aggregate together. */
export function normalizeWardNo(wardNo: string): string {
  const n = Number.parseInt(wardNo, 10);
  return Number.isNaN(n) ? wardNo : String(n);
}

function wardGroupKey(municipalityId: Id<"municipalities">, wardNo: string): string {
  return `${municipalityId}:${normalizeWardNo(wardNo)}`;
}

/** Aggregate field-survey counts per ward from the full scoped survey set. */
export function computeSurveyWardAggregates(rows: Doc<"surveys">[]): SurveyWardAggregate[] {
  const byKey = new Map<string, SurveyWardAggregate>();
  const surveyorsByKey = new Map<string, Set<Id<"users">>>();

  for (const row of rows) {
    if (!row.wardNo?.trim()) continue;

    const key = wardGroupKey(row.municipalityId, row.wardNo);
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        wardNo: normalizeWardNo(row.wardNo),
        municipalityId: row.municipalityId,
        city: row.city,
        total: 0,
        drafts: 0,
        submitted: 0,
        qcApproved: 0,
        activeSurveyorIds: [],
      };
      byKey.set(key, entry);
      surveyorsByKey.set(key, new Set());
    }

    entry.total += 1;
    if (row.status === "draft") entry.drafts += 1;
    if (row.status === "submitted") entry.submitted += 1;
    if (row.qcStatus === "approved") entry.qcApproved += 1;

    if (row.status === "draft" || row.status === "submitted") {
      surveyorsByKey.get(key)!.add(row.surveyorId);
    }
  }

  for (const entry of byKey.values()) {
    const key = wardGroupKey(entry.municipalityId, entry.wardNo);
    entry.activeSurveyorIds = [...(surveyorsByKey.get(key) ?? [])];
  }

  return Array.from(byKey.values()).toSorted((a, b) => a.wardNo.localeCompare(b.wardNo, undefined, { numeric: true }));
}
