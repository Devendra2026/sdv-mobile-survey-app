import { classifyConvexTokenError, lastConvexTokenError, retryConvexAuth } from '@/hooks/use-auth-for-convex';
import { useAuth } from '@clerk/expo';
import { useConvexAuth } from 'convex/react';
import { useEffect, useRef } from 'react';

/**
 * Clerk session + Convex JWT bridge state.
 *
 * `convexReady` — Clerk signed in and Convex accepted the `convex` JWT.
 * `convexAuthFailed` — permanent misconfiguration (missing Convex audience, etc.).
 * `convexAuthRecovering` — signed in but waiting on network (use Try again on error screen).
 */
export function useClerkConvexAuth() {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const { isLoading: convexAuthLoading, isAuthenticated } = useConvexAuth();
  const didAutoRetry = useRef(false);

  const convexReady = clerkLoaded && Boolean(isSignedIn) && !convexAuthLoading && isAuthenticated;

  const authStalled = clerkLoaded && Boolean(isSignedIn) && !convexAuthLoading && !isAuthenticated;

  const failureKind = classifyConvexTokenError(lastConvexTokenError);
  const convexAuthRecovering = authStalled && failureKind !== 'permanent';
  const convexAuthFailed = authStalled && failureKind === 'permanent';

  useEffect(() => {
    if (!isSignedIn || isAuthenticated) {
      didAutoRetry.current = false;
      return;
    }
    if (!convexAuthRecovering || didAutoRetry.current) return;

    didAutoRetry.current = true;
    retryConvexAuth();
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
