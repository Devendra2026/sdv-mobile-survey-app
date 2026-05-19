/** Packages that must only ship in the EAS "development" profile (dev client + Metro). */
const DEV_CLIENT_PACKAGES = [
  'expo-dev-client',
  'expo-dev-launcher',
  'expo-dev-menu',
  'expo-dev-menu-interface',
];

/**
 * True only for EAS development builds or when explicitly opted in locally.
 * Preview/production QR APKs must never link these (instant crash without Metro).
 */
function isDevClientBuild() {
  if (process.env.EXCLUDE_DEV_CLIENT === '1') return false;
  if (process.env.EXPO_USE_DEV_CLIENT === '1') return true;
  if (process.env.EAS_BUILD_PROFILE === 'development') return true;
  return false;
}

module.exports = { DEV_CLIENT_PACKAGES, isDevClientBuild };
