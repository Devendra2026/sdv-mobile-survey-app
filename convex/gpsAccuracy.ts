/**
 * Survey GPS constants shared with the mobile app via `@/convex/gpsAccuracy`.
 */

/** Reject submit when capture is older than this (ms). */
export const GPS_CAPTURE_MAX_AGE_SUBMIT_MS = 15 * 60 * 1000;

/** Provider tag for Expo Go captures — audit only, not a submit blocker. */
export const GPS_DEV_PREVIEW_PROVIDER = 'expo-go-dev-preview';
