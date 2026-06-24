/**
 * Static checks for Clerk + Convex auth wiring in the mobile app.
 * Run via: npm run verify:auth-flow
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

let failed = false;

function fail(msg: string) {
  console.error(`[verify-auth-flow] FAIL — ${msg}`);
  failed = true;
}

function ok(msg: string) {
  console.log(`[verify-auth-flow] OK — ${msg}`);
}

const root = process.cwd();

const requiredFiles = [
  'src/app/_layout.tsx',
  'src/app/(auth)/sign-in.tsx',
  'src/app/(auth)/sign-up.tsx',
  'src/app/(auth)/setup.tsx',
  'src/app/(auth)/awaiting-approval.tsx',
  'src/hooks/use-auth-for-convex.ts',
  'src/hooks/use-clerk-convex-auth.ts',
  'src/hooks/use-sync-convex-user.ts',
  'src/utils/tokenCache.ts',
  'src/components/layout-guard.tsx',
  'src/components/role-gate.tsx',
  'convex/auth.config.ts',
  'convex/http.ts',
  'convex/users.ts',
  'convex/helpers.ts',
  'convex/capabilities.ts',
];

for (const rel of requiredFiles) {
  const full = path.join(root, rel);
  if (!existsSync(full)) {
    fail(`missing ${rel}`);
  }
}

const layout = readFileSync(path.join(root, 'src/app/_layout.tsx'), 'utf8');
if (!layout.includes('AuthGate')) fail('root layout must define AuthGate');
if (!layout.includes('ClerkProvider')) fail('root layout must wrap ClerkProvider');
if (!layout.includes('awaiting-approval')) fail('AuthGate must route pending users to awaiting-approval');

const convexAuth = readFileSync(path.join(root, 'src/hooks/use-auth-for-convex.ts'), 'utf8');
if (!convexAuth.includes("template: 'convex'") && !convexAuth.includes('template: "convex"')) {
  fail('use-auth-for-convex must request convex JWT template');
}

const permissions = readFileSync(path.join(root, 'src/lib/permissions.ts'), 'utf8');
if (!permissions.includes('qc.decide')) fail('permissions matrix must include qc.decide');
if (!permissions.includes('surveys.editDraft')) fail('permissions matrix must include surveys.editDraft');

if (failed) {
  process.exit(1);
}
ok('auth flow files and wiring present');
console.log('[verify-auth-flow] All checks passed.');
