/**
 * Ensure mobile EAS env, Convex JWT issuer, and web Clerk keys use the same Clerk app.
 *
 * Usage:
 *   node ./scripts/verify-clerk-convex.mjs           # dev: .env.local + EAS preview vs dev Clerk
 *   node ./scripts/verify-clerk-convex.mjs --prod    # prod: .env.prod + web .env.production + EAS
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseEnvFile } from './read-env-file.mjs';

const isProd = process.argv.includes('--prod');
let failed = false;

function fail(msg) {
  console.error(`[verify-clerk-convex] ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`[verify-clerk-convex] OK — ${msg}`);
}

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

function readConvexIssuer(webRoot, useProductionEnv) {
  const envFileName = useProductionEnv ? '.env.production' : '.env.local';
  const envFilePath = path.join(webRoot, envFileName);
  if (!existsSync(envFilePath)) {
    throw new Error(`Missing ${envFilePath}`);
  }
  // --env-file avoids loading .env.local CONVEX_DEPLOYMENT alongside self-hosted prod keys.
  return execSync(`npx convex env get CLERK_JWT_ISSUER_DOMAIN --env-file ${envFileName}`, {
    encoding: 'utf8',
    cwd: webRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

const surveyRoot = process.cwd();
const webRoot = path.join(surveyRoot, '..', 'sdv-front-new-app');
const webProdEnvPath = path.join(webRoot, '.env.production');
const fleetEnvPath = isProd
  ? path.join(surveyRoot, '.env.prod')
  : path.join(surveyRoot, '.env.local');
const fleetEnvName = isProd ? '.env.prod' : '.env.local';

if (!isProd && !existsSync(fleetEnvPath)) {
  fail('survey-app/.env.local missing — copy from README for dev alignment checks');
}

const mobilePk = parseEnvFile(fleetEnvPath).EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? null;
const mobileIssuer = parseEnvFile(fleetEnvPath).CLERK_JWT_ISSUER_DOMAIN ?? null;

const webEnvPath = isProd ? webProdEnvPath : path.join(webRoot, '.env.local');
const webEnv = parseEnvFile(webEnvPath);
const webPk = webEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? null;
const webIssuer = webEnv.CLERK_JWT_ISSUER_DOMAIN ?? null;
const webEnvLabel = isProd ? '.env.production' : '.env.local';

if (isProd && !existsSync(webProdEnvPath)) {
  fail('sdv-front-new-app/.env.production missing');
}

if (isProd && mobilePk?.startsWith('pk_test_')) {
  fail('.env.prod still uses pk_test_ — set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_…');
} else if (isProd && mobilePk?.startsWith('pk_live_')) {
  ok('.env.prod uses Clerk production key (pk_live_…)');
}

const easEnvironment = isProd ? 'preview' : 'preview';
let easPk = null;
try {
  const easOut = execSync(`npx eas-cli env:list --environment ${easEnvironment}`, {
    encoding: 'utf8',
    cwd: surveyRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const easLine = easOut.split('\n').find((line) => line.startsWith('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY='));
  easPk = easLine?.slice('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY='.length).trim() ?? null;
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (isProd) {
    fail(`Could not read EAS ${easEnvironment} env: ${msg}`);
  } else {
    console.warn(`[verify-clerk-convex] Could not read EAS ${easEnvironment} env (skipped in dev): ${msg}`);
  }
}

let convexIssuer = null;
if (isProd) {
  try {
    convexIssuer = readConvexIssuer(webRoot, true);
  } catch (err) {
    fail(
      `Could not read Convex CLERK_JWT_ISSUER_DOMAIN: ${err instanceof Error ? err.message : err}\n` +
      `  cd ../sdv-front-new-app && npm run sync:clerk:prod`,
    );
  }
} else {
  try {
    convexIssuer = readConvexIssuer(webRoot, false);
  } catch {
    console.warn(
      '[verify-clerk-convex] Skipping Convex issuer check (no CONVEX_DEPLOYMENT / self-hosted env for dev)',
    );
  }
}

const targetPk = isProd ? mobilePk : easPk;
const targetIssuer = targetPk ? clerkIssuerFromPublishableKey(targetPk) : null;

if (targetIssuer && convexIssuer && targetIssuer !== convexIssuer) {
  fail(
    `Convex issuer (${convexIssuer}) does not match ${isProd ? 'fleet' : 'EAS'} Clerk (${targetIssuer}).\n` +
    `  cd ../sdv-front-new-app && npm run sync:clerk:prod`,
  );
} else if (targetIssuer && convexIssuer) {
  ok(`Convex issuer matches ${isProd ? 'production' : 'EAS'} Clerk (${convexIssuer})`);
}

if (isProd && mobilePk && easPk && mobilePk !== easPk) {
  fail(`${fleetEnvName} Clerk key does not match EAS ${easEnvironment}`);
} else if (isProd && mobilePk && easPk) {
  ok(`${fleetEnvName} matches EAS ${easEnvironment} Clerk key`);
}

if (isProd && webPk && mobilePk && webPk !== mobilePk) {
  fail('Web .env.production and survey-app .env.prod use different Clerk publishable keys');
} else if (isProd && webPk && mobilePk) {
  ok('Web .env.production and .env.prod use the same Clerk publishable key');
}

if (!isProd && webPk && mobilePk) {
  const webIssuerFromPk = clerkIssuerFromPublishableKey(webPk);
  const mobileIssuerFromPk = clerkIssuerFromPublishableKey(mobilePk);
  if (webIssuerFromPk !== mobileIssuerFromPk) {
    fail(
      `Web and mobile dev use different Clerk instances.\n` +
      `  Web: ${webIssuerFromPk}\n` +
      `  Mobile: ${mobileIssuerFromPk}`,
    );
  } else {
    ok('Web .env.local and survey-app .env.local use the same Clerk app');
  }
} else if (!isProd && webPk && easPk) {
  const webIssuerFromPk = clerkIssuerFromPublishableKey(webPk);
  const easIssuer = clerkIssuerFromPublishableKey(easPk);
  if (webIssuerFromPk !== easIssuer) {
    fail(
      `Web app uses a different Clerk instance than mobile/EAS.\n` +
      `  Web: ${webIssuerFromPk ?? webPk.slice(0, 20)}…\n` +
      `  Mobile/EAS: ${easIssuer ?? 'invalid'}\n` +
      `  Update sdv-front-new-app/.env.local to match survey-app dev keys.`,
    );
  } else {
    ok('Web .env.local uses the same Clerk app as mobile/EAS');
  }
} else if (!isProd && webPk && easPk === null) {
  ok('Web .env.local present (EAS not checked)');
} else if (!isProd && !webPk) {
  fail('sdv-front-new-app/.env.local missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
}

if (isProd && webIssuer && mobileIssuer && webIssuer !== mobileIssuer) {
  fail(`Web issuer (${webIssuer}) does not match .env.prod CLERK_JWT_ISSUER_DOMAIN (${mobileIssuer})`);
} else if (isProd && webIssuer && mobileIssuer) {
  ok(`Fleet and web production issuer (${webIssuer})`);
}

if (webIssuer && convexIssuer && webIssuer !== convexIssuer) {
  fail(`Web ${webEnvLabel} CLERK_JWT_ISSUER_DOMAIN (${webIssuer}) does not match Convex (${convexIssuer})`);
}

if (failed) {
  console.error('\n[verify-clerk-convex] Fix Clerk/Convex alignment, then rebuild the APK.\n');
  process.exit(1);
}

console.log(`\n[verify-clerk-convex] Clerk + Convex integration is aligned (${isProd ? 'production' : 'development'}).\n`);
