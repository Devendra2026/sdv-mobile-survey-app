/**
 * Ensures unavailable-location failures use actionable field guidance.
 * Imports the real locationErrorMessage — run via: npx tsx ./scripts/verify-gps-error-messages.ts
 */
import { locationErrorMessage } from '../src/utils/gpsLocationErrors';

let failed = false;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[verify-gps-error-messages] FAIL — ${msg}`);
    failed = true;
  }
}

const permissionError = new Error('Location permission is required to continue');
const servicesError = new Error('Turn on device location services');
const noFixError = new Error('Could not get a GPS fix — move to open sky and try again');

const permissionMsg = locationErrorMessage(permissionError, true);
const servicesMsg = locationErrorMessage(servicesError, true);
const noFixMsg = locationErrorMessage(noFixError, true);

assert(permissionMsg.includes('permission'), 'permission message must mention permission');
assert(servicesMsg.includes('enable Location Services'), 'services message must prompt enabling location');
assert(noFixMsg.includes('enable Location Services'), 'no-fix message must prompt enabling location');
assert(!permissionMsg.includes('±'), 'messages must not reference accuracy thresholds');
assert(!servicesMsg.includes('Expo Go'), 'unavailable messages must not mention Expo Go');

if (failed) {
  process.exit(1);
}

console.log('[verify-gps-error-messages] OK — unavailable-location GPS error text is correct.');
