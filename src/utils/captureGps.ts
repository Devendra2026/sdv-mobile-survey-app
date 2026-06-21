import { GPS_ACCEPT_MAX_ACCURACY_METERS, GPS_MAX_AGE_MS, GPS_SAMPLE_POLL_MS } from '@/convex/gpsAccuracy';
import { validateGpsCapture } from '@/convex/lib/gpsValidation';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import { getGpsCapturePolicy, GPS_DEV_PREVIEW_PROVIDER, type GpsCapturePolicy } from '@/utils/gpsPolicy';
import * as Location from 'expo-location';

export type GpsCapture = NonNullable<WizardDraft['gps']>;

export type GpsCaptureProgress = {
  bestAccuracyMeters: number | null;
  bestLatitude: number | null;
  bestLongitude: number | null;
  sampleCount: number;
  pinpointSampleCount: number;
  minSamplesAccept: number;
  elapsedMs: number;
  waitingForBetterSignal: boolean;
};

/** Extend sampling when GNSS is close but not yet at accept threshold (m). */
const CLOSE_ACCURACY_EXTEND_THRESHOLD_METERS = 3;

/** Extra sampling window when close to target (ms). */
const CLOSE_ACCURACY_EXTEND_MS = 5_000;

/** Max adaptive extensions per sampleGpsFix pass. */
const MAX_CLOSE_ACCURACY_EXTENSIONS = 2;

let gnssWarmupSubscription: Location.LocationSubscription | null = null;

export class GpsAccuracyError extends Error {
  readonly accuracyMeters: number;

  constructor(accuracyMeters: number, acceptMaxMeters: number, detail?: string) {
    super(
      detail ??
        `Could not reach ±${acceptMaxMeters} m (best was ±${Math.round(accuracyMeters)} m). Stand at the property boundary in open sky, hold still, then retry.`,
    );
    this.name = 'GpsAccuracyError';
    this.accuracyMeters = accuracyMeters;
  }
}

function toCaptureError(e: unknown): Error {
  if (e instanceof GpsAccuracyError) return e;
  const raw = e instanceof Error ? e.message : String(e);
  if (/split bundle|ERR_NGROK|ngrok|offline|Unable to resolve module/i.test(raw)) {
    return new Error(
      'GPS could not start. Restart the dev server and reopen the app, or use a release build in the field.',
    );
  }
  if (e instanceof Error) return e;
  return new Error(raw || 'Could not get location');
}

function isMockLocation(loc: { mocked?: boolean }): boolean {
  return Boolean(loc.mocked);
}

type LocationCoords = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

type LocationSample = {
  coords: LocationCoords;
  mocked?: boolean;
  capturedAt: number;
};

function toCapture(coords: LocationCoords, policy: GpsCapturePolicy, mocked?: boolean): GpsCapture {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracyMeters: coords.accuracy,
    capturedAt: Date.now(),
    provider: mocked ? 'mock' : policy.providerTag,
    isMockLocation: Boolean(mocked),
  };
}

function isBetter(candidate: LocationCoords, current: LocationCoords | null): boolean {
  const curAcc = current?.accuracy;
  if (curAcc == null) return true;
  return candidate.accuracy < curAcc;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Weighted centroid of fixes with known accuracy (better fixes weigh more). */
function fuseSamples(samples: LocationSample[], acceptMaxMeters: number): LocationCoords | null {
  const usable = samples.filter((s) => Number.isFinite(s.coords.accuracy) && s.coords.accuracy <= acceptMaxMeters);
  if (usable.length === 0) return null;

  let wSum = 0;
  let lat = 0;
  let lng = 0;
  let bestAcc = Infinity;

  for (const s of usable) {
    const acc = s.coords.accuracy;
    bestAcc = Math.min(bestAcc, acc);
    const w = 1 / (acc * acc);
    wSum += w;
    lat += s.coords.latitude * w;
    lng += s.coords.longitude * w;
  }

  const fusedLat = lat / wSum;
  const fusedLng = lng / wSum;
  let fusedSpread = 0;
  for (const s of usable) {
    fusedSpread = Math.max(fusedSpread, haversineMeters(fusedLat, fusedLng, s.coords.latitude, s.coords.longitude));
  }

  return {
    latitude: fusedLat,
    longitude: fusedLng,
    accuracy: Math.max(bestAcc, fusedSpread),
  };
}

function shouldStopSampling(
  policy: GpsCapturePolicy,
  bestAcc: number | null | undefined,
  sampleCount: number,
  elapsedMs: number,
): boolean {
  if (bestAcc == null) return false;
  if (bestAcc <= policy.excellentAccuracyMeters && sampleCount >= policy.minSamplesAccept) return true;
  if (bestAcc <= policy.targetAccuracyMeters && sampleCount >= policy.minSamplesTarget) return true;
  if (
    bestAcc <= policy.acceptMaxAccuracyMeters &&
    sampleCount >= policy.minSamplesAccept &&
    elapsedMs >= policy.minElapsedAcceptMs
  ) {
    return true;
  }
  return false;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

export type GpsCaptureOptions = {
  /** Shorter sampling when replacing an existing fix (GNSS usually warm). */
  retake?: boolean;
};

/** Keeps the GNSS chip locking before the user taps Capture GPS. Call stopGnssWarmup on unmount or when capture starts. */
export async function startGnssWarmup(): Promise<void> {
  stopGnssWarmup();
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return;
  if (!(await Location.hasServicesEnabledAsync())) return;

  if (Location.enableNetworkProviderAsync) {
    try {
      await Location.enableNetworkProviderAsync();
    } catch {
      // optional on iOS
    }
  }

  gnssWarmupSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: GPS_SAMPLE_POLL_MS,
      distanceInterval: 0,
    },
    () => {
      // Discard fixes — goal is to warm the antenna, not store readings.
    },
  );
}

