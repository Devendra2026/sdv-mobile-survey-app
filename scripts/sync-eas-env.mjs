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
const expoPublicKeys = Object.keys(env).filter((k) => k.startsWith('EXPO_PUBLIC_'));

if (expoPublicKeys.length === 0) {
  console.error('[sync-eas-env] .env.prod has no EXPO_PUBLIC_* variables.');
  process.exit(1);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const synced = [];

for (const key of expoPublicKeys.sort()) {
  const value = env[key];
  console.log(`[sync-eas-env] ${environment} ← ${key}`);
  const result = spawnSync(
    npx,
    ['eas-cli', 'env:update', environment, '--variable-name', key, '--value', value, '--non-interactive'],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
  synced.push(key);
}

console.log(`\n[sync-eas-env] Updated ${synced.length} variable(s) on EAS "${environment}".`);
console.log(
  `  Run: npm run verify:clerk-convex && npm run eas:build:android:${environment === 'preview' ? 'preview' : 'production'}\n`,
);
