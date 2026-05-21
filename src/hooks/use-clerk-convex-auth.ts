import { useAuth } from '@clerk/expo';
import { useConvexAuth } from 'convex/react';
import { useEffect, useState } from 'react';

/** Allow Clerk token retries inside useAuthForConvex before showing the error screen. */
const CONVEX_AUTH_TIMEOUT_MS = 35_000;

/**
 * Clerk session + Convex JWT bridge state.
 *
 * `convexReady` — Clerk signed in and Convex accepted the `convex` JWT.
 * `convexAuthFailed` — Clerk session exists but Convex rejected the token
 *   (missing JWT template, wrong issuer env, etc.).
 */
export function useClerkConvexAuth() {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const { isLoading: convexAuthLoading, isAuthenticated } = useConvexAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isSignedIn || convexAuthLoading || isAuthenticated) {
      setTimedOut(false);
      return;
    }
    const t = setTimeout(() => setTimedOut(true), CONVEX_AUTH_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [isSignedIn, convexAuthLoading, isAuthenticated]);

  const convexReady = clerkLoaded && Boolean(isSignedIn) && !convexAuthLoading && isAuthenticated;

  const convexAuthFailed = clerkLoaded && Boolean(isSignedIn) && !convexAuthLoading && !isAuthenticated;

  return {
    clerkLoaded,
    isSignedIn: Boolean(isSignedIn),
    convexAuthLoading,
    convexReady,
    convexAuthFailed: convexAuthFailed || timedOut,
  };
}
