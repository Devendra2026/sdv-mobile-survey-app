import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { isExpoGo } from '@/utils/gpsPolicy';

type MapsExtra = {
  googleMapsApiKey?: string;
  googleMapsAndroidKey?: string;
  googleMapsIosKey?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as MapsExtra;

function pick(...values: (string | undefined)[]): string {
  for (const v of values) {
    const t = v?.trim();
    if (t) return t;
  }
  return '';
}

/** Android Maps SDK key — inlined at build time and mirrored in app.config `extra`. */
export function googleMapsAndroidKey(): string {
  return pick(
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
    extra.googleMapsAndroidKey,
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    extra.googleMapsApiKey,
  );
}

/** iOS Maps SDK key — inlined at build time and mirrored in app.config `extra`. */
export function googleMapsIosKey(): string {
  return pick(
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY,
    extra.googleMapsIosKey,
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    extra.googleMapsApiKey,
  );
}

/** EAS / release APK — Maps key is embedded in AndroidManifest or Info.plist at prebuild. */
function isEmbeddedNativeMapsBuild(): boolean {
  const env = Constants.executionEnvironment;
  return env === 'standalone' || env === 'bare';
}

export function canRenderNativeMap(): boolean {
  if (isExpoGo()) return true;
  if (isEmbeddedNativeMapsBuild()) return true;
  if (Platform.OS === 'android') return Boolean(googleMapsAndroidKey());
  if (Platform.OS === 'ios') return Boolean(googleMapsIosKey());
  return Boolean(googleMapsAndroidKey());
}

export function mapsPreviewUnavailableMessage(): string {
  return 'Set EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY (or EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) in .env.local for dev, or in EAS Environment variables for preview/production APK builds. Enable Maps SDK for Android in Google Cloud Console.';
}
