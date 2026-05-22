import { classifyConvexTokenError, lastConvexTokenError, retryConvexAuth } from '@/hooks/use-auth-for-convex';
import { useAuth } from '@clerk/expo';
import { useConvexAuth } from 'convex/react';
import { useEffect, useRef } from 'react';

/** Background retries while Clerk/Convex auth is blocked on weak field networks. */
const AUTO_RETRY_MS = 4_000;

/**
 * Clerk session + Convex JWT bridge state.
 *
 * `convexReady` — Clerk signed in and Convex accepted the `convex` JWT.
 * `convexAuthFailed` — permanent misconfiguration (missing Convex audience, etc.).
 * `convexAuthRecovering` — signed in but waiting on network; auto-retries in the background.
 */
export function useClerkConvexAuth() {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const { isLoading: convexAuthLoading, isAuthenticated } = useConvexAuth();
  const autoRetryTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const convexReady = clerkLoaded && Boolean(isSignedIn) && !convexAuthLoading && isAuthenticated;

  const authStalled = clerkLoaded && Boolean(isSignedIn) && !convexAuthLoading && !isAuthenticated;

  const failureKind = classifyConvexTokenError(lastConvexTokenError);
  const convexAuthRecovering = authStalled && failureKind !== 'permanent';
  const convexAuthFailed = authStalled && failureKind === 'permanent';

  useEffect(() => {
    if (autoRetryTimer.current) {
      clearInterval(autoRetryTimer.current);
      autoRetryTimer.current = null;
    }

    if (!isSignedIn || isAuthenticated || !convexAuthRecovering) return;

    const tick = () => {
      if (!isSignedIn) return;
      retryConvexAuth();
    };

    void tick();
    autoRetryTimer.current = setInterval(tick, AUTO_RETRY_MS);
    return () => {
      if (autoRetryTimer.current) clearInterval(autoRetryTimer.current);
    };
  }, [isSignedIn, isAuthenticated, convexAuthRecovering]);

  return {
    clerkLoaded,
    isSignedIn: Boolean(isSignedIn),
    convexAuthLoading,
    convexReady,
    convexAuthFailed,
    convexAuthRecovering,
  };
}
