/**
 * Unit checks for convexMutationRetry (no device/APK required).
 */
import assert from 'node:assert/strict';
import { withMutationRetry } from '../src/utils/convexMutationRetry';

async function run() {
  let attempts = 0;
  const value = await withMutationRetry(async () => {
    attempts += 1;
    if (attempts < 2) throw new Error('fetch failed');
    return 'ok';
  });
  assert.equal(value, 'ok');
  assert.equal(attempts, 2);

  let permanentAttempts = 0;
  await assert.rejects(
    () =>
      withMutationRetry(async () => {
        permanentAttempts += 1;
        throw new Error('FORBIDDEN: not allowed');
      }),
    /FORBIDDEN/,
  );
  assert.equal(permanentAttempts, 1);

  console.log('[verify-mutation-retry] OK — retry and non-retry paths behave as expected');
}

run().catch((err) => {
  console.error('[verify-mutation-retry] FAIL —', err);
  process.exit(1);
});
