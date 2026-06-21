import {
  GPS_ABSOLUTE_TIMEOUT_MS,
  GPS_ACCEPT_MAX_ACCURACY_METERS,
  GPS_DEV_PREVIEW_MAX_ACCURACY_METERS,
  GPS_DEV_PREVIEW_PROVIDER,
  GPS_EXCELLENT_ACCURACY_METERS,
  GPS_MAX_AGE_MS,
  GPS_MAX_FIX_SPREAD_METERS,
  GPS_MIN_SAMPLES_ACCEPT,
  GPS_MIN_SAMPLES_TARGET,
  GPS_RETRY_DURATION_MS,
  GPS_SAMPLE_DURATION_MS,
  GPS_TARGET_ACCURACY_METERS,
} from '@/convex/gpsAccuracy';
import Constants from 'expo-constants';

export { GPS_DEV_PREVIEW_PROVIDER };

export type GpsCapturePolicy = {
  excellentAccuracyMeters: number;
  targetAccuracyMeters: number;
  acceptMaxAccuracyMeters: number;
  maxFixSpreadMeters: number;
  minSamplesAccept: number;
  minSamplesTarget: number;
  sampleDurationMs: number;
  retryDurationMs: number;
  absoluteTimeoutMs: number;
  maxAgeMs: number;
  devPreview: boolean;
  providerTag: string;
};

const STRICT_POLICY: GpsCapturePolicy = {
  excellentAccuracyMeters: GPS_EXCELLENT_ACCURACY_METERS,
  targetAccuracyMeters: GPS_TARGET_ACCURACY_METERS,
  acceptMaxAccuracyMeters: GPS_ACCEPT_MAX_ACCURACY_METERS,
  maxFixSpreadMeters: GPS_MAX_FIX_SPREAD_METERS,
  minSamplesAccept: GPS_MIN_SAMPLES_ACCEPT,
  minSamplesTarget: GPS_MIN_SAMPLES_TARGET,
  sampleDurationMs: GPS_SAMPLE_DURATION_MS,
  retryDurationMs: GPS_RETRY_DURATION_MS,
  absoluteTimeoutMs: GPS_ABSOLUTE_TIMEOUT_MS,
  maxAgeMs: GPS_MAX_AGE_MS,
  devPreview: false,
  providerTag: 'device',
};

const DEV_PREVIEW_POLICY: GpsCapturePolicy = {
  excellentAccuracyMeters: 1,
  targetAccuracyMeters: 3,
  acceptMaxAccuracyMeters: GPS_DEV_PREVIEW_MAX_ACCURACY_METERS,
  maxFixSpreadMeters: 5,
  minSamplesAccept: 2,
  minSamplesTarget: 2,
  sampleDurationMs: GPS_SAMPLE_DURATION_MS,
  retryDurationMs: GPS_RETRY_DURATION_MS,
  absoluteTimeoutMs: GPS_ABSOLUTE_TIMEOUT_MS,
  maxAgeMs: GPS_MAX_AGE_MS,
  devPreview: true,
  providerTag: GPS_DEV_PREVIEW_PROVIDER,
};

export function isExpoGo(): boolean {
  return Constants.executionEnvironment === 'storeClient';
}

export function isExpoGoDevPreview(): boolean {
  return __DEV__ && isExpoGo();
}

export function getGpsCapturePolicy(): GpsCapturePolicy {
  return isExpoGoDevPreview() ? DEV_PREVIEW_POLICY : STRICT_POLICY;
}
