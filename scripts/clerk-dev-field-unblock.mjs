/**
 * Unblock fleet sign-in on Clerk development instances when the 100 emails/month
 * cap is hit. Client Trust on new APK installs sends email codes; this script
 * sets bypass_client_trust on field users so password sign-in completes without email.
 *
 * Requires CLERK_SECRET_KEY (sk_test_…) from ../sdv-front-new-app/.env.local or env.
 *
 * Usage:
 *   node ./scripts/clerk-dev-field-unblock.mjs
 *   node ./scripts/clerk-dev-field-unblock.mjs --email user@example.com
 *   node ./scripts/clerk-dev-field-unblock.mjs --all-fleet
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CLERK_API = 'https://api.clerk.com/v1';
const WEB_ROOT = path.join(process.cwd(), '..', 'sdv-front-new-app');
const DEFAULT_EMAILS = ['tarundkt1984@gmail.com'];

let failed = false;

function fail(msg) {
  console.error(`[clerk-dev-field-unblock] FAIL — ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`[clerk-dev-field-unblock] OK — ${msg}`);
}

function readEnvFile(filePath, key) {
  if (!existsSync(filePath)) return null;
  const text = readFileSync(filePath, 'utf8');
  const re = new RegExp(`^${key}=(.+)$`, 'm');
  return text.match(re)?.[1]?.trim() ?? null;
}

function resolveSecretKey() {
  const fromEnv = process.env.CLERK_SECRET_KEY?.trim();
  if (fromEnv) return fromEnv;
  return readEnvFile(path.join(WEB_ROOT, '.env.local'), 'CLERK_SECRET_KEY');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const emails = [];
  let allFleet = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--all-fleet') {
      allFleet = true;
    } else if (arg === '--email' && args[i + 1]) {
      emails.push(args[i + 1].trim().toLowerCase());
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  node ./scripts/clerk-dev-field-unblock.mjs [--email user@example.com] [--all-fleet]

  --email     Repeatable. Field user email(s) to unblock.
  --all-fleet List users with public_metadata.role surveyor|admin and unblock each.

  Default emails when none given: ${DEFAULT_EMAILS.join(', ')}`);
      process.exit(0);
    }
  }

  if (emails.length === 0 && !allFleet) {
    emails.push(...DEFAULT_EMAILS);
  }

  return { emails, allFleet };
}

async function clerkFetch(secretKey, pathname, options = {}) {
  const response = await fetch(`${CLERK_API}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && Array.isArray(body.errors)
        ? body.errors.map((e) => e.long_message ?? e.message).join('; ')
        : typeof body === 'string'
          ? body
          : JSON.stringify(body);
    throw new Error(`${response.status} ${pathname}: ${detail}`);
  }

  return body;
}

function primaryEmail(user) {
  const id = user.primary_email_address_id;
  const match = user.email_addresses?.find((e) => e.id === id);
  return match?.email_address ?? user.email_addresses?.[0]?.email_address ?? null;
}

function emailVerified(user) {
  const id = user.primary_email_address_id;
  const match = user.email_addresses?.find((e) => e.id === id) ?? user.email_addresses?.[0];
  return match?.verification?.status === 'verified';
}

async function listUsersByEmail(secretKey, email) {
  const params = new URLSearchParams();
  params.append('email_address', email);
  params.append('limit', '10');
  const data = await clerkFetch(secretKey, `/users?${params.toString()}`);
  return data ?? [];
}

async function listFleetUsers(secretKey) {
  const data = await clerkFetch(secretKey, '/users?limit=100&order_by=-created_at');
  return (data ?? []).filter((user) => {
    const role = user.public_metadata?.role;
    return role === 'surveyor' || role === 'admin' || role === 'super_admin';
  });
}

async function unblockUser(secretKey, user) {
  const email = primaryEmail(user);
  const verified = emailVerified(user);
  const hasPassword = user.password_enabled === true;

  if (!verified) {
    fail(`${email ?? user.id}: primary email is not verified — verify in Clerk Dashboard → Users`);
  } else {
    ok(`${email ?? user.id}: email verified`);
  }

  if (!hasPassword) {
    fail(`${email ?? user.id}: password not enabled — set password in Clerk Dashboard`);
  } else {
    ok(`${email ?? user.id}: password enabled`);
  }

  if (user.bypass_client_trust === true) {
    ok(`${email ?? user.id}: already bypasses Client Trust`);
    return user;
  }

  const updated = await clerkFetch(secretKey, `/users/${user.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ bypass_client_trust: true }),
  });

  ok(`${email ?? user.id}: bypass_client_trust enabled — new-device sign-in skips email codes`);
  return updated;
}

function printDashboardSteps() {
  console.log(`
[clerk-dev-field-unblock] Clerk Dashboard steps (instance-wide, recommended for all fleet testers):

  1. Open https://dashboard.clerk.com → development instance (organic-halibut-21)
  2. Configure → Attack protection → Client Trust → Disable
     (stops email codes on every new APK install; acceptable for internal field testing)
  3. If sign-in still fails with email limit: contact Clerk support for a dev quota increase
     https://clerk.com/docs/guides/development/testing/test-emails-and-phones

  Long-term: migrate fleet APKs to pk_live_ production Clerk (see README.md § Clerk dev email limit).
`);
}

async function main() {
  const secretKey = resolveSecretKey();
  if (!secretKey) {
    fail('CLERK_SECRET_KEY missing. Set it in ../sdv-front-new-app/.env.local or the environment.');
    process.exit(1);
  }
  if (!secretKey.startsWith('sk_test_')) {
    fail('This script is for Clerk development instances only (sk_test_…). Use Dashboard for production.');
    process.exit(1);
  }

  const { emails, allFleet } = parseArgs();
  const users = new Map();

  for (const email of emails) {
    const found = await listUsersByEmail(secretKey, email);
    if (found.length === 0) {
      fail(`No Clerk user for ${email} — create the user in Dashboard or web admin first`);
      continue;
    }
    for (const user of found) {
      users.set(user.id, user);
    }
  }

  if (allFleet) {
    const fleet = await listFleetUsers(secretKey);
    if (fleet.length === 0) {
      console.warn('[clerk-dev-field-unblock] No users with surveyor/admin role in public_metadata');
    }
    for (const user of fleet) {
      users.set(user.id, user);
    }
  }

  if (users.size === 0) {
    fail('No users to unblock');
    printDashboardSteps();
    process.exit(1);
  }

  for (const user of users.values()) {
    try {
      await unblockUser(secretKey, user);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }

  printDashboardSteps();

  if (failed) {
    console.error('\n[clerk-dev-field-unblock] Fix the issues above, then retry sign-in on the fleet APK.\n');
    process.exit(1);
  }

  console.log('[clerk-dev-field-unblock] Done. Retry sign-in on the fleet APK (no email code expected for unblocked users).\n');
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
