/**
 * Debounced cloud draft sync when online.
 */
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useSaveSurveyDraft, type SaveDraftResult } from '@/hooks/useSaveSurveyDraft';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import { draftToSaveDraftPayload } from '@/hooks/useWizardDraft';
import { useCallback, useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 3000;

export function useDebouncedCloudSave(
  draft: WizardDraft | null,
  callbacks?: {
    onSynced?: (result: SaveDraftResult) => void;
    onError?: (error: unknown) => void;
    onSyncState?: (state: { pendingCloudSync: boolean; lastSyncError?: string; lastSyncedAt?: number }) => void;
  },
) {
  const { isOnline } = useNetworkStatus();
  const { save } = useSaveSurveyDraft();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(draft?.lastSyncedAt ?? null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | undefined>(draft?.lastSyncError);
  const [pendingCloudSync, setPendingCloudSync] = useState(Boolean(draft?.pendingCloudSync));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const saveRef = useRef(save);
  saveRef.current = save;
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const wasOnlineRef = useRef(isOnline);
  const lastSyncedAtRef = useRef<number | null>(draft?.lastSyncedAt ?? null);

  const runSync = useCallback(async (reason: 'debounce' | 'reconnect' | 'retry') => {
    const current = draftRef.current;
    if (!current || !draftToSaveDraftPayload(current)) return;

    setSyncing(true);
    setPendingCloudSync(true);
    callbacksRef.current?.onSyncState?.({
      pendingCloudSync: true,
      lastSyncError: undefined,
      lastSyncedAt: lastSyncedAtRef.current ?? undefined,
    });

    try {
      const result = await saveRef.current(current);
      if (!result.surveyId) {
        const err = 'Could not sync draft header — check district and ULB';
        setLastSyncError(err);
        callbacksRef.current?.onSyncState?.({ pendingCloudSync: true, lastSyncError: err });
        callbacksRef.current?.onError?.(new Error(err));
        return;
      }

      if (result.failedSections.length > 0) {
        const err = `Partial sync (${reason}): ${result.failedSections.join(', ')} failed`;
        setLastSyncError(err);
        setPendingCloudSync(true);
        callbacksRef.current?.onSyncState?.({
          pendingCloudSync: true,
          lastSyncError: err,
          lastSyncedAt: lastSyncedAtRef.current ?? undefined,
        });
        callbacksRef.current?.onError?.(new Error(err));
      } else {
        const now = Date.now();
        lastSyncedAtRef.current = now;
        setLastSyncedAt(now);
        setLastSyncError(undefined);
        setPendingCloudSync(false);
        callbacksRef.current?.onSyncState?.({
          pendingCloudSync: false,
          lastSyncedAt: now,
        });
      }

      callbacksRef.current?.onSynced?.(result);
    } catch (error) {
      const err = error instanceof Error ? error.message : 'Cloud sync failed';
      setLastSyncError(err);
      setPendingCloudSync(true);
      callbacksRef.current?.onSyncState?.({ pendingCloudSync: true, lastSyncError: err });
      callbacksRef.current?.onError?.(error);
    } finally {
      setSyncing(false);
    }
  }, []);

  const flushSync = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void runSync('retry');
  }, [runSync]);

  useEffect(() => {
    const current = draftRef.current;
    if (!current || !isOnline || !draftToSaveDraftPayload(current)) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void runSync('debounce');
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [draft?.localId, draft?.updatedAt, isOnline, runSync]);

  useEffect(() => {
    const cameOnline = isOnline && !wasOnlineRef.current;
    wasOnlineRef.current = isOnline;
    if (!cameOnline) return;

    const current = draftRef.current;
    if (!current || !draftToSaveDraftPayload(current)) return;
    if (!current.pendingCloudSync && !current.lastSyncError) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    void runSync('reconnect');
  }, [isOnline, runSync]);

  return {
    lastSyncedAt,
    syncing,
    isOnline,
    lastSyncError,
    pendingCloudSync,
    flushSync,
  };
}
