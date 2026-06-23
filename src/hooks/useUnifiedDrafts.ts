/**
 * Merges local AsyncStorage drafts with server-side draft rows,
 * deduped by localId / serverSurveyId and sorted by last modified.
 */
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { draftCompletionPct, listDrafts, type WizardDraft } from '@/hooks/useWizardDraft';
import { surveyOwnerListLabel } from '@/utils/format';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from 'convex/react';
import { useCallback, useMemo, useState } from 'react';

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
  /** Resume via local AsyncStorage */
  resumeLocal: boolean;
};

function serverDraftToItem(row: {
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
}): UnifiedDraftItem {
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

function localDraftToItem(d: WizardDraft): UnifiedDraftItem {
  return {
    key: `local:${d.localId}`,
    source: 'local',
    localId: d.localId,
    serverSurveyId: d.serverSurveyId,
    parcelNo: d.parcelNo || 'Draft',
    unitNo: d.unitNo || '—',
    ownerName: d.owners?.[0]?.name?.trim() || 'In progress',
    wardNo: d.wardNo ?? '—',
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    completionPct: draftCompletionPct(d),
    resumeLocal: true,
  };
}

function mergeDraftLists(local: WizardDraft[], server: Parameters<typeof serverDraftToItem>[0][]): UnifiedDraftItem[] {
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

export function useUnifiedDrafts() {
  const { convexReady } = useClerkConvexAuth();
  const [localDrafts, setLocalDrafts] = useState<WizardDraft[]>([]);
  const me = useQuery(api.users.currentUser, convexReady ? {} : 'skip');

  const serverDrafts = useQuery(
    api.survey.list,
    convexReady && me
      ? { status: 'draft' as const, sortBy: 'updated' as const, surveyorId: me._id, limit: 100 }
      : 'skip',
  );

  const refreshLocal = useCallback(() => {
    void listDrafts().then(setLocalDrafts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshLocal();
    }, [refreshLocal]),
  );

  const items = useMemo(() => {
    if (serverDrafts === undefined) return mergeDraftLists(localDrafts, []);
    return mergeDraftLists(localDrafts, serverDrafts);
  }, [localDrafts, serverDrafts]);

  const loading = serverDrafts === undefined;

  return { items, loading, refreshLocal };
}
