import {
  GPS_ACCEPT_MAX_ACCURACY_METERS,
  GPS_EXCELLENT_ACCURACY_METERS,
  GPS_MIN_SAMPLES_ACCEPT,
  GPS_MIN_SAMPLES_TARGET,
  GPS_SAMPLE_DURATION_MS,
  GPS_SAMPLE_POLL_MS,
  GPS_TARGET_ACCURACY_METERS,
} from '@/convex/gpsAccuracy';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import * as Location from 'expo-location';

export type GpsCapture = NonNullable<WizardDraft['gps']>;

export type GpsCaptureProgress = {
  bestAccuracyMeters: number | null;
  sampleCount: number;
  elapsedMs: number;
};

export class GpsAccuracyError extends Error {
  readonly accuracyMeters: number;

  constructor(accuracyMeters: number) {
    super(
      `Could not reach ±${GPS_TARGET_ACCURACY_METERS} m (best was ±${Math.round(accuracyMeters)} m). Stand in open sky, wait for the reading to improve, then retry.`,
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
  accuracy: number | null;
};

type LocationSample = {
  coords: LocationCoords;
  mocked?: boolean;
};

function toCapture(coords: LocationCoords, mocked?: boolean): GpsCapture {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracyMeters: coords.accuracy ?? GPS_ACCEPT_MAX_ACCURACY_METERS + 1,
    capturedAt: Date.now(),
    provider: mocked ? 'mock' : 'device',
    isMockLocation: Boolean(mocked),
  };
}

function isBetter(candidate: LocationCoords, current: LocationCoords | null): boolean {
  const cAcc = candidate.accuracy;
  if (cAcc == null) return false;
  const curAcc = current?.accuracy;
  if (curAcc == null) return true;
  return cAcc < curAcc;
}

/** Weighted centroid of fixes with known accuracy (better fixes weigh more). */
function fuseSamples(samples: LocationSample[]): LocationCoords | null {
  const usable = samples.filter(
    (s) => s.coords.accuracy != null && s.coords.accuracy <= GPS_ACCEPT_MAX_ACCURACY_METERS,
  );
  if (usable.length === 0) return null;

  let wSum = 0;
  let lat = 0;
  let lng = 0;
  let bestAcc = Infinity;

  for (const s of usable) {
    const acc = s.coords.accuracy!;
    bestAcc = Math.min(bestAcc, acc);
    const w = 1 / (acc * acc);
    wSum += w;
    lat += s.coords.latitude * w;
    lng += s.coords.longitude * w;
  }

  return {
    latitude: lat / wSum,
    longitude: lng / wSum,
    accuracy: bestAcc,
  };
}

/**
 * Samples GNSS fixes, fuses acceptable readings, and requires ≤ {@link GPS_ACCEPT_MAX_ACCURACY_METERS} m.
 * Aim for ≤ {@link GPS_TARGET_ACCURACY_METERS} m outdoors.
 */
export async function captureGpsWithTargetAccuracy(
  onProgress?: (progress: GpsCaptureProgress) => void,
): Promise<GpsCapture> {
  try {
    return await captureGpsWithTargetAccuracyInner(onProgress);
  } catch (e) {
    throw toCaptureError(e);
  }
}

function shouldStopSampling(bestAcc: number | null | undefined, sampleCount: number, elapsedMs: number): boolean {
  if (bestAcc == null) return false;
  if (bestAcc <= GPS_EXCELLENT_ACCURACY_METERS) return true;
  if (bestAcc <= GPS_TARGET_ACCURACY_METERS && sampleCount >= GPS_MIN_SAMPLES_TARGET) return true;
  if (bestAcc <= GPS_ACCEPT_MAX_ACCURACY_METERS && sampleCount >= GPS_MIN_SAMPLES_ACCEPT && elapsedMs >= 1_500) {
    return true;
  }
  if (bestAcc <= GPS_ACCEPT_MAX_ACCURACY_METERS && elapsedMs >= 5_000) return true;
  return false;
}

async function captureGpsWithTargetAccuracyInner(
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

  const ingest = (loc: Location.LocationObject) => {
    if (isMockLocation(loc)) return;
    const coords: LocationCoords = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
    };
    samples.push({ coords, mocked: loc.mocked });
    if (isBetter(coords, best.coords)) best.coords = coords;
    onProgress?.({
      bestAccuracyMeters: best.coords?.accuracy ?? null,
      sampleCount: samples.length,
      elapsedMs: Date.now() - started,
    });
  };

  const quickFix = Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
    mayShowUserSettingsDialog: true,
  })
    .then(ingest)
    .catch(() => undefined);

  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: 300,
      distanceInterval: 1,
    },
    ingest,
  );

  try {
    const deadline = started + GPS_SAMPLE_DURATION_MS;
    const pollUntilDeadline = async (): Promise<void> => {
      const elapsedMs = Date.now() - started;
      if (Date.now() >= deadline || shouldStopSampling(best.coords?.accuracy, samples.length, elapsedMs)) {
        return;
      }
      await new Promise((r) => setTimeout(r, GPS_SAMPLE_POLL_MS));
      return pollUntilDeadline();
    };
    await pollUntilDeadline();
    await quickFix;
  } finally {
    subscription.remove();
  }

  if (!best.coords) {
    const single = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      mayShowUserSettingsDialog: true,
    });
    if (isMockLocation(single)) {
      throw new Error('Mock location detected — disable fake GPS and use the device antenna');
    }
    ingest(single);
  }

  if (!best.coords) {
    throw new Error('Could not get a GPS fix — move to open sky and try again');
  }

  const fused = fuseSamples(samples) ?? best.coords;
  const accuracy = fused.accuracy;

  if (accuracy == null || accuracy > GPS_ACCEPT_MAX_ACCURACY_METERS) {
    throw new GpsAccuracyError(accuracy ?? GPS_ACCEPT_MAX_ACCURACY_METERS + 1);
  }

  return toCapture(
    fused,
    samples.some((s) => s.mocked),
  );
}

export function gpsAccuracyTier(meters: number): 'excellent' | 'target' | 'fair' | 'poor' {
  if (meters <= GPS_EXCELLENT_ACCURACY_METERS) return 'excellent';
  if (meters <= GPS_TARGET_ACCURACY_METERS) return 'target';
  if (meters <= GPS_ACCEPT_MAX_ACCURACY_METERS) return 'fair';
  return 'poor';
}

export function gpsAccuracyTagLabel(meters: number): string {
  const tier = gpsAccuracyTier(meters);
  const rounded = Math.round(meters);
  if (tier === 'excellent') return `Excellent · ±${rounded} m`;
  if (tier === 'target') return `Good · ±${rounded} m`;
  if (tier === 'fair') return `±${rounded} m · aim for ±${GPS_TARGET_ACCURACY_METERS} m`;
  return `±${rounded} m`;
}

export function gpsAccuracyTagTone(meters: number): 'success' | 'warning' | 'danger' {
  const tier = gpsAccuracyTier(meters);
  if (tier === 'excellent' || tier === 'target') return 'success';
  if (tier === 'fair') return 'warning';
  return 'danger';
}
