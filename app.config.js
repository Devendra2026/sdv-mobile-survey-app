/**
 * Dynamic Expo config.
 * Dev-client exclusion for preview/production is in package.json `expo.autolinking`
 * (see scripts/configure-eas-autolinking.mjs). RN autolinking uses react-native.config.js.
 */
const app = require('./app.json');

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    ...app.expo,
  },
};
