/**
 * Survey GPS accuracy (meters). Shared with the mobile app via `@/convex/gpsAccuracy`.
 *
 * Fleet field surveys: target ±1 m pinpoint; accept best reading up to ±5 m.
 */
export const GPS_EXCELLENT_ACCURACY_METERS = 1;
export const GPS_TARGET_ACCURACY_METERS = 1;
export const GPS_ACCEPT_MAX_ACCURACY_METERS = 5;

/** @deprecated Use GPS_ACCEPT_MAX_ACCURACY_METERS — kept for existing imports */
export const GPS_MAX_ACCURACY_METERS = GPS_ACCEPT_MAX_ACCURACY_METERS;

/** Max spread (m) between fused fixes — rejects jittery readings even when accuracy reports ≤ accept max. */
export const GPS_MAX_FIX_SPREAD_METERS = 5.5;

/** Minimum fixes at ≤ accept max before accepting a reading. */
export const GPS_MIN_SAMPLES_ACCEPT = 1;

/** Minimum fixes at target tier before early stop. */
export const GPS_MIN_SAMPLES_TARGET = 1;

/** Minimum sampling time (ms) before accepting a fix — avoids single-spike acceptance. */
export const GPS_MIN_ELAPSED_ACCEPT_MS = 800;

/** Max time to refine a fix on the first pass (ms) — one-click capture window. */
export const GPS_SAMPLE_DURATION_MS = 12_000;

/** Extra sampling window on automatic retry (ms) — disabled; one tap = one pass. */
export const GPS_RETRY_DURATION_MS = 0;

/** Retake — GNSS is usually warm; shorter windows (few seconds when signal is good). */
export const GPS_RETAKE_SAMPLE_DURATION_MS = 5_000;

export const GPS_RETAKE_RETRY_DURATION_MS = 0;

/** Absolute ceiling for an entire capture attempt including warm-up (ms). */
export const GPS_ABSOLUTE_TIMEOUT_MS = GPS_SAMPLE_DURATION_MS + 10_000;

export const GPS_RETAKE_ABSOLUTE_TIMEOUT_MS = GPS_RETAKE_SAMPLE_DURATION_MS + 5_000;

/** Minimum GNSS warmup on the GPS wizard step before Capture is enabled (ms). */
export const GPS_WARMUP_GATE_MS = 3_000;

/** Poll interval while waiting for a good fix (ms). */
export const GPS_SAMPLE_POLL_MS = 150;

/** Reject individual fixes older than this relative to capture time (ms). */
export const GPS_MAX_AGE_MS = 15_000;

/** Reject submit when capture is older than this (ms). */
export const GPS_CAPTURE_MAX_AGE_SUBMIT_MS = 15 * 60 * 1000;

/** Provider tag for Expo Go dev-preview captures (flow testing only — not submittable). */
export const GPS_DEV_PREVIEW_PROVIDER = 'expo-go-dev-preview';

/** Max accuracy (m) allowed for dev-preview captures on draft save. */
export const GPS_DEV_PREVIEW_MAX_ACCURACY_METERS = 10;
