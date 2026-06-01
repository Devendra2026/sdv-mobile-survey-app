/**
 * Ensure mobile EAS env, Convex JWT issuer, and (optionally) web .env.local use the same Clerk app.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

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

function readEnvFile(filePath, key) {
  if (!existsSync(filePath)) return null;
  const text = readFileSync(filePath, 'utf8');
  const re = new RegExp(`^${key}=(.+)$`, 'm');
  return text.match(re)?.[1]?.trim() ?? null;
}

const surveyRoot = process.cwd();
const webRoot = path.join(surveyRoot, '..', 'sdv-front-new-app');

const mobilePk =
  readEnvFile(path.join(surveyRoot, '.env.local'), 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY') ?? null;
const webPk =
  readEnvFile(path.join(webRoot, '.env.local'), 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') ?? null;
const webIssuer = readEnvFile(path.join(webRoot, '.env.local'), 'CLERK_JWT_ISSUER_DOMAIN') ?? null;

let easPk = null;
try {
  const easOut = execSync('npx eas env:list --environment preview', {
    encoding: 'utf8',
    cwd: surveyRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const easLine = easOut.split('\n').find((line) => line.startsWith('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY='));
  easPk = easLine?.slice('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY='.length).trim() ?? null;
} catch (err) {
  fail(`Could not read EAS preview env: ${err instanceof Error ? err.message : err}`);
}

let convexIssuer = null;
try {
  convexIssuer = execSync('npx convex env get CLERK_JWT_ISSUER_DOMAIN', {
    encoding: 'utf8',
    cwd: webRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
} catch (err) {
  fail(`Could not read Convex CLERK_JWT_ISSUER_DOMAIN: ${err instanceof Error ? err.message : err}`);
}

if (easPk) {
  const easIssuer = clerkIssuerFromPublishableKey(easPk);
  if (!easIssuer) {
    fail('EAS EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not a valid Clerk key');
  } else if (convexIssuer && easIssuer !== convexIssuer) {
    fail(
      `Convex issuer (${convexIssuer}) does not match EAS Clerk key (${easIssuer}).\n` +
      `  cd ../sdv-front-new-app && npx convex env set CLERK_JWT_ISSUER_DOMAIN "${easIssuer}"`,
    );
  } else if (convexIssuer) {
    ok(`Convex issuer matches EAS Clerk (${convexIssuer})`);
  }
}

if (mobilePk && easPk && mobilePk !== easPk) {
  fail('survey-app .env.local Clerk key does not match EAS preview');
} else if (mobilePk && easPk) {
  ok('survey-app .env.local matches EAS preview Clerk key');
}

if (webPk && easPk) {
  const webIssuerFromPk = clerkIssuerFromPublishableKey(webPk);
  const easIssuer = clerkIssuerFromPublishableKey(easPk);
  if (webIssuerFromPk !== easIssuer) {
    fail(
      `Web app uses a different Clerk instance than mobile/EAS.\n` +
      `  Web: ${webIssuerFromPk ?? webPk.slice(0, 20)}…\n` +
      `  Mobile/EAS: ${easIssuer ?? 'invalid'}\n` +
      `  Update sdv-front-new-app/.env.local:\n` +
      `    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<same pk_live as survey-app>\n` +
      `    CLERK_JWT_ISSUER_DOMAIN=${easIssuer ?? 'https://clerk.sdvedutech.in'}`,
    );
  } else {
    ok('Web .env.local uses the same Clerk app as mobile/EAS');
  }
} else if (webPk && easPk === null) {
  ok('Web .env.local present (EAS not checked)');
} else if (!webPk) {
  fail('sdv-front-new-app/.env.local missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
}

if (webIssuer && convexIssuer && webIssuer !== convexIssuer) {
  fail(`Web CLERK_JWT_ISSUER_DOMAIN (${webIssuer}) does not match Convex deployment (${convexIssuer})`);
}

if (failed) {
  console.error('\n[verify-clerk-convex] Fix Clerk/Convex alignment, then rebuild the APK.\n');
  process.exit(1);
}

console.log('\n[verify-clerk-convex] Clerk + Convex integration is aligned.\n');