export function stopGnssWarmup(): void {
  gnssWarmupSubscription?.remove();
  gnssWarmupSubscription = null;
}

/**
 * Samples GNSS fixes, fuses acceptable readings, and enforces the active capture policy.
 */
export async function captureGpsWithTargetAccuracy(
  onProgress?: (progress: GpsCaptureProgress) => void,
  options?: GpsCaptureOptions,
): Promise<GpsCapture> {
  const policy = getGpsCapturePolicy(options);
  try {
    return await withTimeout(
      captureGpsWithRetry(policy, onProgress),
      policy.absoluteTimeoutMs,
      'GPS capture timed out — move to open sky and try again',
    );
  } catch (e) {
    throw toCaptureError(e);
  }
}

async function captureGpsWithRetry(
  policy: GpsCapturePolicy,
  onProgress?: (progress: GpsCaptureProgress) => void,
): Promise<GpsCapture> {
  try {
    return await sampleGpsFix(policy, policy.sampleDurationMs, onProgress);
  } catch (e) {
    if (e instanceof GpsAccuracyError) {
      return await sampleGpsFix(policy, policy.retryDurationMs, onProgress);
    }
    throw e;
  }
}

async function sampleGpsFix(
  policy: GpsCapturePolicy,
  durationMs: number,
  onProgress?: (progress: GpsCaptureProgress) => void,
): Promise<GpsCapture> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission is required to continue');
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error('Turn on device location services');
  }

  if (Location.enableNetworkProviderAsync) {
    try {
      await Location.enableNetworkProviderAsync();
    } catch {
      // optional on iOS
    }
  }

  const samples: LocationSample[] = [];
  const best = { coords: null as LocationCoords | null };
  const started = Date.now();
  let mockDetected = false;
  const positionOptions = {
    accuracy: Location.Accuracy.BestForNavigation,
    mayShowUserSettingsDialog: true,
  };
  const watchOptions = {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: GPS_SAMPLE_POLL_MS,
    distanceInterval: 0,
  };

  const acceptMax = policy.acceptMaxAccuracyMeters;

  const pinpointSampleCount = () =>
    samples.filter((s) => Number.isFinite(s.coords.accuracy) && s.coords.accuracy <= acceptMax).length;

  const reportProgress = () => {
    const bestAcc = best.coords?.accuracy ?? null;
    onProgress?.({
      bestAccuracyMeters: bestAcc,
      bestLatitude: best.coords?.latitude ?? null,
      bestLongitude: best.coords?.longitude ?? null,
      sampleCount: samples.length,
      pinpointSampleCount: pinpointSampleCount(),
      minSamplesAccept: policy.minSamplesAccept,
      elapsedMs: Date.now() - started,
      waitingForBetterSignal: bestAcc != null && bestAcc > policy.targetAccuracyMeters,
    });
  };

  const ingest = (loc: Location.LocationObject) => {
    if (isMockLocation(loc)) {
      mockDetected = true;
      return;
    }
    if (loc.coords.accuracy == null || !Number.isFinite(loc.coords.accuracy)) return;
    if (!Number.isFinite(loc.coords.latitude) || !Number.isFinite(loc.coords.longitude)) return;

    const sampleAge = Date.now() - loc.timestamp;
    if (sampleAge > policy.maxAgeMs) return;

    const coords: LocationCoords = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
    };
    samples.push({ coords, mocked: loc.mocked, capturedAt: loc.timestamp });
    if (isBetter(coords, best.coords)) best.coords = coords;
    reportProgress();
  };

  const warmUpPromise = Location.getCurrentPositionAsync(positionOptions).catch(() => null);

  const subscription = await Location.watchPositionAsync(watchOptions, ingest);
  void warmUpPromise.then((loc) => {
    if (loc) ingest(loc);
  });

  try {
    let deadline = started + durationMs;
    let closeAccuracyExtensions = 0;
    const pollUntilDeadline = async (): Promise<void> => {
      const elapsedMs = Date.now() - started;
      if (shouldStopSampling(policy, best.coords?.accuracy, samples.length, elapsedMs)) {
        return;
      }
      if (Date.now() >= deadline) {
        const bestAcc = best.coords?.accuracy;
        const pinpoints = pinpointSampleCount();
        if (
          bestAcc != null &&
          bestAcc <= CLOSE_ACCURACY_EXTEND_THRESHOLD_METERS &&
          bestAcc > acceptMax &&
          pinpoints < policy.minSamplesAccept &&
          closeAccuracyExtensions < MAX_CLOSE_ACCURACY_EXTENSIONS
        ) {
          deadline += CLOSE_ACCURACY_EXTEND_MS;
          closeAccuracyExtensions += 1;
          reportProgress();
        } else {
          return;
        }
      }
      await new Promise((r) => setTimeout(r, GPS_SAMPLE_POLL_MS));
      return pollUntilDeadline();
    };
    await pollUntilDeadline();
  } finally {
    subscription.remove();
  }

  if (!best.coords) {
    const single = (await warmUpPromise) ?? (await Location.getCurrentPositionAsync(positionOptions));
    if (isMockLocation(single)) {
      throw new Error('Mock location detected — disable fake GPS and use the device antenna');
    }
    ingest(single);
  }

  if (!best.coords) {
    throw new Error('Could not get a GPS fix — move to open sky and try again');
  }

  if (mockDetected) {
    throw new Error('Mock location detected — disable fake GPS and use the device antenna');
  }

  const pinpointSamples = samples.filter((s) => Number.isFinite(s.coords.accuracy) && s.coords.accuracy <= acceptMax);
  if (pinpointSamples.length < policy.minSamplesAccept) {
    throw new GpsAccuracyError(
      best.coords.accuracy,
      acceptMax,
      `Only ${pinpointSamples.length} reading(s) at ≤ ±${acceptMax} m (need ${policy.minSamplesAccept}). Hold still at the boundary in open sky.`,
    );
  }

  const fused = fuseSamples(samples, acceptMax);
  if (!fused) {
    throw new GpsAccuracyError(best.coords.accuracy, acceptMax);
  }

  const accuracy = fused.accuracy;
  if (accuracy > acceptMax) {
    throw new GpsAccuracyError(accuracy, acceptMax);
  }

  let fixSpread = 0;
  for (const s of pinpointSamples) {
    fixSpread = Math.max(
      fixSpread,
      haversineMeters(fused.latitude, fused.longitude, s.coords.latitude, s.coords.longitude),
    );
  }
  if (fixSpread > policy.maxFixSpreadMeters) {
    throw new GpsAccuracyError(
      accuracy,
      acceptMax,
      `Readings disagree by ${fixSpread.toFixed(1)} m — hold still at the property boundary in open sky, then retry.`,
    );
  }

  const capture = toCapture(
    fused,
    policy,
    samples.some((s) => s.mocked),
  );
  const validationErrors = validateGpsCapture(capture, {
    strict: !policy.devPreview,
    maxAgeMs: policy.maxAgeMs,
  });
  if (validationErrors.length > 0) {
    throw new Error(validationErrors[0]!);
  }

  return capture;
}

