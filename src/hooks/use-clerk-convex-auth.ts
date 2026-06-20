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
import { useEffect, useReducer, useRef } from 'react';
import { AppState } from 'react-native';

const MAX_AUTO_RETRIES = 5;
/** Must exceed worst-case `fetchAccessToken` duration so retries do not reset Convex auth mid-flight. */
const AUTO_RETRY_BASE_MS = 8_000;
const MAX_STALL_MS = 45_000;

export type ConvexAuthPhase = 'idle' | 'connecting' | 'recovering' | 'failed';

type AuthState = {
  autoRetryCount: number;
  retrySeq: number;
  phase: ConvexAuthPhase;
};

type AuthAction =
  | { type: 'refetch' }
  | { type: 'phase_reset' }
  | { type: 'evaluate'; isSignedIn: boolean; isAuthenticated: boolean; convexAuthLoading: boolean; stalledMs: number }
  | { type: 'retry_tick' };

const initialAuthState: AuthState = {
  autoRetryCount: 0,
  retrySeq: 0,
  phase: 'idle',
};

function serverRejectedMessage(): string {
  return (
    'The server rejected your session token. Your administrator must verify Convex + Clerk ' +
    'integration (Clerk → Integrations → Convex, and CLERK_JWT_ISSUER_DOMAIN on the Convex deployment).'
  );
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'refetch':
      return { ...state, retrySeq: state.retrySeq + 1 };
    case 'phase_reset':
      return { ...state, autoRetryCount: 0, phase: 'connecting' };
    case 'retry_tick':
      return { ...state, autoRetryCount: state.autoRetryCount + 1 };
    case 'evaluate': {
      const { isSignedIn, isAuthenticated, convexAuthLoading, stalledMs } = action;
      if (!isSignedIn) {
        return { ...state, autoRetryCount: 0, phase: 'idle' };
      }
      if (isAuthenticated) {
        return { ...state, autoRetryCount: 0, phase: 'idle' };
      }
      if (convexAuthLoading) {
        return { ...state, phase: 'connecting' };
      }

      const failureKind = classifyConvexTokenError(lastConvexTokenError);
      if (failureKind === 'permanent') {
        return { ...state, phase: 'failed' };
      }

      if (state.autoRetryCount >= MAX_AUTO_RETRIES || stalledMs >= MAX_STALL_MS) {
        return { ...state, phase: 'failed' };
      }

      return { ...state, phase: 'recovering' };
    }
    default:
      return state;
  }
}

/**
 * Clerk session + Convex JWT bridge state.
 */
export function useClerkConvexAuth() {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const { isLoading: convexAuthLoading, isAuthenticated } = useConvexAuth();
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const stallStartedAt = useRef<number | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribeAuthRefetch(() => dispatch({ type: 'refetch' })), []);

  useEffect(
    () =>
      subscribeAuthPhaseReset(() => {
        stallStartedAt.current = Date.now();
        dispatch({ type: 'phase_reset' });
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
    } else if (isAuthenticated) {
      stallStartedAt.current = null;
    } else if (convexAuthLoading) {
      // stall timer unchanged while Convex auth is in flight
    } else if (stallStartedAt.current === null) {
      stallStartedAt.current = Date.now();
    }

    const stalledMs =
      isSignedIn && !isAuthenticated && !convexAuthLoading ? Date.now() - (stallStartedAt.current ?? Date.now()) : 0;

    dispatch({
      type: 'evaluate',
      isSignedIn: Boolean(isSignedIn),
      isAuthenticated: Boolean(isAuthenticated),
      convexAuthLoading,
      stalledMs,
    });
  }, [isSignedIn, isAuthenticated, convexAuthLoading, state.retrySeq, state.autoRetryCount]);

  useEffect(() => {
    if (state.phase !== 'failed') return;
    if (lastConvexTokenError) return;

    const stalledMs = stallStartedAt.current ? Date.now() - stallStartedAt.current : 0;
    const stalledWithToken = getLastGoodConvexToken() && stalledMs >= 20_000 ? serverRejectedMessage() : null;
    setLastConvexTokenError(stalledWithToken ?? 'Connection timed out. Check your network and try again.');
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== 'recovering') return;
    if (state.autoRetryCount >= MAX_AUTO_RETRIES) return;
    if (convexAuthLoading) return;

    const delayMs =
      state.autoRetryCount === 0 && !getLastGoodConvexToken()
        ? 400
        : AUTO_RETRY_BASE_MS * 2 ** Math.min(state.autoRetryCount, 2);
    retryTimer.current = setTimeout(() => {
      dispatch({ type: 'retry_tick' });
      retryConvexAuth();
    }, delayMs);

    return () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [state.phase, state.autoRetryCount, convexAuthLoading]);

  return {
    clerkLoaded,
    isSignedIn: Boolean(isSignedIn),
    convexAuthLoading,
    convexAuthPhase: state.phase,
    convexReady,
    convexAuthFailed: state.phase === 'failed',
    convexAuthRecovering: state.phase === 'recovering',
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
