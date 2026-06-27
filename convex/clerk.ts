/**
 * Development Clerk instance fallback only.
 * Production deployments MUST set `CLERK_JWT_ISSUER_DOMAIN` via `npm run deploy:backend`
 * (see scripts/sync-clerk-issuer.mjs). Never rely on this value in production.
 */
export const CLERK_JWT_ISSUER_DOMAIN = "https://clerk.sdvedutech.in";
