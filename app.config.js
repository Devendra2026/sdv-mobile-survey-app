/**
 * Dynamic Expo config.
 * Dev-client exclusion: package.json `expo.autolinking` (scripts/configure-eas-autolinking.mjs
 * via eas-build-pre-install) and react-native.config.js for RN modules on SDK 54.
 *
 * `extra` mirrors EXPO_PUBLIC_* so release APKs can read keys via expo-constants if Metro
 * inlining ever misses them (same values as EAS environment variables at build time).
 */
const path = require('path');
const { load } = require('@expo/env');

// Local `.env.local` (EAS uploads exclude it — cloud builds use EAS Environment variables).
load(path.resolve(__dirname));

const app = require('./app.json');

function pickEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
}

const googleMapsApiKey = pickEnv(
  'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
  'EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY',
  'EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY',
);
const googleMapsAndroidKey =
  pickEnv('EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY', 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY') || googleMapsApiKey;
const googleMapsIosKey =
  pickEnv('EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY', 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY') || googleMapsApiKey;

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    ...app.expo,
    // SDK 54 ships react-native-maps 1.20.1 — no Expo config plugin (added in 1.22+).
    // Inject Google Maps keys via platform config per Expo docs:
    // https://docs.expo.dev/versions/v54.0.0/sdk/map-view/
    ios: {
      ...app.expo.ios,
      config: {
        ...app.expo.ios?.config,
        googleMapsApiKey: googleMapsIosKey,
      },
    },
    android: {
      ...app.expo.android,
      config: {
        ...app.expo.android?.config,
        googleMaps: {
          apiKey: googleMapsAndroidKey,
        },
      },
    },
    extra: {
      ...app.expo.extra,
      convexUrl: process.env.EXPO_PUBLIC_CONVEX_URL,
      clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
      googleMapsApiKey,
      googleMapsAndroidKey,
      googleMapsIosKey,
    },
  },
};
