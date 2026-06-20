import { useMemo } from 'react';

/** Stable client clock for Convex queries that need "today" boundaries. */
export function useClientNowMs(): number {
  return useMemo(() => Date.now(), []);
}
