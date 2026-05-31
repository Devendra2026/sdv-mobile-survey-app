import { useAuth } from '@clerk/expo';
import { useEffect, useRef } from 'react';
import { useClerkConvexAuth } from './use-clerk-convex-auth';

/**
 * True after the first successful Clerk + Convex + profile bootstrap.
 * Avoids full-screen loading on hot reload / token refresh.
 */
export function useSessionBootstrap(me: unknown, needsSync: boolean, syncing: boolean) {
  const { isSignedIn } = useAuth();
  const { convexReady, convexAuthPhase } = useClerkConvexAuth();
  const bootstrapped = useRef(false);

  const sessionPending = convexAuthPhase === 'connecting' || convexAuthPhase === 'recovering';
  const profilePending = convexReady && me === undefined;
  const setupPending = convexReady && needsSync && syncing;
  const accountReady = me !== null || !needsSync;

  if (isSignedIn && convexReady && me !== undefined && accountReady && !setupPending) {
    bootstrapped.current = true;
  }

  useEffect(() => {
    if (!isSignedIn) {
      bootstrapped.current = false;
    }
  }, [isSignedIn]);

  const showBlockingOverlay =
    Boolean(isSignedIn) && !bootstrapped.current && (sessionPending || !convexReady || profilePending || setupPending);

  return { showBlockingOverlay, bootstrapped: bootstrapped.current };
}
