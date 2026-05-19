/**
 * Dynamic Expo config.
 * Preview/production APKs must NOT link expo-dev-client (crashes without Metro).
 */
const { DEV_CLIENT_PACKAGES, isDevClientBuild } = require('./scripts/is-dev-client-build.cjs');

const app = require('./app.json');

const devClientExclude = isDevClientBuild() ? [] : DEV_CLIENT_PACKAGES;

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    ...app.expo,
    autolinking: {
      android: { exclude: devClientExclude },
      ios: { exclude: devClientExclude },
    },
  },
};
