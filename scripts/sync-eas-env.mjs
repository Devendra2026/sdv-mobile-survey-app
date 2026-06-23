/**
 * Push EXPO_PUBLIC_* vars from `.env.prod` into an EAS Environment (preview | production).
 * APK builds read these at compile time — local .env.prod is not uploaded to EAS workers.
 *
 * Usage: node ./scripts/sync-eas-env.mjs preview
 *        node ./scripts/sync-eas-env.mjs production
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnvFile } from './read-env-file.mjs';

const environment = process.argv[2]?.trim();
const ALLOWED = new Set(['preview', 'production']);

/** Vars compiled into the APK — do not sync CLI-only or unused EXPO_PUBLIC_* keys. */
const APK_EXPO_PUBLIC_KEYS = [
  'EXPO_PUBLIC_CONVEX_URL',
  'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY',
  'EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY',
  'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
];

if (!environment || !ALLOWED.has(environment)) {
  console.error('Usage: node ./scripts/sync-eas-env.mjs <preview|production>');
  process.exit(1);
}

const envPath = join(process.cwd(), '.env.prod');
if (!existsSync(envPath)) {
  console.error('[sync-eas-env] Missing .env.prod — copy .env.prod.example first.');
  process.exit(1);
}

const env = parseEnvFile(envPath);
const keysToSync = APK_EXPO_PUBLIC_KEYS.filter((k) => env[k]?.trim());

if (keysToSync.length === 0) {
  console.error('[sync-eas-env] .env.prod has no APK EXPO_PUBLIC_* variables to sync.');
  process.exit(1);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const synced = [];

function upsertEasEnv(key, value) {
  const update = spawnSync(
    npx,
    ['eas-cli', 'env:update', environment, '--variable-name', key, '--value', value, '--non-interactive'],
    { encoding: 'utf8', shell: process.platform === 'win32' },
  );
  if ((update.status ?? 1) === 0) return update;

  const detail = `${update.stderr ?? ''}${update.stdout ?? ''}`;
  if (!detail.includes('does not exist')) {
    if (update.stdout) process.stdout.write(update.stdout);
    if (update.stderr) process.stderr.write(update.stderr);
    return update;
  }

  return spawnSync(
    npx,
    [
      'eas-cli',
      'env:create',
      '--name',
      key,
      '--value',
      value,
      '--environment',
      environment,
      '--visibility',
      'plaintext',
      '--non-interactive',
    ],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
}

for (const key of keysToSync) {
  const value = env[key].trim();
  console.log(`[sync-eas-env] ${environment} ← ${key}`);
  const result = upsertEasEnv(key, value);
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
  synced.push(key);
}

console.log(`\n[sync-eas-env] Updated ${synced.length} variable(s) on EAS "${environment}".`);
console.log(
  `  Run: npm run verify:clerk-convex && npm run eas:build:android:${environment === 'preview' ? 'preview' : 'production'}\n`,
);
