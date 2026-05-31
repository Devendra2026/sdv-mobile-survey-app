import { decodeBase64Utf8 } from '@/utils/jwt';

/** Clerk Frontend API host from a publishable key (e.g. `ruling-jaybird-38.clerk.accounts.dev`). */
export function clerkFrontendApiFromPublishableKey(publishableKey: string): string | null {
  const match = publishableKey.trim().match(/^pk_(?:test|live)_(.+)$/);
  if (!match) return null;
  const decoded = decodeBase64Utf8(match[1]);
  if (!decoded) return null;
  return decoded.replace(/\$$/, '');
}

/** OIDC issuer URL Convex expects for JWTs from this Clerk app. */
export function clerkJwtIssuerFromPublishableKey(publishableKey: string): string | null {
  const host = clerkFrontendApiFromPublishableKey(publishableKey);
  if (!host) return null;
  return `https://${host}`;
}
