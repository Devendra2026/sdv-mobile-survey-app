import { GPS_DEV_PREVIEW_PROVIDER } from '@/convex/gpsAccuracy';
import Constants from 'expo-constants';

export { GPS_DEV_PREVIEW_PROVIDER };

export function isExpoGo(): boolean {
  return Constants.executionEnvironment === 'storeClient';
}

export function isExpoGoDevPreview(): boolean {
  return __DEV__ && isExpoGo();
}

/** Provider tag stored on GPS captures for audit. */
export function getGpsProviderTag(): string {
  return isExpoGoDevPreview() ? GPS_DEV_PREVIEW_PROVIDER : 'device';
}
