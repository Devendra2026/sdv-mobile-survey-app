import { validateGpsCapture } from '@/convex/lib/gpsValidation';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import { locationErrorMessage } from '@/utils/gpsLocationErrors';
import { getGpsProviderTag } from '@/utils/gpsPolicy';
import * as Location from 'expo-location';

export type GpsCapture = NonNullable<WizardDraft['gps']>;

function toCaptureError(e: unknown): Error {
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

function toCapture(loc: Location.LocationObject): GpsCapture {
  const accuracy = loc.coords.accuracy;
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    accuracyMeters: Number.isFinite(accuracy) && accuracy! > 0 ? accuracy! : 1,
    capturedAt: Date.now(),
    provider: isMockLocation(loc) ? 'mock' : getGpsProviderTag(),
    isMockLocation: isMockLocation(loc),
  };
}

async function ensureLocationReady(): Promise<void> {
  if (!(await prepareLocationAccess())) {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission is required to continue');
    }
    throw new Error('Turn on device location services');
  }

  if (Location.enableNetworkProviderAsync) {
    try {
      await Location.enableNetworkProviderAsync();
    } catch {
      // optional on iOS
    }
  }
}

const positionOptions: Location.LocationOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  mayShowUserSettingsDialog: true,
};

/**
 * Fetches the current device location and returns coordinates immediately.
 * No accuracy thresholds — rejects only permission, services, mock, or missing fix.
 */
export async function captureGps(): Promise<GpsCapture> {
  try {
    await ensureLocationReady();
    const loc = await Location.getCurrentPositionAsync(positionOptions);

    if (isMockLocation(loc)) {
      throw new Error('Mock location detected — disable fake GPS and use the device antenna');
    }

    if (
      !Number.isFinite(loc.coords.latitude) ||
      !Number.isFinite(loc.coords.longitude) ||
      loc.coords.latitude < -90 ||
      loc.coords.latitude > 90 ||
      loc.coords.longitude < -180 ||
      loc.coords.longitude > 180
    ) {
      throw new Error('Could not get a GPS fix — move to open sky and try again');
    }

    const capture = toCapture(loc);
    const validationErrors = validateGpsCapture(capture, { strict: false });
    if (validationErrors.length > 0) {
      throw new Error(validationErrors[0]!);
    }

    return capture;
  } catch (e) {
    throw toCaptureError(e);
  }
}

/** Prompt for foreground location permission and verify device location services are on. */
export async function prepareLocationAccess(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return false;
  return Location.hasServicesEnabledAsync();
}

/** User-facing reason when prepareLocationAccess() returns false (permission already requested). */
export async function getLocationUnavailableMessage(isOnline = true): Promise<string> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') {
    return locationErrorMessage(new Error('Location permission is required to continue'), isOnline);
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    return locationErrorMessage(new Error('Turn on device location services'), isOnline);
  }
  return locationErrorMessage(new Error('Turn on device location services'), isOnline);
}

/** Read-only check — does not show the system permission dialog. */
export async function checkLocationAvailability(): Promise<boolean> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') return false;
  return Location.hasServicesEnabledAsync();
}

let liveLocationSubscription: Location.LocationSubscription | null = null;

/** Subscribe to live coordinates for display before capture. */
export async function startLiveLocationWatch(onUpdate: (latitude: number, longitude: number) => void): Promise<void> {
  stopLiveLocationWatch();
  const available = await prepareLocationAccess();
  if (!available) return;

  liveLocationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      distanceInterval: 0,
    },
    (loc) => {
      if (isMockLocation(loc)) return;
      if (!Number.isFinite(loc.coords.latitude) || !Number.isFinite(loc.coords.longitude)) return;
      onUpdate(loc.coords.latitude, loc.coords.longitude);
    },
  );
}

export function stopLiveLocationWatch(): void {
  liveLocationSubscription?.remove();
  liveLocationSubscription = null;
}

export function isGpsStepComplete(gps: GpsCapture | undefined): boolean {
  if (!gps) return false;
  return validateGpsCapture(gps, { strict: true }).length === 0;
}
