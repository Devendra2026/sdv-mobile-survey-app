import { GPS_ACCEPT_MAX_ACCURACY_METERS } from '@/convex/gpsAccuracy';
import { GpsAccuracyError } from '@/utils/gpsAccuracyError';

/** User-facing GPS capture error text — exported for field verification scripts. */
export function locationErrorMessage(e: unknown, isOnline: boolean, devPreview: boolean): string {
  if (e instanceof GpsAccuracyError) {
    const base = e.message;
    if (devPreview) {
      return `${base} Expo Go dev preview accepts up to ±10 m for flow testing only — use a fleet APK for production surveys at ±${GPS_ACCEPT_MAX_ACCURACY_METERS} m.`;
    }
    return `${base} Move outdoors to the property boundary in open sky. Hold still until two readings reach ±${GPS_ACCEPT_MAX_ACCURACY_METERS} m. Enable Android High accuracy location and disable mock location apps.`;
  }
  if (e instanceof Error) {
    if (!isOnline && /network|offline|internet/i.test(e.message)) {
      return 'No network connection. GPS still works offline — ensure location services are enabled.';
    }
    if (/permission/i.test(e.message)) {
      return 'Location permission denied. Open Settings → Apps → Survey App → Permissions → Location → Allow.';
    }
    if (/location services/i.test(e.message)) {
      return 'Turn on device location (GPS) in system settings, then retry.';
    }
    if (/mock/i.test(e.message)) {
      return e.message;
    }
    if (/timed out/i.test(e.message)) {
      return `${e.message} Hold still in open sky and retry.`;
    }
    return e.message;
  }
  return 'Could not get location';
}

export function formatGpsAccuracyErrorDetail(
  lastAttemptMeters: number | null,
  pinpointSampleCount: number | null,
  minSamplesAccept: number,
  acceptMaxMeters: number,
): string | null {
  if (lastAttemptMeters == null && pinpointSampleCount == null) return null;
  const parts: string[] = [];
  if (pinpointSampleCount != null) {
    parts.push(`Pinpoint readings: ${pinpointSampleCount}/${minSamplesAccept} at ≤ ±${acceptMaxMeters} m`);
  }
  if (lastAttemptMeters != null) {
    parts.push(`best ±${Math.round(lastAttemptMeters * 10) / 10} m`);
  }
  return parts.join(' · ');
}
