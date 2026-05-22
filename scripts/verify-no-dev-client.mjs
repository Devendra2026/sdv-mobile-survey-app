/**
 * Fail fast before EAS preview/production builds if dev-client native modules
 * would still be linked (Play Protect warnings + crash without Metro).
 */
import { execSync } from 'node:child_process';
import { DEV_CLIENT_PACKAGES } from './is-dev-client-build.cjs';

const profile = process.argv[2] ?? 'preview';

if (profile === 'development') {
  console.log('[verify-no-dev-client] Skipped for development profile.');
  process.exit(0);
}

execSync('node ./scripts/configure-eas-autolinking.mjs', {
  stdio: 'inherit',
  env: {
    ...process.env,
    EAS_BUILD_PROFILE: profile,
    EXCLUDE_DEV_CLIENT: '1',
    EXPO_USE_DEV_CLIENT: '',
  },
});

const env = {
  ...process.env,
  EAS_BUILD_PROFILE: profile,
  EXCLUDE_DEV_CLIENT: '1',
  EXPO_USE_DEV_CLIENT: '',
};

const rnOut = execSync(
  'npx expo-modules-autolinking react-native-config --platform android --json',
  { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] },
);
const rnLinked = Object.keys(JSON.parse(rnOut).dependencies ?? {});
const rnFound = DEV_CLIENT_PACKAGES.filter((pkg) => rnLinked.includes(pkg));

const resolveOut = execSync(
  'npx expo-modules-autolinking resolve --platform android --json',
  { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] },
);
const resolved = JSON.parse(resolveOut);
const expoModules = Array.isArray(resolved)
  ? resolved
  : (resolved.modules ?? []);
const expoLinked = expoModules.map((m) => m.packageName ?? m.name);
const expoFound = DEV_CLIENT_PACKAGES.filter((pkg) => expoLinked.includes(pkg));

const found = [...new Set([...rnFound, ...expoFound])];

if (found.length > 0) {
  console.error(
    `\n[verify-no-dev-client] EAS profile "${profile}" would still link:\n  ${found.join('\n  ')}\n` +
    'Check package.json expo.autolinking.exclude and scripts/configure-eas-autolinking.mjs.\n',
  );
  process.exit(1);
}

console.log(
  `[verify-no-dev-client] OK — no dev-client packages for "${profile}" Android build.`,
);
