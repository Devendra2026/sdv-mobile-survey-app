/** Whether a JWT `aud` claim targets Convex. */
export function audIncludesConvex(aud: unknown): boolean {
  if (aud === 'convex') return true;
  if (Array.isArray(aud)) return aud.some((v) => v === 'convex');
  return false;
}

export function sessionClaimsHaveConvexAud(claims: Record<string, unknown> | null | undefined): boolean {
  return audIncludesConvex(claims?.aud);
}

/** Decode JWT payload (no signature verification — used only to pick token source). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function tokenHasConvexAud(token: string): boolean {
  return sessionClaimsHaveConvexAud(decodeJwtPayload(token));
}

/** JWT `exp` in ms, or null when missing or invalid. */
export function tokenExpiresAtMs(token: string): number | null {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === 'number' ? exp * 1000 : null;
}

/** True when the token is still valid for Convex (default 60s skew). */
export function isTokenValid(token: string, skewMs = 60_000): boolean {
  const expMs = tokenExpiresAtMs(token);
  if (expMs === null) return true;
  return Date.now() < expMs - skewMs;
}
