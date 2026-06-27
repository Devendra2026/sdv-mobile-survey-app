/**
 * Verify the Clerk Frontend API host (from fleet publishable key) is reachable over HTTPS.
 * Fails pre-build when custom-domain SSL/TLS is broken — the mobile SDK cannot initialize.
 *
 * Usage:
 *   node ./scripts/verify-clerk-reachability.mjs
 */
import { existsSync } from 'node:fs';
import { parseEnvFile, resolveFleetEnvPath } from './read-env-file.mjs';

const TIMEOUT_MS = 15_000;
let failed = false;

function fail(msg) {
  console.error(`[verify-clerk-reachability] ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`[verify-clerk-reachability] OK — ${msg}`);
}

function clerkHostFromPublishableKey(pk) {
  const match = pk.trim().match(/^pk_(?:test|live)_(.+)$/);
  if (!match) return null;
  try {
    return Buffer.from(match[1], 'base64').toString('utf8').replace(/\$$/, '');
  } catch {
    return null;
  }
}

const envPath = resolveFleetEnvPath(process.cwd());
const envName = envPath.endsWith('.env.prod') ? '.env.prod' : '.env.local';

if (!existsSync(envPath)) {
  fail(`Missing ${envName} — copy .env.prod.example to .env.prod`);
  process.exit(1);
}

const env = parseEnvFile(envPath);
const pk = env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
if (!pk) {
  fail(`${envName} missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`);
  process.exit(1);
}

const host = clerkHostFromPublishableKey(pk);
if (!host) {
  fail('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not a valid Clerk publishable key');
  process.exit(1);
}

const url = `https://${host}/v1/client`;
const isCustomDomain = !host.endsWith('.clerk.accounts.dev');

let result;
try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, method: 'GET' });
    result = { status: res.status, ok: res.ok };
  } finally {
    clearTimeout(timer);
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : '';
  const detail = [message, cause].filter(Boolean).join(' — ');

  fail(
    `Cannot reach Clerk at ${url}\n` +
    `  Error: ${detail}\n` +
    (isCustomDomain
      ? '  Custom domain SSL/TLS is likely misconfigured (the app only calls HTTPS — no CDN in the APK).\n' +
      '    • Clerk Dashboard → Domains → verify Active + valid certificate\n' +
      '    • DNS CNAME must match Clerk instructions (frontend-api.clerk.services)\n' +
      '    • If DNS is proxied, use end-to-end HTTPS (not HTTP-to-origin)\n' +
      '    • Wait for certificate provisioning, then re-run this script\n' +
      '  See: sdv-front-new-app/docs/clerk-production-dashboard.md §1'
      : '  Check network connectivity and Clerk instance status.'),
  );
  process.exit(1);
}

if (!result.ok && result.status !== 401 && result.status !== 403) {
  fail(`Clerk ${url} returned HTTP ${result.status} (expected 2xx or 401/403)`);
} else {
  ok(`Clerk Frontend API reachable at ${host} (HTTP ${result.status})`);
}

if (failed) {
  console.error('\n[verify-clerk-reachability] Fix Clerk domain reachability before building/distributing APKs.\n');
  process.exit(1);
}

console.log('\n[verify-clerk-reachability] Clerk host is reachable.\n');
