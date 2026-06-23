import { GPS_CAPTURE_MAX_AGE_SUBMIT_MS } from '../gpsAccuracy';

export type GpsCaptureInput = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: number;
  provider?: string;
  isMockLocation?: boolean;
};

export function isValidGpsCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export type ValidateGpsOptions = {
  /** When true, enforce mock block and capture freshness (submit path). */
  strict?: boolean;
  /** Max age of capture in ms (defaults to submit window when strict). */
  maxAgeMs?: number;
  /** Reference time for freshness check (defaults to Date.now()). */
  now?: number;
};

/**
 * Returns human-readable validation errors. Empty array means valid.
 */
export function validateGpsCapture(gps: GpsCaptureInput, opts: ValidateGpsOptions = {}): string[] {
  const errors: string[] = [];
  const strict = opts.strict ?? false;
  const now = opts.now ?? Date.now();

  if (!isValidGpsCoordinate(gps.latitude, gps.longitude)) {
    errors.push('Latitude must be between -90 and 90; longitude between -180 and 180');
  }

  if (!Number.isFinite(gps.accuracyMeters) || gps.accuracyMeters <= 0) {
    errors.push('GPS accuracy must be a positive number');
  }

  if (!Number.isFinite(gps.capturedAt) || gps.capturedAt <= 0) {
    errors.push('GPS capture timestamp is invalid');
  }

  if (gps.isMockLocation) {
    errors.push('Mock or simulated GPS is not allowed — disable fake location and retake');
  }

  if (strict) {
    const maxAge = opts.maxAgeMs ?? GPS_CAPTURE_MAX_AGE_SUBMIT_MS;
    if (now - gps.capturedAt > maxAge) {
      errors.push('GPS capture is too old — retake at the property before submitting');
    }
  }

  return errors;
}

/** Map validation errors to Convex field details shape. */
export function gpsValidationDetails(gps: GpsCaptureInput, opts: ValidateGpsOptions = {}): Record<string, string[]> {
  const messages = validateGpsCapture(gps, opts);
  return messages.length > 0 ? { gps: messages } : {};
}
