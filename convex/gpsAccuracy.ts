/**
 * Survey GPS accuracy (meters). Shared with the mobile app via `@/convex/gpsAccuracy`.
 *
 * - Target ±2–3 m outdoors (ideal for the survey UI).
 * - Accept up to ±20 m when the device cannot reach GNSS precision (common on phones).
 */
export const GPS_EXCELLENT_ACCURACY_METERS = 2;
export const GPS_TARGET_ACCURACY_METERS = 3;
export const GPS_ACCEPT_MAX_ACCURACY_METERS = 20;

/** @deprecated Use GPS_ACCEPT_MAX_ACCURACY_METERS — kept for existing imports */
export const GPS_MAX_ACCURACY_METERS = GPS_ACCEPT_MAX_ACCURACY_METERS;

/** How long to sample fixes before accepting the best reading. */
export const GPS_SAMPLE_DURATION_MS = 30_000;
