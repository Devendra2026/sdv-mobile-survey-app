import type { GpsCaptureInput } from '@/convex/lib/gpsValidation';

/** Full-precision coordinate string for GIS audit (no rounding). */
export function formatGpsFull(gps: Pick<GpsCaptureInput, 'latitude' | 'longitude'>): string {
  return `${gps.latitude}, ${gps.longitude}`;
}

/** Human-readable 6-decimal display (~0.1 m). */
export function formatGpsDisplay(gps: Pick<GpsCaptureInput, 'latitude' | 'longitude'>): string {
  return `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`;
}
