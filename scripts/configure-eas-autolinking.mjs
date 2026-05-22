/**
 * EAS prebuild hook: preview/production must not autolink expo-dev-client
 * (Play Protect flags dev-launcher APKs; app crashes without Metro).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const DEV_PACKAGES = [
  'expo-dev-client',
  'expo-dev-launcher',
  'expo-dev-menu',
  'expo-dev-menu-interface',
];

const profile = process.env.EAS_BUILD_PROFILE ?? '';
const useDevClient =
  process.env.EXPO_USE_DEV_CLIENT === '1' || profile === 'development';

const pkgPath = 'package.json';
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.expo = pkg.expo ?? {};
pkg.expo.autolinking = pkg.expo.autolinking ?? {};

if (useDevClient) {
  for (const platform of ['android', 'ios']) {
    const section = pkg.expo.autolinking[platform];
    if (section?.exclude) {
      delete section.exclude;
      if (Object.keys(section).length === 0) {
        delete pkg.expo.autolinking[platform];
      }
    }
  }
  console.log('[configure-eas-autolinking] Dev-client packages allowed (development build).');
} else {
  for (const platform of ['android', 'ios']) {
    pkg.expo.autolinking[platform] = {
      ...(pkg.expo.autolinking[platform] ?? {}),
      exclude: [...DEV_PACKAGES],
    };
  }
  console.log('[configure-eas-autolinking] Dev-client packages excluded from native build.');
}

writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
