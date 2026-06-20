/**
 * Development Clerk instance fallback only.
 * Production deployments MUST set `CLERK_JWT_ISSUER_DOMAIN` via deploy scripts.
 */
export const CLERK_JWT_ISSUER_DEV_FALLBACK = 'https://organic-halibut-21.clerk.accounts.dev';

export function resolveClerkJwtIssuer(): string {
  const fromEnv = process.env.CLERK_JWT_ISSUER_DOMAIN?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'CLERK_JWT_ISSUER_DOMAIN is required in production. Run npm run verify:clerk-convex before deploy.',
    );
  }
  return CLERK_JWT_ISSUER_DEV_FALLBACK;
}

/** @deprecated Use resolveClerkJwtIssuer — kept for imports that expect a string constant. */
export const CLERK_JWT_ISSUER_DOMAIN = CLERK_JWT_ISSUER_DEV_FALLBACK;
