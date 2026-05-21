import { tokenHasConvexAud } from '@/utils/jwt';
import { useAuth } from '@clerk/expo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Last getToken failure — shown on ConvexAuthError. */
export let lastConvexTokenError: string | null = null;

const RETRY_MS = 800;
const MAX_ATTEMPTS = 8;

/** Bumped on manual retry so Convex re-runs setAuth (user-initiated only). */
let manualAuthRetrySeq = 0;

const forceRefreshRef = { current: 0 };
const manualRetryListeners = new Set<() => void>();

function notifyManualAuthRetry() {
  for (const listener of manualRetryListeners) listener();
}

/** Force ConvexProviderWithAuth to fetch a fresh Clerk `convex` JWT (Try again). */
export function retryConvexAuth() {
  forceRefreshRef.current += 1;
  manualAuthRetrySeq += 1;
  notifyManualAuthRetry();
}

function formatTokenError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error fetching Clerk token';
  }
}

function isClerkOfflineError(err: unknown): boolean {
  const msg = formatTokenError(err).toLowerCase();
  return msg.includes('clerk_offline') || msg.includes('offline');
}

/**
 * Clerk → Convex auth bridge for `ConvexProviderWithAuth`.
 *
 * On React Native, `getToken({ template: "convex" })` often fails with `clerk_offline`
 * even when the cached session JWT already has `aud: "convex"` (Clerk → Convex integration).
 * Always read the session token first and inspect its `aud` claim before minting a template.
 *
 * `getToken` from Clerk Expo is not referentially stable — keep it in a ref so
 * Convex does not call setAuth on every render (causes "Securing your session" loops).
 */
export function useAuthForConvex() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const [retrySeq, setRetrySeq] = useState(manualAuthRetrySeq);

  useEffect(() => {
    const sync = () => setRetrySeq(manualAuthRetrySeq);
    manualRetryListeners.add(sync);
    return () => {
      manualRetryListeners.delete(sync);
    };
  }, []);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      void retrySeq;
      lastConvexTokenError = null;
      const refresh = forceRefreshToken || forceRefreshRef.current > 0;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const skipCache = refresh || attempt > 1;

        try {
          const sessionToken = await getTokenRef.current({ skipCache });
          if (sessionToken && tokenHasConvexAud(sessionToken)) {
            return sessionToken;
          }

          try {
            const templateToken = await getTokenRef.current({
              template: 'convex',
              skipCache,
            });
            if (templateToken) return templateToken;
          } catch (templateErr) {
            lastConvexTokenError = formatTokenError(templateErr);
            if (sessionToken && tokenHasConvexAud(sessionToken)) {
              return sessionToken;
            }
          }

          if (!sessionToken) {
            lastConvexTokenError = 'Clerk returned no session token. Sign out and sign in again.';
          } else {
            lastConvexTokenError =
              'Clerk session is missing Convex audience (aud: convex). In Clerk Dashboard → Integrations → Convex → Activate.';
          }
        } catch (err) {
          lastConvexTokenError = formatTokenError(err);
          if (isClerkOfflineError(err)) {
            try {
              const fallback = await getTokenRef.current({ skipCache: true });
              if (fallback && tokenHasConvexAud(fallback)) return fallback;
            } catch (fallbackErr) {
              lastConvexTokenError = formatTokenError(fallbackErr);
            }
          }
        }

        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RETRY_MS * attempt));
        }
      }

      if (__DEV__ && lastConvexTokenError) {
        console.warn('[convex-auth]', lastConvexTokenError);
      }
      return null;
    },
    [retrySeq],
  );

  return useMemo(
    () => ({
      isLoading: !isLoaded,
      isAuthenticated: isSignedIn ?? false,
      fetchAccessToken,
    }),
    [isLoaded, isSignedIn, fetchAccessToken],
  );
}
