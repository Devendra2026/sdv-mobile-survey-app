/**
 * Pure merge logic for local + server draft lists (no React Native deps).
 */
import type { Id } from '@/convex/_generated/dataModel';
import { surveyOwnerListLabel } from '@/utils/format';

export type UnifiedDraftItem = {
  key: string;
  source: 'local' | 'server' | 'merged';
  localId: string;
  serverSurveyId?: Id<'surveys'>;
  parcelNo: string;
  unitNo: string;
  ownerName: string;
  wardNo: string;
  createdAt: number;
  updatedAt: number;
  completionPct: number;
  resumeLocal: boolean;
};

export type LocalDraftRow = {
  localId: string;
  serverSurveyId?: Id<'surveys'>;
  parcelNo?: string;
  unitNo?: string;
  wardNo?: string;
  ownerName?: string;
  createdAt: number;
  updatedAt: number;
  completionPct: number;
};

export type ServerDraftRow = {
  _id: Id<'surveys'>;
  localId: string;
  parcelNo: string;
  unitNo: string;
  wardNo: string;
  owners?: { name?: string }[];
  respondentName?: string;
  _creationTime: number;
  clientUpdatedAt: number;
  completionPct?: number;
};

function serverDraftToItem(row: ServerDraftRow): UnifiedDraftItem {
  return {
    key: `server:${row._id}`,
    source: 'server',
    localId: row.localId,
    serverSurveyId: row._id,
    parcelNo: row.parcelNo || 'Draft',
    unitNo: row.unitNo || '—',
    ownerName: surveyOwnerListLabel(row.owners, row.respondentName) || 'In progress',
    wardNo: row.wardNo || '—',
    createdAt: row._creationTime,
    updatedAt: row.clientUpdatedAt,
    completionPct: row.completionPct ?? 0,
    resumeLocal: false,
  };
}

function localDraftToItem(d: LocalDraftRow): UnifiedDraftItem {
  return {
    key: `local:${d.localId}`,
    source: 'local',
    localId: d.localId,
    serverSurveyId: d.serverSurveyId,
    parcelNo: d.parcelNo || 'Draft',
    unitNo: d.unitNo || '—',
    ownerName: d.ownerName?.trim() || 'In progress',
    wardNo: d.wardNo ?? '—',
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    completionPct: d.completionPct,
    resumeLocal: true,
  };
}

/** True when a local draft is linked to a server row that is no longer a draft. */
export function isStaleLinkedLocalDraft(d: LocalDraftRow, serverDrafts: ServerDraftRow[]): boolean {
  if (!d.serverSurveyId) return false;
  const serverIds = new Set(serverDrafts.map((r) => r._id));
  const serverLocalIds = new Set(serverDrafts.map((r) => r.localId));
  return !serverIds.has(d.serverSurveyId) && !serverLocalIds.has(d.localId);
}

export function mergeDraftLists(local: LocalDraftRow[], server: ServerDraftRow[]): UnifiedDraftItem[] {
  const byLocalId = new Map<string, UnifiedDraftItem>();
  const byServerId = new Map<string, UnifiedDraftItem>();

  for (const d of local) {
    const item = localDraftToItem(d);
    byLocalId.set(d.localId, item);
    if (d.serverSurveyId) byServerId.set(d.serverSurveyId, item);
  }

  for (const row of server) {
    const serverItem = serverDraftToItem(row);
    const localMatch = byLocalId.get(row.localId);
    const existingByServer = byServerId.get(row._id);

    if (localMatch) {
      const merged: UnifiedDraftItem = {
        ...localMatch,
        key: `merged:${row.localId}`,
        source: 'merged',
        serverSurveyId: row._id,
        parcelNo: localMatch.parcelNo !== 'Draft' ? localMatch.parcelNo : serverItem.parcelNo,
        unitNo: localMatch.unitNo !== '—' ? localMatch.unitNo : serverItem.unitNo,
        ownerName: localMatch.ownerName !== 'In progress' ? localMatch.ownerName : serverItem.ownerName,
        wardNo: localMatch.wardNo !== '—' ? localMatch.wardNo : serverItem.wardNo,
        createdAt: Math.min(localMatch.createdAt, serverItem.createdAt),
        updatedAt: Math.max(localMatch.updatedAt, serverItem.updatedAt),
        completionPct: Math.max(localMatch.completionPct, serverItem.completionPct),
        resumeLocal: true,
      };
      byLocalId.set(row.localId, merged);
      byServerId.set(row._id, merged);
      continue;
    }

    if (existingByServer) continue;
    byLocalId.set(row.localId, serverItem);
    byServerId.set(row._id, serverItem);
  }

  const seen = new Set<string>();
  const items: UnifiedDraftItem[] = [];
  for (const item of byLocalId.values()) {
    const dedupeKey = item.serverSurveyId ?? item.localId;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    items.push(item);
  }

  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}
