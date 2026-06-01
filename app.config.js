/**
 * Dynamic Expo config.
 * Dev-client exclusion: package.json `expo.autolinking` (scripts/configure-eas-autolinking.mjs
 * via eas-build-pre-install) and react-native.config.js for RN modules on SDK 54.
 *
 * `extra` mirrors EXPO_PUBLIC_* so release APKs can read keys via expo-constants if Metro
 * inlining ever misses them (same values as EAS environment variables at build time).
 */
const app = require('./app.json');

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    ...app.expo,
    extra: {
      ...app.expo.extra,
      convexUrl: process.env.EXPO_PUBLIC_CONVEX_URL,
      clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    },
  },
};
