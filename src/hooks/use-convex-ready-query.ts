import { useQuery } from 'convex/react';
import type { FunctionReference } from 'convex/server';
import { useClerkConvexAuth } from './use-clerk-convex-auth';

/** Subscribes to a Convex query only after Clerk JWT is accepted. */
export function useConvexReadyQuery(query: FunctionReference<'query'>, args?: 'skip' | Record<string, unknown>) {
  const { convexReady } = useClerkConvexAuth();
  return useQuery(query, !convexReady || args === 'skip' ? 'skip' : (args ?? {}));
}
