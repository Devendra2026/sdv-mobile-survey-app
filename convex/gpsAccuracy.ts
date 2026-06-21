/**
 * Survey GPS accuracy (meters). Shared with the mobile app via `@/convex/gpsAccuracy`.
 *
 * Municipal / government field surveys require pinpoint capture at ≤ ±1 m.
 */
export const GPS_EXCELLENT_ACCURACY_METERS = 1;
export const GPS_TARGET_ACCURACY_METERS = 1;
export const GPS_ACCEPT_MAX_ACCURACY_METERS = 1;

/** @deprecated Use GPS_ACCEPT_MAX_ACCURACY_METERS — kept for existing imports */
export const GPS_MAX_ACCURACY_METERS = GPS_ACCEPT_MAX_ACCURACY_METERS;

/** Max spread (m) between fused fixes — rejects jittery readings even when accuracy reports ≤1 m. */
export const GPS_MAX_FIX_SPREAD_METERS = 1.5;

/** Max time to refine a fix on the first pass (ms). */
export const GPS_SAMPLE_DURATION_MS = 45_000;

/** Extra sampling window on automatic retry (ms). */
export const GPS_RETRY_DURATION_MS = 30_000;

/** Absolute ceiling for an entire capture attempt including retry and warm-up (ms). */
export const GPS_ABSOLUTE_TIMEOUT_MS = GPS_SAMPLE_DURATION_MS + GPS_RETRY_DURATION_MS + 30_000;

/** Minimum fixes at ≤1 m before accepting a pinpoint reading. */
export const GPS_MIN_SAMPLES_ACCEPT = 4;

/** Minimum fixes at target tier before early stop. */
export const GPS_MIN_SAMPLES_TARGET = 4;

/** Poll interval while waiting for a good fix (ms). */
export const GPS_SAMPLE_POLL_MS = 200;

/** Reject individual fixes older than this relative to capture time (ms). */
export const GPS_MAX_AGE_MS = 15_000;

/** Reject submit when capture is older than this (ms). */
export const GPS_CAPTURE_MAX_AGE_SUBMIT_MS = 15 * 60 * 1000;

/** Provider tag for Expo Go dev-preview captures (flow testing only — not submittable). */
export const GPS_DEV_PREVIEW_PROVIDER = 'expo-go-dev-preview';

/** Max accuracy (m) allowed for dev-preview captures on draft save. */
export const GPS_DEV_PREVIEW_MAX_ACCURACY_METERS = 10;
