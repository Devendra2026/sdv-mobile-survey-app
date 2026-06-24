/**
 * Retry Convex mutations / network calls on transient field-network failures.
 */
const DEFAULT_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /fetch failed|network request failed|network error|timeout|timed out|ECONNRESET|ETIMEDOUT/i.test(msg) ||
    /Photo upload failed — check your connection/i.test(msg) ||
    /Could not reach|connection/i.test(msg)
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withMutationRetry<T>(fn: () => Promise<T>, opts?: { attempts?: number }): Promise<T> {
  const attempts = opts?.attempts ?? DEFAULT_ATTEMPTS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isTransientError(err) || attempt >= attempts) {
        throw err;
      }
      await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}
