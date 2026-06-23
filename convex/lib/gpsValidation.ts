import type { Doc } from "../_generated/dataModel";
import { GPS_CAPTURE_MAX_AGE_SUBMIT_MS } from "../gpsAccuracy";

type GpsCapture = NonNullable<Doc<"surveys">["gps"]>;

/** Client-friendly GPS capture shape (matches surveys.gps). */
export type GpsCaptureInput = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: number;
  provider?: string;
  isMockLocation?: boolean;
};

export class GpsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GpsValidationError";
  }
}

export type ValidateGpsOptions = {
  /** When true, enforce mock block and capture freshness (submit path). */
  strict?: boolean;
  maxAgeMs?: number;
  now?: number;
};

export function validateGps(gps: GpsCapture, options?: ValidateGpsOptions): string | null {
  const strict = options?.strict ?? false;
  const now = options?.now ?? Date.now();

  if (!Number.isFinite(gps.latitude) || gps.latitude < -90 || gps.latitude > 90) {
    return "Latitude must be between -90 and 90";
  }
  if (!Number.isFinite(gps.longitude) || gps.longitude < -180 || gps.longitude > 180) {
    return "Longitude must be between -180 and 180";
  }
  if (!Number.isFinite(gps.accuracyMeters) || gps.accuracyMeters <= 0) {
    return "GPS accuracy must be a positive number";
  }
  if (!Number.isFinite(gps.capturedAt) || gps.capturedAt <= 0) {
    return "GPS capture timestamp is invalid";
  }
  if (gps.isMockLocation) {
    return "Mock or simulated GPS is not allowed — disable fake location and retake";
  }
  if (strict) {
    const maxAge = options?.maxAgeMs ?? GPS_CAPTURE_MAX_AGE_SUBMIT_MS;
    if (now - gps.capturedAt > maxAge) {
      return "GPS capture is too old — retake at the property before submitting";
    }
  }
  return null;
}

export function assertValidGps(gps: GpsCapture, options?: ValidateGpsOptions): void {
  const message = validateGps(gps, options);
  if (message) throw new GpsValidationError(message);
}

/** Array form for mobile clients and verify scripts. */
export function validateGpsCapture(gps: GpsCapture, options?: ValidateGpsOptions): string[] {
  const message = validateGps(gps, options);
  return message ? [message] : [];
}
