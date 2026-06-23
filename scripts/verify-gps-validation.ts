/**
 * Ensures submit-time GPS validation accepts any accuracy and Expo Go provider tag;
 * still blocks mock and stale captures.
 * Run via: npm run verify:gps-validation
 */
import { GPS_CAPTURE_MAX_AGE_SUBMIT_MS, GPS_DEV_PREVIEW_PROVIDER } from '../convex/gpsAccuracy';
import { validateGpsCapture } from '../convex/lib/gpsValidation';

let failed = false;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[verify-gps-validation] FAIL — ${msg}`);
    failed = true;
  }
}

const now = Date.now();
const validFix = {
  latitude: 27.1767,
  longitude: 78.0081,
  accuracyMeters: 50,
  capturedAt: now,
  provider: 'device',
};

assert(
  validateGpsCapture(validFix, { strict: true, now }).length === 0,
  'strict submit must accept poor accuracy when coordinates are valid',
);

assert(
  !validateGpsCapture(validFix, { strict: true, now })[0]?.includes('±'),
  'strict submit must not mention accuracy thresholds',
);

const mockFix = { ...validFix, isMockLocation: true };
assert(
  validateGpsCapture(mockFix, { strict: true, now }).some((m) => /mock/i.test(m)),
  'mock GPS must be rejected on strict submit',
);

const staleFix = { ...validFix, capturedAt: now - GPS_CAPTURE_MAX_AGE_SUBMIT_MS - 1 };
assert(
  validateGpsCapture(staleFix, { strict: true, now }).some((m) => /too old/i.test(m)),
  'stale GPS must be rejected on strict submit',
);

const devPreviewFix = { ...validFix, provider: GPS_DEV_PREVIEW_PROVIDER };
assert(
  validateGpsCapture(devPreviewFix, { strict: true, now }).length === 0,
  'Expo Go dev-preview GPS must be accepted on strict submit (provider is audit-only)',
);

const freshForStep = { ...validFix, capturedAt: now };
assert(
  validateGpsCapture(freshForStep, { strict: true, now }).length === 0,
  'strict step completion accepts fresh GPS',
);

const staleForStep = { ...validFix, capturedAt: now - GPS_CAPTURE_MAX_AGE_SUBMIT_MS - 1 };
assert(
  validateGpsCapture(staleForStep, { strict: true, now }).length > 0,
  'strict step completion rejects stale GPS (matches isGpsStepComplete)',
);

if (failed) {
  process.exit(1);
}

console.log('[verify-gps-validation] OK — submit accepts coordinates only; mock/stale still blocked.');
