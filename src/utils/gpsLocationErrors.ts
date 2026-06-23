/** User-facing GPS capture error text — exported for field verification scripts. */
export function locationErrorMessage(e: unknown, isOnline: boolean): string {
  if (e instanceof Error) {
    if (!isOnline && /network|offline|internet/i.test(e.message)) {
      return 'No network connection. GPS still works offline — ensure location services are enabled.';
    }
    if (/permission/i.test(e.message)) {
      return 'Location permission denied. Open Settings → Apps → Survey App → Permissions → Location → Allow.';
    }
    if (/location services|Turn on device location/i.test(e.message)) {
      return 'Unable to get location. Please enable Location Services.';
    }
    if (/mock/i.test(e.message)) {
      return e.message;
    }
    if (/timed out|Could not get a GPS fix/i.test(e.message)) {
      return 'Unable to get location. Please enable Location Services.';
    }
    return e.message;
  }
  return 'Unable to get location. Please enable Location Services.';
}
