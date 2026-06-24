/**
 * Provision a field surveyor/supervisor on Clerk development when sign-up email
 * OTP is blocked (100 emails/month cap). Creates a verified user with password,
 * requestedRole metadata, and bypass_client_trust — no APK rebuild required.
 *
 * Requires CLERK_SECRET_KEY (sk_test_…) from ../sdv-front-new-app/.env.local or env.
 *
 * Usage:
 *   node ./scripts/clerk-dev-provision-field-user.mjs --email user@example.com --name "Full Name" --password "secret"
 *   node ./scripts/clerk-dev-provision-field-user.mjs --email user@example.com --name Bharat --password "secret" --role surveyor
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CLERK_API = 'https://api.clerk.com/v1';
const WEB_ROOT = path.join(process.cwd(), '..', 'sdv-front-new-app');
const ALLOWED_ROLES = new Set(['surveyor', 'supervisor']);

let failed = false;

function fail(msg) {
  console.error(`[clerk-dev-provision-field-user] FAIL — ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`[clerk-dev-provision-field-user] OK — ${msg}`);
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
  let email = '';
  let name = '';
  let password = '';
  let role = 'surveyor';

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--email' && args[i + 1]) {
      email = args[i + 1].trim().toLowerCase();
      i += 1;
    } else if (arg === '--name' && args[i + 1]) {
      name = args[i + 1].trim();
      i += 1;
    } else if (arg === '--password' && args[i + 1]) {
      password = args[i + 1];
      i += 1;
    } else if (arg === '--role' && args[i + 1]) {
      role = args[i + 1].trim().toLowerCase();
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  node ./scripts/clerk-dev-provision-field-user.mjs --email user@example.com --name "Full Name" --password "secret" [--role surveyor|supervisor]

  Creates a Clerk dev user with verified email, password, unsafe_metadata.requestedRole,
  and bypass_client_trust. User should Sign In (not Sign Up) on the fleet APK.`);
      process.exit(0);
    }
  }

  return { email, name, password, role };
}

function splitName(full) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Field', lastName: undefined };
  if (parts.length === 1) return { firstName: parts[0], lastName: undefined };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
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

async function listUsersByEmail(secretKey, email) {
  const params = new URLSearchParams();
  params.append('email_address', email);
  params.append('limit', '10');
  return (await clerkFetch(secretKey, `/users?${params.toString()}`)) ?? [];
}

function primaryEmail(user) {
  const id = user.primary_email_address_id;
  const match = user.email_addresses?.find((e) => e.id === id);
  return match?.email_address ?? user.email_addresses?.[0]?.email_address ?? null;
}

async function provisionUser(secretKey, { email, name, password, role }) {
  const existing = await listUsersByEmail(secretKey, email);
  if (existing.length > 0) {
    const user = existing[0];
    ok(`${primaryEmail(user) ?? user.id}: already exists — patching bypass_client_trust + metadata`);
    return clerkFetch(secretKey, `/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        bypass_client_trust: true,
        unsafe_metadata: { ...(user.unsafe_metadata ?? {}), requestedRole: role },
      }),
    });
  }

  const { firstName, lastName } = splitName(name);
  const payload = {
    email_address: [email],
    password,
    first_name: firstName,
    skip_password_checks: true,
    unsafe_metadata: { requestedRole: role },
    bypass_client_trust: true,
  };
  if (lastName) payload.last_name = lastName;

  return clerkFetch(secretKey, '/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function printNextSteps(email) {
  console.log(`
[clerk-dev-provision-field-user] Next steps:

  1. Clerk Dashboard → development instance → Configure → Attack protection → Client Trust → Disable
     (instance-wide; no API — stops email codes on new APK installs for all users)
  2. Tell ${email} to use Sign In (not Sign Up) on the installed fleet APK.
  3. Web admin → Approvals → approve the pending user (Convex webhook creates pending_approval row).
  4. Optional: npm run clerk:unblock-field-user -- --email ${email}
`);
}

async function main() {
  const secretKey = resolveSecretKey();
  if (!secretKey) {
    fail('CLERK_SECRET_KEY missing. Set it in ../sdv-front-new-app/.env.local or the environment.');
    process.exit(1);
  }
  if (!secretKey.startsWith('sk_test_')) {
    fail('This script is for Clerk development instances only (sk_test_…).');
    process.exit(1);
  }

  const { email, name, password, role } = parseArgs();
  if (!email || !email.includes('@')) fail('--email is required');
  if (!name.trim()) fail('--name is required');
  if (!password || password.length < 8) fail('--password is required (min 8 characters)');
  if (!ALLOWED_ROLES.has(role)) fail(`--role must be one of: ${[...ALLOWED_ROLES].join(', ')}`);

  if (failed) process.exit(1);

  try {
    const user = await provisionUser(secretKey, { email, name, password, role });
    ok(`${primaryEmail(user) ?? user.id}: provisioned (verified email, password, bypass_client_trust, requestedRole=${role})`);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  printNextSteps(email);
  console.log('[clerk-dev-provision-field-user] Done.\n');
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
