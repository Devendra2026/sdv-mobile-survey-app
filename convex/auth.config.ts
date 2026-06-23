/**
 * Authentication configuration.
 *
 * Convex validates incoming JWTs against the providers listed here. The
 * mobile app uses `@clerk/expo` to mint tokens with the `convex` template;
 * each request carries that JWT, verified against Clerk's JWKS endpoint.
 *
 * Prefer `CLERK_JWT_ISSUER_DOMAIN` on the deployment (`npm run deploy` syncs
 * it from `.env.local`). The fallback keeps auth working if the env var was
 * never set on a deployment (common cause of "Convex + Clerk not linked").
 */

import { CLERK_JWT_ISSUER_DOMAIN } from "./clerk";

/** Deployment env wins at push time; `clerk.ts` is the repo fallback. */
const issuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN?.trim() || CLERK_JWT_ISSUER_DOMAIN;

export default {
  providers: [
    {
      domain: issuerDomain,
      applicationID: "convex",
    },
  ],
};
