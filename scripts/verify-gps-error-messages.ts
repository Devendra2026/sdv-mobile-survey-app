/**
 * Ensures fleet APK accuracy failures use production field guidance (not inverted Expo Go text).
 * Imports the real locationErrorMessage — run via: npx tsx ./scripts/verify-gps-error-messages.ts
 */
import { GpsAccuracyError } from '../src/utils/gpsAccuracyError';
import { locationErrorMessage } from '../src/utils/gpsLocationErrors';

const base = 'Only 0 reading(s) at ≤ ±1 m (need 2). Hold still at the boundary in open sky.';
const accuracyError = new GpsAccuracyError(12, 1, base);

const productionMsg = locationErrorMessage(accuracyError, true, false);
const devPreviewMsg = locationErrorMessage(accuracyError, true, true);

let failed = false;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[verify-gps-error-messages] FAIL — ${msg}`);
    failed = true;
  }
}

assert(productionMsg.includes('High accuracy location'), 'fleet message must mention Android High accuracy location');
assert(!productionMsg.includes('Expo Go'), 'fleet message must NOT mention Expo Go');
assert(devPreviewMsg.includes('Expo Go dev preview'), 'dev preview message must mention Expo Go dev preview');
assert(devPreviewMsg.includes('fleet APK'), 'dev preview message must direct users to fleet APK');
assert(!devPreviewMsg.includes('High accuracy location'), 'dev preview message must not use production suffix');

// Guard against the ca12f47 inversion: fleet must never get Expo Go suffix when devPreview is false.
assert(
  !locationErrorMessage(accuracyError, true, false).includes('cannot guarantee'),
  'fleet branch must not use inverted Expo Go wording',
);

if (failed) {
  process.exit(1);
}

console.log('[verify-gps-error-messages] OK — production vs dev-preview GPS error text is correct.');
