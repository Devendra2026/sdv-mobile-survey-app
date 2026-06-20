/**
 * Debounced cloud draft sync when online.
 */
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useSaveSurveyDraft } from '@/hooks/useSaveSurveyDraft';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import { draftToSaveDraftPayload } from '@/hooks/useWizardDraft';
import { useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 3000;

export function useDebouncedCloudSave(draft: WizardDraft | null) {
  const { isOnline } = useNetworkStatus();
  const { save } = useSaveSurveyDraft();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    const current = draftRef.current;
    if (!current || !isOnline || !draftToSaveDraftPayload(current)) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const current = draftRef.current;
      if (!current || !draftToSaveDraftPayload(current)) return;
      setSyncing(true);
      try {
        await saveRef.current(current);
        setLastSyncedAt(Date.now());
      } catch {
        // Silent — user can manually save; toast handled elsewhere
      } finally {
        setSyncing(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [draft?.localId, draft?.updatedAt, isOnline]);

  return { lastSyncedAt, syncing, isOnline };
}
