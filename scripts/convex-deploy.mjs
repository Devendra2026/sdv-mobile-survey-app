/**
 * Deploy Convex to production and sync auth env from `.env.local`.
 * Prevents prod JWT validation failures when CLERK_JWT_ISSUER_DOMAIN exists locally
 * but was never pushed to the prod deployment.
 */
import { execSync } from "node:child_process";
import { loadEnvLocal } from "./load-env-local.mjs";

loadEnvLocal();

function syncProdEnv(key) {
  const value = process.env[key];
  if (!value) return;
  console.log(`[deploy] Setting prod env ${key}…`);
  execSync(`npx convex env set ${key} "${value.replace(/"/g, '\\"')}" --prod`, {
    stdio: "inherit",
    env: process.env,
  });
}

for (const key of ["CLERK_JWT_ISSUER_DOMAIN", "CLERK_WEBHOOK_SECRET"]) {
  syncProdEnv(key);
}

console.log("[deploy] Running convex deploy…");
execSync("npx convex deploy", { stdio: "inherit", env: process.env });
