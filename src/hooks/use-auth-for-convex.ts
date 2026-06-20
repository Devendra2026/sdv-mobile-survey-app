import { env } from '@/config/env';
import { clerkJwtIssuerFromPublishableKey } from '@/utils/clerk-issuer';
import { audIncludesConvex, decodeJwtPayload, isTokenValid, tokenExpiresAtMs, tokenHasConvexAud } from '@/utils/jwt';
import { useAuth } from '@clerk/expo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Last getToken failure — shown on ConvexAuthError. */
export let lastConvexTokenError: string | null = null;

export function setLastConvexTokenError(message: string | null) {
  lastConvexTokenError = message;
}

/** True after Convex has accepted a JWT at least once this Clerk session. */
let convexSessionEstablished = false;

const RETRY_MS = 800;
const MAX_ATTEMPTS = 8;
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60_000;

let authRefetchEpoch = 0;
const forceRefreshRef = { current: 0 };
const authRefetchListeners = new Set<() => void>();
const authPhaseResetListeners = new Set<() => void>();

let lastGoodConvexToken: string | null = null;

const expectedClerkIssuer = clerkJwtIssuerFromPublishableKey(env.clerkPublishableKey);

function notifyAuthRefetch() {
  for (const listener of authRefetchListeners) listener();
}

function notifyAuthPhaseReset() {
  for (const listener of authPhaseResetListeners) listener();
}

export function subscribeAuthRefetch(listener: () => void) {
  authRefetchListeners.add(listener);
  return () => {
    authRefetchListeners.delete(listener);
  };
}

export function subscribeAuthPhaseReset(listener: () => void) {
  authPhaseResetListeners.add(listener);
  return () => {
    authPhaseResetListeners.delete(listener);
  };
}

export function setConvexSessionEstablished(established: boolean) {
  convexSessionEstablished = established;
}

export function getLastGoodConvexToken(): string | null {
  return lastGoodConvexToken;
}

export function retryConvexAuth(opts?: { resetPhase?: boolean }) {
  forceRefreshRef.current += 1;
  authRefetchEpoch += 1;
  notifyAuthRefetch();
  if (opts?.resetPhase) {
    notifyAuthPhaseReset();
  }
}

export function shouldRefreshConvexToken(): boolean {
  if (!convexSessionEstablished) return false;
  const token = lastGoodConvexToken;
  if (!token) return true;
  if (!isTokenValid(token)) return true;
  const expMs = tokenExpiresAtMs(token);
  if (expMs === null) return false;
  return Date.now() >= expMs - REFRESH_BEFORE_EXPIRY_MS;
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
  if (!message) return false;
  const msg = message.toLowerCase();
  if (isClerkOfflineError(message)) return true;
  if (msg.includes('missing convex audience') || msg.includes('aud: convex')) return false;
  if (msg.includes('no session token') || msg.includes('sign out and sign in')) return false;
  if (msg.includes('wrong clerk app') || msg.includes('rebuild the app')) return false;
  if (msg.includes('server rejected') || msg.includes('integration')) return false;
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
    msg.includes('could not reach')
  );
}

export type ConvexTokenErrorKind = 'transient' | 'permanent' | 'unknown';

export function classifyConvexTokenError(message: string | null): ConvexTokenErrorKind {
  if (!message) return 'unknown';
  const msg = message.toLowerCase();
  if (msg.includes('missing convex audience') || msg.includes('aud: convex')) return 'permanent';
  if (msg.includes('wrong clerk app') || msg.includes('rebuild the app')) return 'permanent';
  if (msg.includes('server rejected') || msg.includes('integration')) return 'permanent';
  if (isTransientTokenErrorMessage(message)) return 'transient';
  if (msg.includes('session expired')) return 'transient';
  return 'unknown';
}

function tokenIssuer(token: string): string | null {
  const iss = decodeJwtPayload(token)?.iss;
  return typeof iss === 'string' ? iss : null;
}

function validateConvexJwt(token: string, fromConvexTemplate: boolean): string | null {
  if (!isTokenValid(token)) {
    return 'Session expired — sign in again.';
  }

  if (!fromConvexTemplate && !tokenHasConvexAud(token)) {
    return 'Clerk session is missing Convex audience (aud: convex). In Clerk Dashboard → Integrations → Convex → Activate.';
  }

  if (expectedClerkIssuer) {
    const iss = tokenIssuer(token);
    if (iss && iss !== expectedClerkIssuer) {
      return (
        `This install uses the wrong Clerk app (token from ${iss}, expected ${expectedClerkIssuer}). ` +
        'Rebuild the APK after updating EAS environment variables, or sign in with the correct account.'
      );
    }
  }

  return null;
}

function rememberGoodToken(token: string) {
  const fromTemplate = true;
  const err = validateConvexJwt(token, fromTemplate);
  if (err) {
    lastConvexTokenError = err;
    return;
  }
  lastGoodConvexToken = token;
  lastConvexTokenError = null;
}

function sessionUsesConvexIntegration(sessionClaims: Record<string, unknown> | null | undefined): boolean {
  return sessionClaims?.aud === 'convex' || audIncludesConvex(sessionClaims?.aud);
}

