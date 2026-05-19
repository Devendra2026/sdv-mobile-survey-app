/**
 * React Native CLI autolinking (required to exclude dev-client on preview/production).
 * Expo's expo.autolinking.exclude in app.config.js does not cover RN modules on SDK 54.
 */
const { DEV_CLIENT_PACKAGES, isDevClientBuild } = require('./scripts/is-dev-client-build.cjs');

/** @type {import('@react-native-community/cli-types').Config} */
const config = {
  dependencies: {},
};

if (!isDevClientBuild()) {
  for (const name of DEV_CLIENT_PACKAGES) {
    config.dependencies[name] = {
      platforms: {
        android: null,
        ios: null,
      },
    };
  }
}

module.exports = config;
