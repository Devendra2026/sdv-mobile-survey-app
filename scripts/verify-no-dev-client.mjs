/**
 * Fail fast before EAS preview/production builds if dev-client native modules
 * would still be linked (common cause of instant Android crash on QR install).
 */
import { execSync } from 'node:child_process';
import { DEV_CLIENT_PACKAGES } from './is-dev-client-build.cjs';

const profile = process.argv[2] ?? 'preview';
const env = {
  ...process.env,
  EAS_BUILD_PROFILE: profile,
  EXPO_USE_DEV_CLIENT: profile === 'development' ? '1' : '',
};

if (profile !== 'development') {
  const out = execSync(
    'npx expo-modules-autolinking react-native-config --platform android --json',
    {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const config = JSON.parse(out);
  const linked = Object.keys(config.dependencies ?? {});
  const found = DEV_CLIENT_PACKAGES.filter((pkg) => linked.includes(pkg));

  if (found.length > 0) {
    console.error(
      `\n[verify-no-dev-client] EAS profile "${profile}" would still link:\n  ${found.join('\n  ')}\n` +
      'Fix react-native.config.js / app.config.js before building.\n',
    );
    process.exit(1);
  }
  console.log(`[verify-no-dev-client] OK — no dev-client packages for "${profile}" Android build.`);
} else {
  console.log('[verify-no-dev-client] Skipped for development profile.');
}
