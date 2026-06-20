import type { Doc, Id } from "../_generated/dataModel";
import { compareWardThenParcel } from "../propertyId";

export type QcWardAggregate = {
  wardNo: string;
  municipalityId: Id<"municipalities">;
  city: string;
  pending: number;
  approved: number;
  rejected: number;
  drafts: number;
  total: number;
  qcCompletionPct: number;
  firstPendingId?: Id<"surveys">;
};

/** Normalize ward numbers so "01" and "1" aggregate together. */
export function normalizeWardNo(wardNo: string): string {
  const n = Number.parseInt(wardNo, 10);
  return Number.isNaN(n) ? wardNo : String(n);
}

function wardGroupKey(municipalityId: Id<"municipalities">, wardNo: string): string {
  return `${municipalityId}:${normalizeWardNo(wardNo)}`;
}

/** Aggregate QC counts per ward from the full scoped survey set. */
export function computeQcWardAggregates(rows: Doc<"surveys">[]): QcWardAggregate[] {
  const byKey = new Map<string, QcWardAggregate>();
  const pendingByKey = new Map<string, Doc<"surveys">[]>();

  for (const row of rows) {
    if (!row.wardNo?.trim()) continue;

    const key = wardGroupKey(row.municipalityId, row.wardNo);
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        wardNo: normalizeWardNo(row.wardNo),
        municipalityId: row.municipalityId,
        city: row.city,
        pending: 0,
        approved: 0,
        rejected: 0,
        drafts: 0,
        total: 0,
        qcCompletionPct: 0,
      };
      byKey.set(key, entry);
    }

    entry.total += 1;
    if (row.status === "draft") {
      entry.drafts += 1;
    }
    if (row.qcStatus === "pending" && row.status === "submitted") {
      entry.pending += 1;
      const pendingRows = pendingByKey.get(key) ?? [];
      pendingRows.push(row);
      pendingByKey.set(key, pendingRows);
    }
    if (row.qcStatus === "approved") {
      entry.approved += 1;
    }
    if (row.qcStatus === "rejected") {
      entry.rejected += 1;
    }
  }

  for (const entry of byKey.values()) {
    const decided = entry.pending + entry.approved + entry.rejected;
    entry.qcCompletionPct = decided > 0 ? Math.round((entry.approved / decided) * 100) : 0;

    const key = wardGroupKey(entry.municipalityId, entry.wardNo);
    const pendingRows = pendingByKey.get(key);
    if (pendingRows && pendingRows.length > 0) {
      pendingRows.sort(compareWardThenParcel);
      entry.firstPendingId = pendingRows[0]!._id;
    }
  }

  return Array.from(byKey.values()).toSorted((a, b) => a.wardNo.localeCompare(b.wardNo, undefined, { numeric: true }));
}
