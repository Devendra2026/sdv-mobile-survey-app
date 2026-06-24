/**
 * Validate `.env.prod` (or `.env.local` fallback) before syncing to EAS / building fleet APKs.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnvFile, resolveFleetEnvPath } from './read-env-file.mjs';

const REQUIRED_EXPO_PUBLIC = [
  'EXPO_PUBLIC_CONVEX_URL',
  'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
];

const MAPS_KEYS = [
  'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY',
  'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
];

let failed = false;

function fail(msg) {
  console.error(`[verify:env-prod] ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`[verify:env-prod] OK — ${msg}`);
}

function isValidHttpsUrl(url) {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' && u.hostname.length > 0;
  } catch {
    return false;
  }
}

const cwd = process.cwd();
const envPath = resolveFleetEnvPath(cwd);
const envName = envPath.endsWith('.env.prod') ? '.env.prod' : '.env.local';

if (!existsSync(envPath)) {
  fail('Missing .env.prod — copy .env.prod.example to .env.prod and fill in values.');
  process.exit(1);
}

const env = parseEnvFile(envPath);

for (const key of REQUIRED_EXPO_PUBLIC) {
  if (!env[key]?.trim()) {
    fail(`${envName} missing ${key}`);
  }
}

const convexUrl = env.EXPO_PUBLIC_CONVEX_URL?.trim();
if (convexUrl && !isValidHttpsUrl(convexUrl)) {
  fail(`${envName} EXPO_PUBLIC_CONVEX_URL is not a valid https URL`);
} else if (convexUrl) {
  ok(`Convex URL (${convexUrl})`);
}

const clerkPk = env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
const clerkIssuer = env.CLERK_JWT_ISSUER_DOMAIN?.trim();

function clerkIssuerFromPublishableKey(pk) {
  const match = pk.trim().match(/^pk_(?:test|live)_(.+)$/);
  if (!match) return null;
  try {
    const host = Buffer.from(match[1], 'base64').toString('utf8').replace(/\$$/, '');
    return `https://${host}`;
  } catch {
    return null;
  }
}

if (clerkPk && !/^pk_(test|live)_/.test(clerkPk)) {
  fail(`${envName} EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not a valid Clerk key`);
} else if (clerkPk?.startsWith('pk_test_')) {
  console.warn(
    '[verify:env-prod] Using Clerk development key (pk_test_…) — fleet sign-in is capped at 100 emails/month. Use pk_live_… for production rollout.',
  );
} else if (clerkPk) {
  ok('Clerk production key (pk_live_…)');
}

if (clerkPk && clerkIssuer) {
  const pkIssuer = clerkIssuerFromPublishableKey(clerkPk);
  if (pkIssuer && pkIssuer !== clerkIssuer) {
    fail(
      `${envName} CLERK_JWT_ISSUER_DOMAIN (${clerkIssuer}) does not match publishable key (${pkIssuer})`,
    );
  } else if (pkIssuer) {
    ok(`Clerk issuer matches publishable key (${clerkIssuer})`);
  }
}

const mapsKey = MAPS_KEYS.map((k) => env[k]?.trim()).find(Boolean);
if (!mapsKey) {
  fail(
    `${envName} missing EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY (or EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) — required for GPS map preview`,
  );
} else {
  ok('Google Maps Android key present');
}

if (env.CONVEX_SELF_HOSTED_ADMIN_KEY && !env.CONVEX_SELF_HOSTED_URL) {
  fail(`${envName} has CONVEX_SELF_HOSTED_ADMIN_KEY but missing CONVEX_SELF_HOSTED_URL (CLI deploy only)`);
}

if (failed) {
  console.error('\n[verify:env-prod] Fix .env.prod, then run: npm run env:sync:preview\n');
  process.exit(1);
}

console.log(`\n[verify:env-prod] ${envName} is ready for EAS sync.\n`);