export function gpsAccuracyTier(meters: number): 'excellent' | 'target' | 'fair' | 'poor' {
  const policy = getGpsCapturePolicy();
  if (meters <= policy.excellentAccuracyMeters) return 'excellent';
  if (meters <= policy.targetAccuracyMeters) return 'target';
  if (meters <= policy.acceptMaxAccuracyMeters) return 'fair';
  return 'poor';
}

export function gpsAccuracyTagLabel(meters: number): string {
  const policy = getGpsCapturePolicy();
  const rounded = Math.round(meters * 10) / 10;
  if (meters <= GPS_ACCEPT_MAX_ACCURACY_METERS) {
    return `Pinpoint · ±${rounded} m`;
  }
  if (meters <= policy.acceptMaxAccuracyMeters) return `±${rounded} m`;
  return `±${rounded} m · need ≤ ±${policy.acceptMaxAccuracyMeters} m`;
}

export function gpsAccuracyTagTone(meters: number): 'success' | 'warning' | 'danger' {
  const policy = getGpsCapturePolicy();
  if (meters <= policy.acceptMaxAccuracyMeters) return 'success';
  return 'danger';
}

export function isGpsStepComplete(gps: GpsCapture | undefined): boolean {
  if (!gps) return false;
  if (gps.provider === GPS_DEV_PREVIEW_PROVIDER) {
    return validateGpsCapture(gps, { strict: false, maxAgeMs: GPS_MAX_AGE_MS }).length === 0;
  }
  return validateGpsCapture(gps, { strict: true, maxAgeMs: GPS_MAX_AGE_MS }).length === 0;
}
