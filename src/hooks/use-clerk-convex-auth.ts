import {
  classifyConvexTokenError,
  getLastGoodConvexToken,
  lastConvexTokenError,
  retryConvexAuth,
  setConvexSessionEstablished,
  setLastConvexTokenError,
  shouldRefreshConvexToken,
  subscribeAuthPhaseReset,
  subscribeAuthRefetch,
} from '@/hooks/use-auth-for-convex';
import { useAuth } from '@clerk/expo';
import { useConvexAuth } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

const MAX_AUTO_RETRIES = 5;
/** Must exceed worst-case `fetchAccessToken` duration so retries do not reset Convex auth mid-flight. */
const AUTO_RETRY_BASE_MS = 8_000;
const MAX_STALL_MS = 45_000;

export type ConvexAuthPhase = 'idle' | 'connecting' | 'recovering' | 'failed';

function serverRejectedMessage(): string {
  return (
    'The server rejected your session token. Your administrator must verify Convex + Clerk ' +
    'integration (Clerk → Integrations → Convex, and CLERK_JWT_ISSUER_DOMAIN on the Convex deployment).'
  );
}

/**
 * Clerk session + Convex JWT bridge state.
 */
export function useClerkConvexAuth() {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const { isLoading: convexAuthLoading, isAuthenticated } = useConvexAuth();
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  const [retrySeq, setRetrySeq] = useState(0);
  const [phase, setPhase] = useState<ConvexAuthPhase>('idle');
  const stallStartedAt = useRef<number | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribeAuthRefetch(() => setRetrySeq((n) => n + 1)), []);

  useEffect(
    () =>
      subscribeAuthPhaseReset(() => {
        stallStartedAt.current = Date.now();
        setAutoRetryCount(0);
        setPhase('connecting');
      }),
    [],
  );

  useEffect(() => {
    setConvexSessionEstablished(Boolean(isAuthenticated));
  }, [isAuthenticated]);

  const convexReady = clerkLoaded && Boolean(isSignedIn) && !convexAuthLoading && isAuthenticated;

  useEffect(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }

    if (!isSignedIn) {
      stallStartedAt.current = null;
      setAutoRetryCount(0);
      setPhase('idle');
      return;
    }

    if (isAuthenticated) {
      stallStartedAt.current = null;
      setAutoRetryCount(0);
      setPhase('idle');
      return;
    }

    if (convexAuthLoading) {
      setPhase('connecting');
      return;
    }

    if (stallStartedAt.current === null) {
      stallStartedAt.current = Date.now();
    }

    const stalledMs = Date.now() - (stallStartedAt.current ?? Date.now());
    const failureKind = classifyConvexTokenError(lastConvexTokenError);

    if (failureKind === 'permanent') {
      setPhase('failed');
      return;
    }

    if (autoRetryCount >= MAX_AUTO_RETRIES || stalledMs >= MAX_STALL_MS) {
      if (!lastConvexTokenError) {
        const stalledWithToken = getLastGoodConvexToken() && stalledMs >= 20_000 ? serverRejectedMessage() : null;
        setLastConvexTokenError(stalledWithToken ?? 'Connection timed out. Check your network and try again.');
      }
      setPhase('failed');
      return;
    }

    setPhase('recovering');
  }, [isSignedIn, isAuthenticated, convexAuthLoading, retrySeq, autoRetryCount]);

  useEffect(() => {
    if (phase !== 'recovering') return;
    if (autoRetryCount >= MAX_AUTO_RETRIES) return;
    if (convexAuthLoading) return;

    const delayMs = AUTO_RETRY_BASE_MS * 2 ** Math.min(autoRetryCount, 2);
    retryTimer.current = setTimeout(() => {
      setAutoRetryCount((n) => n + 1);
      retryConvexAuth();
    }, delayMs);

    return () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [phase, autoRetryCount, convexAuthLoading]);

  return {
    clerkLoaded,
    isSignedIn: Boolean(isSignedIn),
    convexAuthLoading,
    convexAuthPhase: phase,
    convexReady,
    convexAuthFailed: phase === 'failed',
    convexAuthRecovering: phase === 'recovering',
  };
}

/** Refresh Convex JWT when the app returns to foreground (only after a session was established). */
export function useAppStateSessionRefresh() {
  const { isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();

  useEffect(() => {
    if (!isSignedIn || !isAuthenticated) return;

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && shouldRefreshConvexToken()) {
        retryConvexAuth();
      }
    });

    return () => {
      sub.remove();
    };
  }, [isSignedIn, isAuthenticated]);
}
