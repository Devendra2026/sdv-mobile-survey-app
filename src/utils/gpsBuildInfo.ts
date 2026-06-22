import { getGpsCapturePolicy, isExpoGo } from '@/utils/gpsPolicy';
import Constants from 'expo-constants';

export type GpsBuildFingerprint = {
  appVersion: string;
  executionEnvironment: string;
  captureMode: 'fleet' | 'expo-go-dev-preview';
  acceptMaxMeters: number;
};

/** Helps field testers confirm fleet APK vs Expo Go without guessing from error text. */
function getGpsBuildFingerprint(): GpsBuildFingerprint {
  const policy = getGpsCapturePolicy();
  return {
    appVersion: Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? 'unknown',
    executionEnvironment: Constants.executionEnvironment ?? 'unknown',
    captureMode: policy.devPreview ? 'expo-go-dev-preview' : 'fleet',
    acceptMaxMeters: policy.acceptMaxAccuracyMeters,
  };
}

export function formatGpsBuildFingerprintLine(): string {
  const fp = getGpsBuildFingerprint();
  const envLabel = isExpoGo() ? 'Expo Go' : 'fleet APK';
  return `Build ${fp.appVersion} · ${envLabel} · ±${fp.acceptMaxMeters} m max`;
}