async function fetchClerkConvexToken(
  getToken: (opts?: { template?: string; skipCache?: boolean }) => Promise<string | null>,
  skipCache: boolean,
  sessionClaims: Record<string, unknown> | null | undefined,
): Promise<string | null> {
  const integrated = sessionUsesConvexIntegration(sessionClaims);

  try {
    if (integrated) {
      const sessionToken = await getToken({ skipCache });
      if (sessionToken) {
        const err = validateConvexJwt(sessionToken, true);
        if (!err) return sessionToken;
        lastConvexTokenError = err;
      }
    } else {
      const templateToken = await getToken({ template: 'convex', skipCache });
      if (templateToken) {
        const err = validateConvexJwt(templateToken, true);
        if (!err) return templateToken;
        lastConvexTokenError = err;
      }
    }
  } catch (err) {
    lastConvexTokenError = formatTokenError(err);
  }

  if (!integrated) {
    try {
      const templateToken = await getToken({ template: 'convex', skipCache });
      if (templateToken) {
        const err = validateConvexJwt(templateToken, true);
        if (!err) return templateToken;
        if (!lastConvexTokenError) lastConvexTokenError = err;
      }
    } catch (err) {
      lastConvexTokenError = formatTokenError(err);
    }
  }

  const sessionToken = await getToken({ skipCache });
  if (!sessionToken) {
    lastConvexTokenError = 'Clerk returned no session token. Sign out and sign in again.';
    return null;
  }

  const err = validateConvexJwt(sessionToken, integrated);
  if (err) {
    lastConvexTokenError = err;
    return null;
  }
  return sessionToken;
}

type ClerkGetToken = (opts?: { template?: string; skipCache?: boolean }) => Promise<string | null>;

async function fetchConvexTokenWithRetry(
  getToken: ClerkGetToken,
  refresh: boolean,
  claims: Record<string, unknown> | null | undefined,
): Promise<string | null> {
  const attempt = async (attemptNo: number): Promise<string | null> => {
    const skipCache = refresh || attemptNo > 1 || !lastGoodConvexToken;

    try {
      const token = await fetchClerkConvexToken(getToken, skipCache, claims);
      if (token) {
        rememberGoodToken(token);
        return token;
      }
    } catch (err) {
      lastConvexTokenError = formatTokenError(err);
      if (isClerkOfflineError(err) && lastGoodConvexToken && isTokenValid(lastGoodConvexToken)) {
        const cachedErr = validateConvexJwt(lastGoodConvexToken, true);
        if (!cachedErr) return lastGoodConvexToken;
      }
    }

    if (attemptNo >= MAX_ATTEMPTS) {
      if (!lastConvexTokenError) {
        lastConvexTokenError = 'Could not reach the server — check your connection and try again.';
      }
      if (__DEV__ && lastConvexTokenError) {
        console.warn('[convex-auth]', lastConvexTokenError);
      }
      return null;
    }

    await new Promise((r) => setTimeout(r, RETRY_MS * Math.min(attemptNo, 4)));
    return attempt(attemptNo + 1);
  };

  return attempt(1);
}

export function useAuthForConvex() {
  const { isLoaded, isSignedIn, getToken, sessionClaims } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const sessionClaimsRef = useRef(sessionClaims);
  sessionClaimsRef.current = sessionClaims;
  const [authEpoch, setAuthEpoch] = useState(authRefetchEpoch);

  useEffect(() => {
    const sync = () => setAuthEpoch(authRefetchEpoch);
    authRefetchListeners.add(sync);
    return () => {
      authRefetchListeners.delete(sync);
    };
  }, []);

  const prevSignedInRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn) {
      lastGoodConvexToken = null;
      lastConvexTokenError = null;
      forceRefreshRef.current = 0;
      convexSessionEstablished = false;
      prevSignedInRef.current = false;
      return;
    }

    if (!prevSignedInRef.current) {
      // Fresh Clerk session — bypass SecureStore token cache and reconnect Convex.
      prevSignedInRef.current = true;
      retryConvexAuth({ resetPhase: true });
    }
  }, [isSignedIn]);

  const fetchAccessToken = useCallback(async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
    const getToken = (opts?: { template?: string; skipCache?: boolean }) => getTokenRef.current(opts);

    const manualRefresh = forceRefreshRef.current > 0;
    if (manualRefresh) {
      forceRefreshRef.current = 0;
    }
    const refresh = forceRefreshToken || manualRefresh;

    if (!refresh) {
      lastConvexTokenError = null;
      if (lastGoodConvexToken && isTokenValid(lastGoodConvexToken)) {
        const cachedErr = validateConvexJwt(lastGoodConvexToken, true);
        if (!cachedErr) return lastGoodConvexToken;
        lastGoodConvexToken = null;
      }
    } else {
      lastConvexTokenError = null;
      lastGoodConvexToken = null;
    }

    return fetchConvexTokenWithRetry(
      getToken,
      refresh,
      sessionClaimsRef.current as Record<string, unknown> | null | undefined,
    );
  }, []);

  return useMemo(
    () => ({
      isLoading: !isLoaded,
      isAuthenticated: isSignedIn ?? false,
      fetchAccessToken,
      authEpoch,
    }),
    [isLoaded, isSignedIn, fetchAccessToken, authEpoch],
  );
}
