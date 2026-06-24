/**
 * Merges local AsyncStorage drafts with server-side draft rows,
 * deduped by localId / serverSurveyId and sorted by last modified.
 */
import { api } from '@/convex/_generated/api';
import { useClerkConvexAuth } from '@/hooks/use-clerk-convex-auth';
import { clearDraft, draftCompletionPct, listDrafts, type WizardDraft } from '@/hooks/useWizardDraft';
import {
  isStaleLinkedLocalDraft,
  mergeDraftLists,
  type LocalDraftRow,
  type ServerDraftRow,
  type UnifiedDraftItem,
} from '@/utils/unifiedDraftMerge';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from 'convex/react';
import { useCallback, useMemo, useState } from 'react';

export type { UnifiedDraftItem };

function toLocalDraftRow(d: WizardDraft): LocalDraftRow {
  return {
    localId: d.localId,
    serverSurveyId: d.serverSurveyId,
    parcelNo: d.parcelNo,
    unitNo: d.unitNo,
    wardNo: d.wardNo,
    ownerName: d.owners?.[0]?.name,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    completionPct: draftCompletionPct(d),
  };
}

/** Drop local copies linked to surveys that are no longer server drafts (e.g. after submit). */
export async function purgeStaleLocalDrafts(
  local: WizardDraft[],
  serverDrafts: ServerDraftRow[],
): Promise<WizardDraft[]> {
  const kept: WizardDraft[] = [];
  for (const d of local) {
    if (isStaleLinkedLocalDraft(toLocalDraftRow(d), serverDrafts)) {
      await clearDraft(d.localId);
      continue;
    }
    kept.push(d);
  }
  return kept;
}

export { mergeDraftLists };

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

  const refreshLocal = useCallback(async () => {
    const allLocal = await listDrafts();
    if (serverDrafts === undefined) {
      setLocalDrafts(allLocal);
      return;
    }
    const pruned = await purgeStaleLocalDrafts(allLocal, serverDrafts);
    setLocalDrafts(pruned);
  }, [serverDrafts]);

  useFocusEffect(
    useCallback(() => {
      void refreshLocal();
    }, [refreshLocal]),
  );

  const items = useMemo(() => {
    const localRows = localDrafts.map(toLocalDraftRow);
    if (serverDrafts === undefined) return mergeDraftLists(localRows, []);
    return mergeDraftLists(localRows, serverDrafts);
  }, [localDrafts, serverDrafts]);

  const loading = serverDrafts === undefined;

  return { items, loading, refreshLocal };
}
