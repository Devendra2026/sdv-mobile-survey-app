import { isTokenValid, tokenHasConvexAud } from '@/utils/jwt';
import { useAuth } from '@clerk/expo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Last getToken failure — shown on ConvexAuthError. */
export let lastConvexTokenError: string | null = null;

const RETRY_MS = 1_000;
const MAX_ATTEMPTS = 14;

/** Bumped on manual retry so Convex re-runs setAuth (user-initiated only). */
let manualAuthRetrySeq = 0;

const forceRefreshRef = { current: 0 };
const manualRetryListeners = new Set<() => void>();

/** Last JWT that successfully authenticated with Convex this app session. */
let lastGoodConvexToken: string | null = null;

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

function isTransientTokenErrorMessage(message: string | null): boolean {
  if (!message) return true;
  const msg = message.toLowerCase();
  if (isClerkOfflineError(message)) return true;
  if (msg.includes('missing convex audience') || msg.includes('aud: convex')) return false;
  if (msg.includes('no session token') || msg.includes('sign out and sign in')) return false;
  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('connection') ||
    msg.includes('abort') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('socket') ||
    msg.includes('failed to fetch') ||
    msg.includes('internet') ||
    msg.includes('temporarily') ||
    msg.includes('could not') ||
    msg.includes('unable to')
  );
}

export type ConvexTokenErrorKind = 'transient' | 'permanent' | 'unknown';

export function classifyConvexTokenError(message: string | null): ConvexTokenErrorKind {
  if (!message) return 'unknown';
  const msg = message.toLowerCase();
  if (msg.includes('missing convex audience') || msg.includes('aud: convex')) return 'permanent';
  if (isTransientTokenErrorMessage(message)) return 'transient';
  if (msg.includes('session expired')) return 'transient';
  if (msg.includes('no session token') || msg.includes('could not reach')) return 'unknown';
  return 'unknown';
}

function rememberGoodToken(token: string) {
  if (tokenHasConvexAud(token) && isTokenValid(token)) {
    lastGoodConvexToken = token;
  }
}

async function readCachedConvexToken(
  getToken: (opts?: { template?: string; skipCache?: boolean }) => Promise<string | null>,
): Promise<string | null> {
  try {
    const sessionToken = await getToken({ skipCache: false });
    if (sessionToken && tokenHasConvexAud(sessionToken) && isTokenValid(sessionToken)) {
      return sessionToken;
    }
  } catch {
    /* try template below */
  }

  try {
    const templateToken = await getToken({ template: 'convex', skipCache: false });
    if (templateToken && isTokenValid(templateToken)) return templateToken;
  } catch {
    /* fall through */
  }

  if (lastGoodConvexToken && isTokenValid(lastGoodConvexToken) && tokenHasConvexAud(lastGoodConvexToken)) {
    return lastGoodConvexToken;
  }

  return null;
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

  useEffect(() => {
    if (!isSignedIn) {
      lastGoodConvexToken = null;
      lastConvexTokenError = null;
    }
  }, [isSignedIn]);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      void retrySeq;
      lastConvexTokenError = null;
      const refresh = forceRefreshToken || forceRefreshRef.current > 0;
      const getToken = (opts?: { template?: string; skipCache?: boolean }) => getTokenRef.current(opts);

      if (!refresh) {
        const cached = await readCachedConvexToken(getToken);
        if (cached) {
          rememberGoodToken(cached);
          return cached;
        }
      }

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const skipCache = refresh || attempt > 1;

        try {
          const sessionToken = await getToken({ skipCache });
          if (sessionToken && tokenHasConvexAud(sessionToken) && isTokenValid(sessionToken)) {
            rememberGoodToken(sessionToken);
            return sessionToken;
          }

          try {
            const templateToken = await getToken({
              template: 'convex',
              skipCache,
            });
            if (templateToken && isTokenValid(templateToken)) {
              rememberGoodToken(templateToken);
              return templateToken;
            }
          } catch (templateErr) {
            lastConvexTokenError = formatTokenError(templateErr);
            if (sessionToken && tokenHasConvexAud(sessionToken) && isTokenValid(sessionToken)) {
              rememberGoodToken(sessionToken);
              return sessionToken;
            }
          }

          if (!sessionToken) {
            lastConvexTokenError = 'Clerk returned no session token. Sign out and sign in again.';
          } else if (!tokenHasConvexAud(sessionToken)) {
            lastConvexTokenError =
              'Clerk session is missing Convex audience (aud: convex). In Clerk Dashboard → Integrations → Convex → Activate.';
          } else if (!isTokenValid(sessionToken)) {
            lastConvexTokenError = 'Session expired — reconnect when you have signal, or sign in again.';
          }
        } catch (err) {
          lastConvexTokenError = formatTokenError(err);
          if (isClerkOfflineError(err)) {
            const cached = await readCachedConvexToken(getToken);
            if (cached) {
              rememberGoodToken(cached);
              return cached;
            }
          }
        }

        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RETRY_MS * Math.min(attempt, 6)));
        }
      }

      if (lastGoodConvexToken && isTokenValid(lastGoodConvexToken) && tokenHasConvexAud(lastGoodConvexToken)) {
        return lastGoodConvexToken;
      }

      if (!lastConvexTokenError) {
        lastConvexTokenError = 'Could not reach the server — check your signal and try again.';
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
